import "graphile-config";

import type {
  PgInsertSingleQueryBuilder,
  PgInsertSingleStep,
  PgResource,
} from "@dataplan/pg";
import { pgInsertSingle } from "@dataplan/pg";
import type { FieldArgs, ObjectStep } from "grafast";
import { assertExecutableStep, object } from "grafast";
import type { GraphQLOutputType } from "grafast/graphql";
import { EXPORTABLE } from "graphile-build";

declare global {
  namespace GraphileConfig {
    interface Plugins {
      PgMutationCreatePlugin: true;
    }
  }

  namespace GraphileBuild {
    interface BehaviorStrings {
      "insert:resource:select": true;
      record: true;
    }
    interface ScopeObject {
      isPgCreatePayloadType?: boolean;
    }
    interface ScopeObjectFieldsField {
      isPgCreateMutation?: boolean;
    }
    interface Inflection {
      createFieldPg2(
        this: Inflection,
        resource: PgResource<any, any, any, any, any>
      ): string;
      createInputTypePg2(
        this: Inflection,
        resource: PgResource<any, any, any, any, any>
      ): string;
      createPayloadTypePg2(
        this: Inflection,
        resource: PgResource<any, any, any, any, any>
      ): string;
      tableFieldNamePg2(
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

export const PgMutationCreatePlugin2: GraphileConfig.Plugin = {
  name: "PgMutationCreatePlugin2",
  description: "Adds 'create' mutation for supported table-like sources",
  version: "1.0.0",
  after: ["PgMutationCreatePlugin"],

  inflection: {
    add: {
      createFieldPg2(options, resource) {
        return this.camelCase(`create-${this.tableType(resource.codec)}-pg2`);
      },
      createInputTypePg2(options, resource) {
        return this.upperCamelCase(
          `${this.createFieldPg2(resource)}-input-pg2`
        );
      },
      createPayloadTypePg2(options, resource) {
        return this.upperCamelCase(
          `${this.createFieldPg2(resource)}-payload-pg2`
        );
      },
      tableFieldNamePg2(options, resource) {
        return this.camelCase(`${this.tableType(resource.codec)}-pg2`);
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
          inflection,
          graphql: { GraphQLString, GraphQLNonNull, isInputType },
        } = build;
        const insertableResources = Object.values(build.pgResources).filter(
          (resource) => isInsertable(build, resource)
        );

        insertableResources.forEach((resource) => {
          build.recoverable(null, () => {
            // i.e. Book
            const tableTypeName = inflection.tableType(resource.codec);
            // i.e. CreateBookPg2InputPg2
            const inputTypeName = inflection.createInputTypePg2(resource);
            // i.e. bookPg2
            const tableFieldName = inflection.tableFieldNamePg2(resource);
            build.registerInputObjectType(
              inputTypeName,
              { isMutationInput: true },
              () => ({
                description: `All input for the create \`${tableTypeName}\` mutation.`,
                fields: ({ fieldWithHooks }) => {
                  // i.e. BookInput (the GraphQL input type)
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
              `PgMutationCreatePlugin input for ${resource.name}`
            );

            // i.e. CreateBookPg2PayloadPg2
            const payloadTypeName = inflection.createPayloadTypePg2(resource);
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
                  // i.e. Book (the GraphQL type)
                  const TableType = build.getGraphQLTypeByPgCodec(
                    resource.codec,
                    "output"
                  ) as GraphQLOutputType | undefined;
                  const fieldBehaviorScope = `insert:resource:select`;
                  return {
                    clientMutationId: {
                      type: GraphQLString,
                      plan: EXPORTABLE(
                        () =>
                          function plan(
                            $mutation: ObjectStep<{
                              result: PgInsertSingleStep;
                            }>
                          ) {
                            const $insert = $mutation.getStepForKey("result");
                            return $insert.getMeta("clientMutationId");
                          },
                        []
                      ),
                    },
                    ...(TableType &&
                    build.behavior.pgResourceMatches(
                      resource,
                      fieldBehaviorScope
                    )
                      ? {
                          // i.e. bookPg2
                          [tableFieldName]: fieldWithHooks(
                            {
                              fieldName: tableFieldName,
                              fieldBehaviorScope,
                            },
                            {
                              description: `The \`${tableTypeName}\` that was created by this mutation.`,
                              type: TableType,
                              plan: EXPORTABLE(
                                () =>
                                  function plan(
                                    $object: ObjectStep<{
                                      result: PgInsertSingleStep;
                                    }>
                                  ) {
                                    return $object.get("result");
                                  },
                                []
                              ),
                              //   deprecationReason: tagToString(
                              //     resource.extensions?.tags?.deprecated
                              //   ),
                            }
                          ),
                        }
                      : null),
                  };
                },
              }),
              `PgMutationCreatePlugin2 payload for ${resource.name}`
            );
          });
        });

        return _;
      },

      GraphQLObjectType_fields(fields, build, context) {
        const {
          inflection,
          graphql: { GraphQLNonNull },
        } = build;
        const {
          scope: { isRootMutation },
          fieldWithHooks,
        } = context;
        if (!isRootMutation) {
          return fields;
        }

        const insertableSources = Object.values(build.pgResources).filter(
          (resource) => isInsertable(build, resource)
        );
        return insertableSources.reduce((memo, resource) => {
          return build.recoverable(memo, () => {
            // i.e. createBookPg2
            const createFieldName = inflection.createFieldPg2(resource);
            // i.e. CreateBookPg2PayloadPg2
            const payloadTypeName = inflection.createPayloadTypePg2(resource);
            // i.e. CreateBookPg2PayloadPg2
            const payloadType = build.getOutputTypeByName(payloadTypeName);
            // i.e. CreateBookPg2InputPg2
            const mutationInputType = build.getInputTypeByName(
              inflection.createInputTypePg2(resource)
            );

            return build.extend(
              memo,
              {
                // i.e. createBookPg2
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
                                result: PgInsertSingleStep;
                              }>
                            ) {
                              return $object;
                            },
                          []
                        ),
                      },
                    },
                    type: payloadType,
                    description: `Creates a single \`${inflection.tableType(
                      resource.codec
                    )}\`.`,
                    // deprecationReason: tagToString(
                    //   resource.extensions?.tags?.deprecated
                    // ),
                    plan: EXPORTABLE(
                      (object, pgInsertSingle, resource) =>
                        function plan(_: any, args: FieldArgs) {
                          const $insert = pgInsertSingle(
                            resource,
                            Object.create(null)
                          );
                          args.apply($insert);
                          const plan = object({
                            result: $insert,
                          });
                          return plan;
                        },
                      [object, pgInsertSingle, resource]
                    ),
                  }
                ),
              },
              `Adding create mutation for ${resource.name}`
            );
          });
        }, fields);
      },
    },
  },
};
