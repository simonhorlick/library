import "graphile-config";

import type { PgInsertSingleQueryBuilder, PgResource } from "@dataplan/pg";
import { PgInsertSingleStep } from "@dataplan/pg";
import type {
  ExecutionDetails,
  GrafastResultsList,
  FieldArgs,
  ObjectStep,
} from "grafast";
import { assertExecutableStep, isPromiseLike } from "grafast";
import type { GraphQLObjectType } from "grafast/graphql";
import { EXPORTABLE } from "graphile-build";

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

// Extend the global GraphileConfig types to register this plugin and define
// the custom inflection methods and scope properties it provides.
declare global {
  namespace GraphileConfig {
    interface Plugins {
      PgMutationCreateWithConflictsPlugin: true;
    }
  }

  namespace GraphileBuild {
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
      createConflictType(
        this: Inflection,
        resource: PgResource<any, any, any, any, any>
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

// analyzeInsertError inspects an error to determine if it's a database
// constraint violation (PostgreSQL error codes starting with "23").
// If it is, the error is converted to a structured conflict object with
// message, code, constraint, and detail fields. If it's not a constraint
// error, returns null to indicate the error should be handled normally.
const makeAnalyzeInsertError = (tableTypeName: string) =>
  EXPORTABLE(
    (tableTypeName) =>
      function analyze(value: any) {
        let error: unknown = value;

        // Unwrap the error if it's wrapped in a flags/value structure
        // (which can happen with trapped errors).
        if (
          error &&
          typeof error === "object" &&
          "flags" in error &&
          "value" in error
        ) {
          error = (error as any).value;
        }

        // Check if this is a PostgreSQL constraint violation error.
        // PostgreSQL constraint errors have codes starting with "23":
        // - 23000: integrity_constraint_violation
        // - 23001: restrict_violation
        // - 23502: not_null_violation
        // - 23503: foreign_key_violation
        // - 23505: unique_violation
        // - 23514: check_violation
        if (error && typeof error === "object") {
          const code = (error as any).code;
          if (typeof code === "string" && code.startsWith("23")) {
            // Extract error details to provide meaningful feedback to clients.
            // Prefer the detail field for the message as it typically contains
            // more specific information about what caused the constraint violation.
            const message =
              typeof (error as any).detail === "string"
                ? (error as any).detail
                : typeof (error as any).message === "string"
                ? (error as any).message
                : `Insert into '${tableTypeName}' violated a database constraint`;
            return {
              message,
              code,
              constraint:
                (error as any).constraint != null
                  ? String((error as any).constraint)
                  : null,
              detail:
                typeof (error as any).detail === "string"
                  ? (error as any).detail
                  : null,
            };
          }
        }

        // Not a constraint error, return null to indicate this error should
        // be handled through normal error channels.
        return null;
      },
    [tableTypeName],
    "pgInsertAnalyzeConstraintError"
  );

// createConflictFields generates the GraphQL field definitions for the conflict type.
// These fields expose the details of database constraint violations to clients.
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
    code: fieldWithHooks({ fieldName: "code" }, () => ({
      type: GraphQLString,
      description: build.wrapDescription(
        "PostgreSQL error code describing the constraint failure.",
        "field"
      ),
      plan: EXPORTABLE(
        () =>
          function plan($conflict: ObjectStep) {
            return $conflict.get("code");
          },
        []
      ),
    })),
    constraint: fieldWithHooks({ fieldName: "constraint" }, () => ({
      type: GraphQLString,
      description: build.wrapDescription(
        "Name of the violated database constraint, if available.",
        "field"
      ),
      plan: EXPORTABLE(
        () =>
          function plan($conflict: ObjectStep) {
            return $conflict.get("constraint");
          },
        []
      ),
    })),
    detail: fieldWithHooks({ fieldName: "detail" }, () => ({
      type: GraphQLString,
      description: build.wrapDescription(
        "Further details supplied by PostgreSQL for this constraint violation.",
        "field"
      ),
      plan: EXPORTABLE(
        () =>
          function plan($conflict: ObjectStep) {
            return $conflict.get("detail");
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
  conflictTypeName: string
) => {
  build.registerObjectType(
    conflictTypeName,
    {
      pgTypeResource: resource,
    },
    () => ({
      assertStep: assertExecutableStep,
      description: build.wrapDescription(
        `Details of a database constraint preventing a \`${tableTypeName}\` from being created.`,
        "type"
      ),
      fields: createConflictFields(build),
    }),
    `PgMutationCreateWithConflictsPlugin conflict type for ${resource.name}`
  );
};

// registerResultUnionType creates and registers the union type representing
// either a successful insert or a constraint conflict.
const registerResultUnionType = (
  build: GraphileBuild.Build,
  resource: PgResource<any, any, any, any, any>,
  tableTypeName: string,
  resultTypeName: string,
  conflictTypeName: string
) => {
  const {
    grafast: { get, lambda, list },
  } = build;

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
        const ConflictType = build.getTypeByName(conflictTypeName) as
          | GraphQLObjectType
          | undefined;
        return [TableType, ConflictType].filter(
          (type): type is GraphQLObjectType => !!type
        );
      },

      // planType determines which type (table or conflict) should be returned
      // for a given result by checking if the conflict message is present.
      planType: EXPORTABLE(
        (get, lambda, list, tableTypeName, conflictTypeName) =>
          function planType($specifier) {
            const $row = get($specifier, "row");
            const $conflict = get($specifier, "conflict");
            const $insert = get($specifier, "insert");
            const $conflictMessage = get($conflict, "message");

            // Determine the __typename by checking if a conflict message exists.
            // If conflict.message is not null, we have a constraint violation.
            // Otherwise, the insert succeeded and we return the table type.
            const $__typename = lambda(
              list([$conflictMessage, $row]),
              ([conflictMessage]) =>
                conflictMessage != null ? conflictTypeName : tableTypeName,
              true
            );
            return {
              $__typename,

              // planForType returns the appropriate step for each union member type.
              // For the table type (successful insert), we return $insert which
              // provides proper field access to the inserted row's columns.
              // For the conflict type, we return $conflict which contains the
              // constraint violation details.
              planForType(t) {
                if (t.name === tableTypeName) {
                  return $insert;
                } else if (t.name === conflictTypeName) {
                  return $conflict;
                }
                throw new Error(
                  `Unexpected type '${t.name}' when resolving create result union`
                );
              },
            };
          },
        [get, lambda, list, tableTypeName, conflictTypeName]
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
// - Conflict type: Contains details about constraint violations (message, code, constraint, detail)
// - Result union type: Union of the table type and conflict type
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

      // Generate the conflict type name (e.g., "CreateBookConflict").
      createConflictType(options, resource) {
        return this.upperCamelCase(`${this.createField(resource)}-conflict`);
      },

      // Generate the table field name used in the input type (e.g., "book").
      tableFieldName(options, resource) {
        return this.camelCase(`${this.tableType(resource.codec)}`);
      },
    },
  },

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

        insertableResources.forEach((resource) => {
          build.recoverable(null, () => {
            const tableTypeName = inflection.tableType(resource.codec);
            const inputTypeName = inflection.createInputType(resource);
            const tableFieldName = inflection.tableFieldName(resource);
            const conflictTypeName = inflection.createConflictType(resource);
            const resultTypeName = inflection.createResultUnionType(resource);
            const payloadTypeName = inflection.createPayloadType(resource);

            // Register all necessary GraphQL types for this resource.
            registerInputType(
              build,
              resource,
              tableTypeName,
              inputTypeName,
              tableFieldName
            );
            registerConflictType(
              build,
              resource,
              tableTypeName,
              conflictTypeName
            );
            registerResultUnionType(
              build,
              resource,
              tableTypeName,
              resultTypeName,
              conflictTypeName
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
          grafast: { object, trap, TRAP_ERROR, lambda, get },
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
                    // deprecationReason: tagToString(
                    //   resource.extensions?.tags?.deprecated,
                    // ),

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

                          // Analyze the result to see if it's a constraint error.
                          // Returns structured conflict details or null.
                          const $errorDetails = lambda(
                            $inspection,
                            analyzeInsertError,
                            true
                          );

                          // Trap the insert again to get either the inserted row or NULL on error.
                          // This provides a fallback value for the union type discrimination.
                          const $row = trap($insert, TRAP_ERROR, {
                            valueForError: "NULL",
                          });

                          // Build the conflict object with error details extracted from the database error.
                          const $conflict = object({
                            message: get($errorDetails, "message"),
                            code: get($errorDetails, "code"),
                            constraint: get($errorDetails, "constraint"),
                            detail: get($errorDetails, "detail"),
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
