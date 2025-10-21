import "graphile-config";

import type { PgInsertSingleQueryBuilder, PgResource } from "@dataplan/pg";
import { PgInsertSingleStep } from "@dataplan/pg";
import type {
  ExecutionDetails,
  GrafastResultsList,
  FieldArgs,
  ObjectStep,
  Step,
} from "grafast";
import { assertExecutableStep, isPromiseLike } from "grafast";
import type { GraphQLObjectType } from "grafast/graphql";
import { EXPORTABLE } from "graphile-build";
import { gatherConfig } from "graphile-build";
import { DatabaseError } from "pg";

type StepType = {
  row: any;
  conflict: { message: string; constraint: string };
  insert: any;
};

function tagToString(
  str: undefined | null | boolean | string | (string | boolean)[]
): string | undefined {
  if (!str || (Array.isArray(str) && str.length === 0)) {
    return undefined;
  }
  return Array.isArray(str) ? str.join("\n") : str === true ? " " : str;
}

// SafePgInsertSingleStep extends PgInsertSingleStep to handle database constraint
// violations gracefully by converting promise rejections into regular values.
// This allows constraint errors to be processed as union type results rather than
// being propagated to the GraphQL errors array.
//
// When a database constraint is violated (e.g., unique constraint, foreign key
// violation), PostgreSQL raises an error. Without this wrapper, the error would
// bubble up as a GraphQL error. By catching the rejection and returning the error
// object as a value, we can inspect it in the plan phase and determine whether to
// return the created record or conflict details.
class SafePgInsertSingleStep<
  TResource extends PgResource<any, any, any, any, any> = PgResource
> extends PgInsertSingleStep<TResource> {
  async execute(details: ExecutionDetails): Promise<GrafastResultsList<any>> {
    const results = await super.execute(details);

    // Map over the results to catch any rejected promises and convert them to values.
    // This is critical for preventing database errors from reaching the GraphQL
    // errors array.
    return details.indexMap((i) => {
      const value = results[i];
      if (isPromiseLike(value)) {
        // Catch promise rejections and return the error object as a regular value
        // so it can be analyzed later in the plan phase.
        return (value as Promise<any>).catch((error) => error);
      }
      return value;
    });
  }
}

// ConstraintInfo represents a database constraint that can cause insert conflicts.
// This includes primary keys and unique constraints.
interface ConstraintInfo {
  // Name of the constraint (e.g., "books_pkey", "unique_user_username").
  constraintName: string;
  // Name of the database table this constraint belongs to.
  tableName: string;
  // Type of constraint: 'p' for primary key, 'u' for unique.
  constraintType: "p" | "u";
  // Names of the columns involved in this constraint.
  columnNames: string[];
  // The GraphQL type name for the table (e.g., "Book", "User").
  // This is computed during schema generation based on inflection rules.
  tableTypeName?: string;
}

// Extend the global GraphileConfig types to register this plugin and define
// the custom inflection methods and scope properties it provides.
declare global {
  namespace GraphileConfig {
    interface Plugins {
      PgMutationCreateWithConflictsPlugin: true;
    }
    interface GatherHelpers {
      pgMutationCreateWithConflicts: {
        getConstraintsForTable(tableName: string): ConstraintInfo[];
      };
    }
  }

  namespace GraphileBuild {
    interface BuildInput {
      // Map from table name to array of constraints that can cause insert conflicts.
      pgInsertConflictConstraints?: Map<string, ConstraintInfo[]>;
    }
    interface ScopeObject {
      isPgCreatePayloadType?: boolean;
    }
    interface ScopeObjectFieldsField {
      isPgCreateMutation?: boolean;
    }
    interface Inflection {
      createField(
        this: Inflection,
        resource: PgResource<any, any, any, any, any>
      ): string;
      createInputType(
        this: Inflection,
        resource: PgResource<any, any, any, any, any>
      ): string;
      createPayloadType(
        this: Inflection,
        resource: PgResource<any, any, any, any, any>
      ): string;
      createResultUnionType(
        this: Inflection,
        resource: PgResource<any, any, any, any, any>
      ): string;
      // Generate conflict type name for a specific constraint (e.g., "IsbnConflict").
      constraintConflictType(
        this: Inflection,
        constraintInfo: ConstraintInfo
      ): string;
      tableFieldName(
        this: Inflection,
        resource: PgResource<any, any, any, any, any>
      ): string;
    }
  }
}

