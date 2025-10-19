import "graphile-config";

import type {
  PgInsertSingleQueryBuilder,
  PgInsertSingleStep,
  PgResource,
} from "@dataplan/pg";
import { pgInsertSingle } from "@dataplan/pg";
import type { FieldArgs, ObjectStep } from "grafast";
import { assertExecutableStep } from "grafast";
import type { GraphQLOutputType, GraphQLObjectType } from "grafast/graphql";
import { EXPORTABLE } from "graphile-build";

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

export const PgMutationCreateWithConflictsPlugin: GraphileConfig.Plugin = {
  name: "PgMutationCreateWithConflictsPlugin",
  description:
    "Adds create mutations that return a union of the created record or constraint conflict details",
  version: "0.1.0",
  after: ["smart-tags"],

  inflection: {
    add: {
      createField(options, resource) {
        return this.camelCase(`create-${this.tableType(resource.codec)}`);
      },
      createInputType(options, resource) {
        return this.upperCamelCase(`${this.createField(resource)}-input`);
      },
      createPayloadType(options, resource) {
        return this.upperCamelCase(`${this.createField(resource)}-payload`);
      },
      createResultUnionType(options, resource) {
        return this.upperCamelCase(`${this.createField(resource)}-result`);
      },
      createConflictType(options, resource) {
        return this.upperCamelCase(`${this.createField(resource)}-conflict`);
      },
      tableFieldName(options, resource) {
        return this.camelCase(`${this.tableType(resource.codec)}`);
      },
    },
  },

  schema: {
    behaviorRegistry: {
      add: {
        "insert:resource:select": {
          description:
            "can select the row that was inserted (on the mutation payload)",
          entities: ["pgResource"],
        },
        record: {
          description: "record type used for insert",
          entities: ["pgResource"],
        },
      },
    },

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
      init(_, build) {
        const {
          graphql: { GraphQLString, GraphQLNonNull, isInputType },
          inflection,
          grafast: { get, lambda, list, object, trap, TRAP_ERROR },
        } = build;
        const insertableResources = Object.values(build.pgResources).filter(
          (resource) => isInsertable(build, resource)
        );

        insertableResources.forEach((resource) => {
          build.recoverable(null, () => {
            const tableTypeName = inflection.tableType(resource.codec);
            const inputTypeName = inflection.createInputType(resource);
            const tableFieldName = inflection.tableFieldName(resource);
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
                                  function plan(
                                    qb: PgInsertSingleQueryBuilder,
                                    arg
                                  ) {
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

            const conflictTypeName = inflection.createConflictType(resource);
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
                fields: ({ fieldWithHooks }) => ({
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
                  constraint: fieldWithHooks(
                    { fieldName: "constraint" },
                    () => ({
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
                    })
                  ),
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
                }),
              }),
              `PgMutationCreateWithConflictsPlugin conflict type for ${resource.name}`
            );

            const resultTypeName = inflection.createResultUnionType(resource);
            build.registerUnionType(
              resultTypeName,
              {},
              () => {
                const TableType = build.getGraphQLTypeByPgCodec(
                  resource.codec,
                  "output"
                ) as GraphQLOutputType | undefined;
                const ConflictType = build.getTypeByName(conflictTypeName) as
                  | GraphQLObjectType
                  | undefined;
                return {
                  description: build.wrapDescription(
                    `Outcome of attempting to create a \`${tableTypeName}\`.`,
                    "type"
                  ),
                  types: () =>
                    [TableType, ConflictType].filter(
                      (type): type is GraphQLObjectType => !!type
                    ),
                  planType: EXPORTABLE(
                    (get, lambda, list, tableTypeName, conflictTypeName) =>
                      function planType($specifier) {
                        const $row = get($specifier, "row");
                        const $conflict = get($specifier, "conflict");
                        const $__typename = lambda(
                          list([$row, $conflict]),
                          ([row]) =>
                            row != null ? tableTypeName : conflictTypeName,
                          true
                        );
                        return {
                          $__typename,
                          planForType(t) {
                            if (t.name === tableTypeName) {
                              return $row;
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
                };
              },
              `PgMutationCreateWithConflictsPlugin result union for ${resource.name}`
            );

            const payloadTypeName = inflection.createPayloadType(resource);
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
                  const TableType = build.getGraphQLTypeByPgCodec(
                    resource.codec,
                    "output"
                  ) as GraphQLOutputType | undefined;
                  const resultType = build.getOutputTypeByName(resultTypeName);
                  const fieldBehaviorScope = `insert:resource:select`;
                  return {
                    clientMutationId: {
                      type: GraphQLString,
                      plan: EXPORTABLE(
                        () =>
                          function plan(
                            $mutation: ObjectStep<{
                              insert: PgInsertSingleStep;
                            }>
                          ) {
                            const $insert = $mutation.get("insert");
                            return $insert.getMeta("clientMutationId");
                          },
                        []
                      ),
                    },
                    ...(resultType
                      ? {
                          result: fieldWithHooks(
                            {
                              fieldName: "result",
                              fieldBehaviorScope,
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
                    ...(TableType &&
                    build.behavior.pgResourceMatches(
                      resource,
                      fieldBehaviorScope
                    )
                      ? {
                          [tableFieldName]: fieldWithHooks(
                            {
                              fieldName: tableFieldName,
                              fieldBehaviorScope,
                            },
                            () => ({
                              description: `The \`${tableTypeName}\` that was created by this mutation, if successful.`,
                              type: TableType,
                              plan: EXPORTABLE(
                                () =>
                                  function plan($payload: ObjectStep<any>) {
                                    return $payload.get("result").get("row");
                                  },
                                []
                              ),
                              //   deprecationReason: tagToString(
                              //     resource.extensions?.tags?.deprecated
                              //   ),
                            })
                          ),
                        }
                      : null),
                  };
                },
              }),
              `PgMutationCreateWithConflictsPlugin payload for ${resource.name}`
            );
          });
        });

        return _;
      },

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
        if (!isRootMutation) {
          return fields;
        }

        const insertableResources = Object.values(build.pgResources).filter(
          (resource) => isInsertable(build, resource)
        );
        return insertableResources.reduce((memo, resource) => {
          return build.recoverable(memo, () => {
            const createFieldName = inflection.createField(resource);
            const payloadTypeName = inflection.createPayloadType(resource);
            const payloadType = build.getOutputTypeByName(payloadTypeName);
            const mutationInputType = build.getInputTypeByName(
              inflection.createInputType(resource)
            );
            const tableTypeName = inflection.tableType(resource.codec);

            const analyzeInsertError = EXPORTABLE(
              (tableTypeName) =>
                function analyze(value: any) {
                  if (
                    value &&
                    typeof value === "object" &&
                    "flags" in value &&
                    "value" in value
                  ) {
                    const error = (value as any).value;
                    if (error && typeof error === "object") {
                      const code = (error as any).code;
                      if (typeof code === "string" && code.startsWith("23")) {
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
                  }
                  return null;
                },
              [tableTypeName],
              "pgInsertAnalyzeConstraintError"
            );

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
                            function plan(
                              _: any,
                              $object: ObjectStep<{
                                insert: PgInsertSingleStep;
                                result: ObjectStep;
                              }>
                            ) {
                              return $object;
                            },
                          []
                        ),
                      },
                    },
                    type: payloadType,
                    description: `Creates a single \`${tableTypeName}\`.`,
                    // deprecationReason: tagToString(
                    //   resource.extensions?.tags?.deprecated
                    // ),
                    plan: EXPORTABLE(
                      (
                        object,
                        pgInsertSingle,
                        resource,
                        trap,
                        TRAP_ERROR,
                        lambda,
                        get,
                        analyzeInsertError
                      ) =>
                        function plan(_: any, args: FieldArgs) {
                          const $insert = pgInsertSingle(
                            resource,
                            Object.create(null)
                          );
                          args.apply($insert);

                          const $inspection = trap($insert, TRAP_ERROR, {
                            valueForError: "PASS_THROUGH",
                          });
                          const $errorDetails = lambda(
                            $inspection,
                            analyzeInsertError,
                            true
                          );
                          const $isConstraint = lambda(
                            $errorDetails,
                            (details) => details != null,
                            true
                          );
                          const $row = trap($insert, TRAP_ERROR, {
                            valueForError: "NULL",
                            if: $isConstraint,
                          });

                          const $conflict = object({
                            message: get($errorDetails, "message"),
                            code: get($errorDetails, "code"),
                            constraint: get($errorDetails, "constraint"),
                            detail: get($errorDetails, "detail"),
                          });

                          const $result = object({
                            row: $row,
                            conflict: $conflict,
                          });

                          const $payload = object({
                            insert: $insert,
                            result: $result,
                          });

                          return $payload;
                        },
                      [
                        object,
                        pgInsertSingle,
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