// isInsertable determines whether a given PostgreSQL resource (table/view) should
// have create mutations generated for it. Resources are considered insertable if they:
// - Are not parameterized (functions)
// - Have attributes (columns)
// - Are not polymorphic types
// - Are not anonymous types
// - Match the "resource:insert" behavior
const isInsertable = (
  build: GraphileBuild.Build,
  resource: PgResource<any, any, any, any, any>
) => {
  if (resource.parameters) return false;
  if (!resource.codec.attributes) return false;
  if (resource.codec.polymorphism) return false;
  if (resource.codec.isAnonymous) return false;
  return build.behavior.pgResourceMatches(resource, "resource:insert") === true;
};

// Check if this is a PostgreSQL constraint violation error.
// PostgreSQL constraint errors have codes starting with "23":
// - 23000: integrity_constraint_violation
// - 23001: restrict_violation
// - 23502: not_null_violation
// - 23503: foreign_key_violation
// - 23505: unique_violation
// - 23514: check_violation
const isPostgresConstraintErrorCode = (code: string | undefined): boolean =>
  !!code && code.startsWith("23");

// analyzeInsertError inspects an error to determine if it's a database
// constraint violation (PostgreSQL error codes starting with "23").
// If it's not a constraint error, returns null to indicate the error should be
// handled normally.
const makeAnalyzeInsertError = (tableTypeName: string) =>
  EXPORTABLE(
    (tableTypeName) =>
      function analyze(error: any) {
        if (
          error instanceof DatabaseError &&
          isPostgresConstraintErrorCode(error.code) &&
          error.code !== "23514" // Exclude CHECK violations
        ) {
          return {
            message: error.detail,
            // The constraint name is used to identify which type to return in the union.
            constraint: error.constraint,
          };
        }

        // Not a constraint error, return null to indicate this error should
        // be handled through normal error channels.
        return null;
      },
    [tableTypeName],
    "pgInsertAnalyzeConstraintError"
  );

// createConflictFields generates the GraphQL field definitions for the conflict type.
// Only exposes the message field to API consumers. Internal details like error codes,
// constraint names, and database-specific details are intentionally hidden.
const createConflictFields = (build: GraphileBuild.Build) => {
  const {
    graphql: { GraphQLString },
  } = build;

  return ({ fieldWithHooks }: any) => ({
    message: fieldWithHooks({ fieldName: "message" }, () => ({
      type: GraphQLString,
      description: build.wrapDescription(
        "Human-readable description of the conflict.",
        "field"
      ),
      plan: EXPORTABLE(
        () =>
          function plan($conflict: ObjectStep) {
            return $conflict.get("message");
          },
        []
      ),
    })),
  });
};

// registerInputType creates and registers the GraphQL input type for create mutations.
// This input type includes clientMutationId and the table's input fields.
const registerInputType = (
  build: GraphileBuild.Build,
  resource: PgResource<any, any, any, any, any>,
  tableTypeName: string,
  inputTypeName: string,
  tableFieldName: string
) => {
  const {
    graphql: { GraphQLString, GraphQLNonNull, isInputType },
  } = build;

  build.registerInputObjectType(
    inputTypeName,
    { isMutationInput: true },
    () => ({
      description: `All input for the create \`${tableTypeName}\` mutation.`,
      fields: ({ fieldWithHooks }) => {
        const TableInput = build.getGraphQLTypeByPgCodec(
          resource.codec,
          "input"
        );
        return {
          clientMutationId: {
            type: GraphQLString,
            apply: EXPORTABLE(
              () =>
                function apply(qb: PgInsertSingleQueryBuilder, val) {
                  qb.setMeta("clientMutationId", val);
                },
              []
            ),
          },
          ...(isInputType(TableInput)
            ? {
                [tableFieldName]: fieldWithHooks(
                  {
                    fieldName: tableFieldName,
                    fieldBehaviorScope: `insert:input:record`,
                  },
                  () => ({
                    description: build.wrapDescription(
                      `The \`${tableTypeName}\` to be created by this mutation.`,
                      "field"
                    ),
                    type: new GraphQLNonNull(TableInput),
                    apply: EXPORTABLE(
                      () =>
                        function plan(qb: PgInsertSingleQueryBuilder, arg) {
                          if (arg != null) {
                            return qb.setBuilder();
                          }
                        },
                      []
                    ),
                  })
                ),
              }
            : null),
        };
      },
    }),
    `PgMutationCreateWithConflictsPlugin input for ${resource.name}`
  );
};

// registerConflictType creates and registers the GraphQL type for constraint conflicts.
// This type contains error details when database constraints are violated.
const registerConflictType = (
  build: GraphileBuild.Build,
  resource: PgResource<any, any, any, any, any>,
  tableTypeName: string,
  conflictTypeName: string,
  description?: string
) => {
  build.registerObjectType(
    conflictTypeName,
    {
      pgTypeResource: resource,
    },
    () => ({
      assertStep: assertExecutableStep,
      description: build.wrapDescription(
        description ||
          `Details of a database constraint preventing a \`${tableTypeName}\` from being created.`,
        "type"
      ),
      fields: createConflictFields(build),
    }),
    `PgMutationCreateWithConflictsPlugin conflict type for ${resource.name}`
  );
};

// registerConstraintConflictTypes creates and registers individual GraphQL conflict types
// for each constraint on the resource (e.g., IsbnConflict, UsernameConflict).
const registerConstraintConflictTypes = (
  build: GraphileBuild.Build,
  resource: PgResource<any, any, any, any, any>,
  tableTypeName: string,
  constraints: ConstraintInfo[]
) => {
  const { inflection } = build;

  for (const constraint of constraints) {
    const conflictTypeName = inflection.constraintConflictType(constraint);
    const columnList =
      constraint.columnNames.length === 1
        ? constraint.columnNames[0]
        : `(` + constraint.columnNames.join(", ") + `)`;
    let description =
      `Failure to create a \`${tableTypeName}\` due to ` +
      `non-unique ${columnList}.`;

    registerConflictType(
      build,
      resource,
      tableTypeName,
      conflictTypeName,
      description
    );
  }
};

// registerResultUnionType creates and registers the union type representing
// either a successful insert or a constraint-specific conflict.
const registerResultUnionType = (
  build: GraphileBuild.Build,
  resource: PgResource<any, any, any, any, any>,
  tableTypeName: string,
  resultTypeName: string,
  constraints: ConstraintInfo[]
) => {
  const {
    inflection,
    grafast: { get, lambda, list },
  } = build;

  // Build a map from constraint name to conflict type name.
  const constraintToTypeName = new Map<string, string>();
  for (const constraint of constraints) {
    const conflictTypeName = inflection.constraintConflictType(constraint);
    constraintToTypeName.set(constraint.constraintName, conflictTypeName);
  }

  build.registerUnionType(
    resultTypeName,
    {},
    () => ({
      description: build.wrapDescription(
        `Outcome of attempting to create a \`${tableTypeName}\`.`,
        "type"
      ),
      types: () => {
        const TableType = build.getGraphQLTypeByPgCodec(
          resource.codec,
          "output"
        ) as GraphQLObjectType | undefined;

        // Include all constraint-specific conflict types in the union.
        const conflictTypes = constraints
          .map((constraint) => {
            const typeName = inflection.constraintConflictType(constraint);
            return build.getTypeByName(typeName) as
              | GraphQLObjectType
              | undefined;
          })
          .filter((type): type is GraphQLObjectType => !!type);

        return [TableType, ...conflictTypes].filter(
          (type): type is GraphQLObjectType => !!type
        );
      },

      // planType determines which type (table or constraint-specific conflict)
      // should be returned for a given result by examining the constraint name
      // in the error.
      planType: EXPORTABLE(
        (get, lambda, list, tableTypeName, constraintToTypeName) =>
          function planType($specifier: Step<StepType>) {
            const $row = get($specifier, "row");
            const $conflict = get($specifier, "conflict");
            const $insert = get($specifier, "insert");
            const $conflictMessage = get($conflict, "message");
            const $constraintName = get($conflict, "constraint");

            // Determine the __typename by examining the constraint name.
            // If there's a conflict, map the constraint name to the appropriate
            // conflict type. Otherwise, return the table type for successful inserts.
            const $__typename = lambda(
              list([$conflictMessage, $constraintName, $row]),
              ([conflictMessage, constraintName, row]) => {
                if (constraintName != null) {
                  // Look up the constraint-specific type name.
                  const conflictTypeName =
                    constraintToTypeName.get(constraintName);
                  if (!conflictTypeName) {
                    throw new Error(
                      `Unknown constraint '${constraintName}' for table '${tableTypeName}'`
                    );
                  }

                  return conflictTypeName;
                } else {
                  // Success type.
                  return tableTypeName;
                }
              },
              true
            );
            return {
              $__typename,

              // planForType returns the appropriate step for each union member type.
              // For the table type (successful insert), we return $insert which
              // provides proper field access to the inserted row's columns.
              // For any conflict type, we return $conflict which contains the
              // constraint violation details.
              planForType(t) {
                if (t.name === tableTypeName) {
                  return $insert;
                }
                // All conflict types use the same $conflict step.
                return $conflict;
              },
            };
          },
        [get, lambda, list, tableTypeName, constraintToTypeName]
      ),
    }),
    `PgMutationCreateWithConflictsPlugin result union for ${resource.name}`
  );
};

// registerPayloadType creates and registers the mutation payload type.
// This wraps the result union with clientMutationId.
const registerPayloadType = (
  build: GraphileBuild.Build,
  resource: PgResource<any, any, any, any, any>,
  tableTypeName: string,
  payloadTypeName: string,
  resultTypeName: string
) => {
  const {
    graphql: { GraphQLString },
  } = build;

  build.registerObjectType(
    payloadTypeName,
    {
      isMutationPayload: true,
      isPgCreatePayloadType: true,
      pgTypeResource: resource,
    },
    () => ({
      assertStep: assertExecutableStep,
      description: `The output of our create \`${tableTypeName}\` mutation.`,
      fields: ({ fieldWithHooks }) => {
        const resultType = build.getOutputTypeByName(resultTypeName);
        return {
          clientMutationId: {
            type: GraphQLString,
            plan: EXPORTABLE(
              () =>
                function plan(
                  $mutation: ObjectStep<{
                    clientMutationId: any;
                  }>
                ) {
                  return $mutation.get("clientMutationId");
                },
              []
            ),
          },
          ...(resultType
            ? {
                result: fieldWithHooks(
                  {
                    fieldName: "result",
                    fieldBehaviorScope: `insert:resource:select`,
                  },
                  () => ({
                    description: build.wrapDescription(
                      `What happened when attempting to create a \`${tableTypeName}\`.`,
                      "field"
                    ),
                    type: resultType,
                    plan: EXPORTABLE(
                      () =>
                        function plan($payload: ObjectStep<any>) {
                          return $payload.get("result");
                        },
                      []
                    ),
                  })
                ),
              }
            : null),
        };
      },
    }),
    `PgMutationCreateWithConflictsPlugin payload for ${resource.name}`
  );
};

// PgMutationCreateWithConflictsPlugin generates GraphQL create mutations that
// return a union type of either the created record or conflict details, instead
// of throwing errors when database constraints are violated.
//
// This plugin creates the following GraphQL types for each insertable resource:
// - Input type: Defines the structure of data to be inserted
// - Conflict types: One per constraint, detailing the violation
// - Result union type: Union of the table type and conflict types
// - Payload type: Wraps the result union with clientMutationId
//
// When an insert succeeds, the mutation returns the created record.
// When a constraint is violated (e.g., unique constraint, foreign key), the mutation
// returns conflict details instead of raising a GraphQL error.
export const PgMutationCreateWithConflictsPlugin: GraphileConfig.Plugin = {
  name: "PgMutationCreateWithConflictsPlugin",
  description:
    "Adds create mutations that return a union of the created record or constraint conflict details",
  version: "0.1.0",
  after: ["smart-tags"],

  // Define custom inflection methods for generating consistent GraphQL type and field names.
  // These methods are called by the plugin to create names for the various GraphQL
  // constructs (input types, payload types, conflict types, etc.).
  inflection: {
    add: {
      // Generate the mutation field name (e.g., "createBook").
      createField(options, resource) {
        return this.camelCase(`create-${this.tableType(resource.codec)}`);
      },

      // Generate the input type name (e.g., "CreateBookInput").
      createInputType(options, resource) {
        return this.upperCamelCase(`${this.createField(resource)}-input`);
      },

      // Generate the payload type name (e.g., "CreateBookPayload").
      createPayloadType(options, resource) {
        return this.upperCamelCase(`${this.createField(resource)}-payload`);
      },

      // Generate the result union type name (e.g., "CreateBookResult").
      createResultUnionType(options, resource) {
        return this.upperCamelCase(`${this.createField(resource)}-result`);
      },

      // Generate constraint-specific conflict type name based on the GraphQL type name
      // and column names involved in the constraint (e.g., "BookIsbnConflict",
      // "UserUsernameConflict"). This ensures uniqueness across tables.
      constraintConflictType(options, constraintInfo) {
        // Use the GraphQL type name (singular form) stored in constraintInfo.
        // This is populated during schema generation to ensure consistency.
        const tableTypeName =
          constraintInfo.tableTypeName ||
          this.upperCamelCase(constraintInfo.tableName);
        const columnPart = constraintInfo.columnNames
          .map((col) => this.upperCamelCase(col))
          .join("");
        return `${tableTypeName}${columnPart}Conflict`;
      },

      // Generate the table field name used in the input type (e.g., "book").
      tableFieldName(options, resource) {
        return this.camelCase(`${this.tableType(resource.codec)}`);
      },
    },
  },

  // Gather phase to collect constraint information from the database schema.
  gather: gatherConfig({
    namespace: "pgMutationCreateWithConflicts",
    initialState: () => ({
      constraintsByTable: new Map<string, ConstraintInfo[]>(),
    }),
    helpers: {
      // Helper to retrieve constraints for a specific table.
      getConstraintsForTable(info, tableName: string): ConstraintInfo[] {
        return info.state.constraintsByTable.get(tableName) || [];
      },
    },
    async main(output, info) {
      // Make the constraint information available in the build input.
      output.pgInsertConflictConstraints = info.state.constraintsByTable;
    },
    hooks: {
      pgIntrospection_introspection(info, event) {
        const { introspection } = event;

        // Iterate through all constraints and collect primary keys and unique constraints.
        for (const pgConstraint of introspection.constraints) {
          // Only process primary key ('p') and unique ('u') constraints.
          // These are the constraints that can cause insert conflicts.
          if (pgConstraint.contype !== "p" && pgConstraint.contype !== "u") {
            continue;
          }

          const pgClass = pgConstraint.getClass();
          if (!pgClass) {
            continue;
          }

          const tableName = pgClass.relname;
          const constraintName = pgConstraint.conname;

          // Get the column names involved in this constraint.
          const columnNames = (pgConstraint.conkey || [])
            .map((attnum) => {
              const attr = pgClass
                .getAttributes()
                .find((a) => a.attnum === attnum);
              return attr;
            })
            // Exclude constraints on GENERATED ALWAYS AS IDENTITY columns, as
            // they are not user-insertable and won't cause conflicts during
            // insert.
            .filter((attr) => attr?.attidentity !== "a")
            .map((attr) => attr?.attname)
            .filter((name): name is string => name != null);

          if (columnNames.length === 0) {
            continue;
          }

          const constraintInfo: ConstraintInfo = {
            constraintName,
            tableName,
            constraintType: pgConstraint.contype as "p" | "u",
            columnNames,
          };

          // Store the constraint in our state, grouped by table name.
          const existing = info.state.constraintsByTable.get(tableName) || [];
          existing.push(constraintInfo);
          info.state.constraintsByTable.set(tableName, existing);
        }
      },
    },
  }),

  schema: {
    // Register custom behavior tags that control plugin functionality.
    behaviorRegistry: {
      add: {
        // "insert:resource:select" allows selecting the inserted row in the mutation payload.
        "insert:resource:select": {
          description:
            "can select the row that was inserted (on the mutation payload)",
          entities: ["pgResource"],
        },

        // "record" marks a type as suitable for use in insert mutations.
        record: {
          description: "record type used for insert",
          entities: ["pgResource"],
        },
      },
    },

    // Configure default behaviors for PostgreSQL resources.
    // This determines which resources automatically get insert mutations generated.
    entityBehavior: {
      pgResource: {
        inferred: {
          provides: ["default"],
          before: ["inferred", "override"],
          callback(behavior, resource) {
            const newBehavior: GraphileBuild.BehaviorString[] = [
              behavior,
              "insert:resource:select",
            ];

            // Only enable insert behavior for standard tables (not functions,
            // polymorphic types, or anonymous types).
            if (
              !resource.parameters &&
              !!resource.codec.attributes &&
              !resource.codec.polymorphism &&
              !resource.codec.isAnonymous
            ) {
              newBehavior.unshift("insert");
              newBehavior.unshift("record");
            }
            return newBehavior;
          },
        },
      },
    },

    hooks: {
      // The init hook runs during schema building and registers all the GraphQL types
      // (input types, conflict types, union types, payload types) for insertable resources.
      // This happens before the actual mutation fields are added to the schema.
      init(_, build) {
        const { inflection } = build;

        // Find all PostgreSQL resources that should have create mutations generated.
        const insertableResources = Object.values(build.pgResources).filter(
          (resource) => isInsertable(build, resource)
        );

        // Get the constraint information collected during the gather phase.
        const constraintsByTable =
          build.input.pgInsertConflictConstraints || new Map();

        insertableResources.forEach((resource) => {
          build.recoverable(null, () => {
            const tableTypeName = inflection.tableType(resource.codec);
            const inputTypeName = inflection.createInputType(resource);
            const tableFieldName = inflection.tableFieldName(resource);
            const resultTypeName = inflection.createResultUnionType(resource);
            const payloadTypeName = inflection.createPayloadType(resource);

            // Get the constraints for this table. We need to know the actual table name
            // from the database, which is stored in the codec's name.
            const tableName = resource.codec.name;
            const constraints = (constraintsByTable.get(tableName) || []).map(
              (c: ConstraintInfo): ConstraintInfo => ({
                ...c,
                // Populate the GraphQL type name for use in inflection.
                tableTypeName,
              })
            );

            // Register all necessary GraphQL types for this resource.
            registerInputType(
              build,
              resource,
              tableTypeName,
              inputTypeName,
              tableFieldName
            );

            // Register individual conflict types for each constraint.
            registerConstraintConflictTypes(
              build,
              resource,
              tableTypeName,
              constraints
            );

            // Register the result union type that includes all constraint-specific types.
            registerResultUnionType(
              build,
              resource,
              tableTypeName,
              resultTypeName,
              constraints
            );

            registerPayloadType(
              build,
              resource,
              tableTypeName,
              payloadTypeName,
              resultTypeName
            );
          });
        });

        return _;
      },

      // The GraphQLObjectType_fields hook adds the actual mutation fields to the schema.
      // This runs after init, once all the types have been registered.
      GraphQLObjectType_fields(fields, build, context) {
        const {
          inflection,
          graphql: { GraphQLNonNull },
          grafast: { object, trap, TRAP_ERROR, lambda, get, list },
        } = build;
        const {
          scope: { isRootMutation },
          fieldWithHooks,
        } = context;

        // Only add mutation fields to the root Mutation type.
        if (!isRootMutation) {
          return fields;
        }

        const insertableResources = Object.values(build.pgResources).filter(
          (resource) => isInsertable(build, resource)
        );

        // Add a create mutation field for each insertable resource.
        return insertableResources.reduce((memo, resource) => {
          return build.recoverable(memo, () => {
            const createFieldName = inflection.createField(resource);
            const payloadTypeName = inflection.createPayloadType(resource);
            const payloadType = build.getOutputTypeByName(payloadTypeName);
            const mutationInputType = build.getInputTypeByName(
              inflection.createInputType(resource)
            );
            const tableTypeName = inflection.tableType(resource.codec);

            // Reuse the shared analyzer so constraint handling stays consistent across the plugin.
            const analyzeInsertError = makeAnalyzeInsertError(tableTypeName);

            return build.extend(
              memo,
              {
                [createFieldName]: fieldWithHooks(
                  {
                    fieldName: createFieldName,
                    fieldBehaviorScope: "resource:insert",
                    isPgCreateMutation: true,
                    pgFieldResource: resource,
                  },
                  {
                    args: {
                      input: {
                        type: new GraphQLNonNull(mutationInputType),
                        applyPlan: EXPORTABLE(
                          () =>
                            function plan(_: any, $object: ObjectStep<any>) {
                              return $object;
                            },
                          []
                        ),
                      },
                    },
                    type: payloadType,
                    description: `Creates a single \`${tableTypeName}\`.`,
                    deprecationReason: tagToString(
                      resource.extensions?.tags?.deprecated
                    ),

                    // The plan function executes during query planning and sets up the
                    // steps needed to handle both successful inserts and constraint violations.
                    plan: EXPORTABLE(
                      (
                        object,
                        SafePgInsertSingleStep,
                        resource,
                        trap,
                        TRAP_ERROR,
                        lambda,
                        get,
                        analyzeInsertError
                      ) =>
                        function plan(_: any, args: FieldArgs) {
                          // Create a SafePgInsertSingleStep to perform the database insert.
                          // This custom step catches promise rejections and converts them
                          // to regular values so errors don't propagate to the GraphQL errors array.
                          const $insert = new SafePgInsertSingleStep(
                            resource,
                            Object.create(null)
                          );

                          // Preserve the clientMutationId even if the insert fails.
                          // This allows clients to correlate responses with requests.
                          const $clientMutationIdInput = args.getRaw([
                            "input",
                            "clientMutationId",
                          ]);
                          const $clientMutationId = lambda(
                            $clientMutationIdInput,
                            (value) => (value == null ? null : value),
                            true
                          );

                          // Apply the input arguments to the insert step.
                          args.apply($insert);

                          // Trap the insert to catch errors and pass them through as values.
                          // PASS_THROUGH means the error object itself becomes the value.
                          const $inspection = trap($insert, TRAP_ERROR, {
                            valueForError: "PASS_THROUGH",
                          });

                          // Analyze the result to see if it's a constraint error and re-throw
                          // if it's not a handleable constraint violation.
                          // This lambda:
                          // 1. Calls analyzeInsertError to check if it's a handleable constraint
                          // 2. If it returns error details, returns { data: inspection, error: errorDetails }
                          // 3. If it returns null and inspection is an error, re-throws the error
                          // 4. Otherwise returns { data: inspection, error: null }
                          const $analyzed = lambda(
                            $inspection,
                            (inspection) => {
                              const errorDetails = analyzeInsertError(inspection);
                              
                              // If we have error details, the error was analyzed successfully
                              // and will be handled as a union type.
                              if (errorDetails !== null) {
                                return { data: inspection, error: errorDetails };
                              }
                              
                              // If errorDetails is null but inspection is an error, re-throw it.
                              // This covers CHECK constraints, NOT NULL, etc.
                              if (inspection instanceof Error) {
                                throw inspection;
                              }
                              
                              // Otherwise, this was a successful insert.
                              return { data: inspection, error: null };
                            },
                            true
                          );

                          // Extract the data portion (either the row or the error object)
                          const $dataOrError = lambda(
                            $analyzed,
                            (analyzed) => analyzed.data,
                            true
                          );

                          // Extract the error details
                          const $errorDetails = lambda(
                            $analyzed,
                            (analyzed) => analyzed.error,
                            true
                          );

                          // Trap again to get either the inserted row or NULL on error.
                          // This provides a fallback value for the union type discrimination.
                          const $row = trap($dataOrError, TRAP_ERROR, {
                            valueForError: "NULL",
                          });

                          // Build the conflict object with error details extracted from the database error.
                          const $conflict = object({
                            message: lambda(
                              $errorDetails,
                              (details) => details?.message ?? null,
                              true
                            ),
                            constraint: lambda(
                              $errorDetails,
                              (details) => details?.constraint ?? null,
                              true
                            ),
                          });

                          // Build the result object containing:
                          // - row: trapped insert result (NULL on error, row data on success)
                          // - conflict: structured conflict details (populated on error, null on success)
                          // - insert: the original insert step for proper field access
                          const $result = object({
                            row: $row,
                            conflict: $conflict,
                            insert: $insert,
                          });

                          // Build the final payload with clientMutationId and the result union.
                          const $payload = object({
                            clientMutationId: $clientMutationId,
                            result: $result,
                          });

                          return $payload;
                        },
                      [
                        object,
                        SafePgInsertSingleStep,
                        resource,
                        trap,
                        TRAP_ERROR,
                        lambda,
                        get,
                        analyzeInsertError,
                      ]
                    ),
                  }
                ),
              },
              `Adding create mutation with conflict handling for ${resource.name}`
            );
          });
        }, fields);
      },
    },
  },
};
