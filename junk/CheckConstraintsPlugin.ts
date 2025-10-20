import { ConstArgumentNode, GraphQLSchema, Kind } from "graphql";
import { gatherConfig, GatherPluginContext } from "graphile-build";
import type { PgConstraint } from "pg-introspection";
import { withPgClientFromPgService } from "@dataplan/pg";
import { parseCheckConstraint } from "./parse";
import { toSNode } from "./ast";
import { extractConstraintsFromAST } from "./constraints";
import { PgIntrospectionPlugin } from "graphile-build-pg";
import { constraintDirective } from "./directive";
import { processSchema } from "postgraphile/utils";

interface State {
  checkConstraints: Set<PgConstraint & { body: string; parsed: any }>;
}

declare global {
  namespace GraphileConfig {
    interface GatherHelpers {
      constraintDirectivePlugin: {
        getCheckConstraints(
          info: GatherPluginContext<State, any>
        ): Set<PgConstraint & { body: string; parsed: any }>;
        fetchConstraintBodies(info: GatherPluginContext<State, any>): Promise<
          Array<{
            oid: string;
            def: string;
            parsed: any;
            pgServiceName: string | null;
          }>
        >;
      };
    }
  }
  namespace GraphileBuild {
    interface BuildInput {
      checkConstraints: Set<PgConstraint & { body: string; parsed: any }>;
    }
  }
}

export const ConstraintDirectiveTypeDefsPlugin: GraphileConfig.Plugin = {
  name: `ConstraintDirectiveTypeDefsPlugin`,
  version: "0.0.0",
  schema: {
    hooks: {
      finalize: {
        callback: (schema) => {
          // Append directive to schema
          schema = new GraphQLSchema({
            ...schema.toConfig(),
            directives: [...schema.getDirectives(), constraintDirective],
          });

          return schema;
        },
      },
    },
  },
};

export const ConstraintDirectivePlugin: GraphileConfig.Plugin = {
  name: "ConstraintDirectivePlugin",
  description: "Adds `@constraint` directives to input fields.",
  version: "0.0.1",
  after: ["PgIntrospectionPlugin"],

  gather: gatherConfig({
    namespace: "constraintDirectivePlugin",

    initialState: (): State => ({
      checkConstraints: new Set(),
    }),

    helpers: {
      getCheckConstraints(
        info
      ): Set<PgConstraint & { body: string; parsed: any }> {
        return info.state.checkConstraints;
      },
      async fetchConstraintBodies(
        info
      ): Promise<
        Array<{ oid: string; def: string; parsed: any; pgServiceName: string }>
      > {
        const pgServices = info.resolvedPreset.pgServices as any;
        if (!pgServices) {
          return [];
        }

        const all = await Promise.all(
          pgServices.map(async (pgService: any) => {
            // Fetch the bodies of all CHECK constraints in this database.
            const result = await withPgClientFromPgService(
              pgService,
              pgService.pgSettingsForIntrospection ?? null,
              (client) =>
                client.query<{ oid: string; def: string }>({
                  text: `SELECT oid::TEXT, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE contype = 'c'`,
                })
            );

            return await Promise.all(
              result.rows.map(async (row) => {
                // Parse the constraint into an AST.
                const parsed = await parseCheckConstraint(row.def);

                return {
                  ...row,
                  // Add service name
                  pgServiceName: pgService.name,
                  // Add parsed body
                  parsed: parsed,
                };
              })
            );
          })
        );

        return all.flat();
      },
    },

    async main(output, info) {
      // Pass the constraints to the build input.
      output.checkConstraints =
        info.helpers.constraintDirectivePlugin.getCheckConstraints(info);
    },

    hooks: {
      async pgIntrospection_introspection(info, event) {
        // Fetch the bodies of all check constraints in the database.
        const constraintBodies =
          await info.helpers.constraintDirectivePlugin.fetchConstraintBodies(
            info
          );

        const checkConstraints = event.introspection.constraints.filter(
          (c) => c.contype === "c"
        );

        // Augment each constraint with its parsed body.
        info.state.checkConstraints = new Set(
          checkConstraints.map((c) => {
            const def = constraintBodies.find((cb) => cb.oid === c._id);

            return {
              ...c,
              body: def?.def || "",
              parsed: def?.parsed || null,
            };
          })
        );

        // Attach ids to each column so we can look them up later.
        event.introspection.attributes.forEach((attr) => {
          const smartTags = attr.getTags();
          smartTags.attrelid = attr.attrelid;
          smartTags.attnum = attr.attnum.toString();
        });
      },
    },
  }),

  schema: {
    hooks: {
      GraphQLInputObjectType_fields_field(field, build, context) {
        const {
          scope: { fieldName, pgAttribute },
          Self,
        } = context;

        // Skip anything that isn't an input object for a mutation (i.e.
        // conditions, orderings, etc).
        if (context.scope.isPgConnectionConditionInputField) {
          return field;
        }

        const checkConstraints = build.input.checkConstraints;

        // Figure out the set of constraints that apply to this field.

        // The number of the column. Ordinary columns are numbered from 1 up.
        const attnumstr = pgAttribute?.extensions?.tags?.attnum as string;
        // The table this column belongs to.
        const attrelid = pgAttribute?.extensions?.tags?.attrelid;
        if (!attnumstr || !attrelid) {
          return field;
        }
        const attnum = parseInt(attnumstr);

        const fieldConstraints = Array.from(checkConstraints).filter(
          (c) =>
            c.conrelid === attrelid /* table matches */ &&
            c.conkey?.includes(attnum) /* column is involved */
        );

        const constraints = fieldConstraints
          .map((con) => {
            const ast = toSNode(con.parsed);
            return extractConstraintsFromAST(ast, fieldName);
          })
          .map((con) => (con.success ? con.constraints : null))
          .filter((con) => con !== null)
          .flat();

        const args: ConstArgumentNode[] = [];
        for (const constraint of constraints) {
          if (constraint.equals !== undefined) {
            args.push({
              kind: Kind.ARGUMENT,
              name: { kind: Kind.NAME, value: "equals" },
              value: {
                kind: Kind.INT,
                value: constraint.equals.toString(),
              },
            });
          }
          if (constraint.min !== undefined) {
            args.push({
              kind: Kind.ARGUMENT,
              name: { kind: Kind.NAME, value: "min" },
              value: {
                kind: Kind.INT,
                value: constraint.min.toString(),
              },
            });
          }
          if (constraint.max !== undefined) {
            args.push({
              kind: Kind.ARGUMENT,
              name: { kind: Kind.NAME, value: "max" },
              value: {
                kind: Kind.INT,
                value: constraint.max.toString(),
              },
            });
          }
          if (constraint.minLength !== undefined) {
            args.push({
              kind: Kind.ARGUMENT,
              name: { kind: Kind.NAME, value: "minLength" },
              value: {
                kind: Kind.INT,
                value: constraint.minLength.toString(),
              },
            });
          }
          if (constraint.maxLength !== undefined) {
            args.push({
              kind: Kind.ARGUMENT,
              name: { kind: Kind.NAME, value: "maxLength" },
              value: {
                kind: Kind.INT,
                value: constraint.maxLength.toString(),
              },
            });
          }
          if (constraint.exclusiveMin !== undefined) {
            args.push({
              kind: Kind.ARGUMENT,
              name: { kind: Kind.NAME, value: "exclusiveMin" },
              value: {
                kind: Kind.INT,
                value: constraint.exclusiveMin.toString(),
              },
            });
          }
          if (constraint.exclusiveMax !== undefined) {
            args.push({
              kind: Kind.ARGUMENT,
              name: { kind: Kind.NAME, value: "exclusiveMax" },
              value: {
                kind: Kind.INT,
                value: constraint.exclusiveMax.toString(),
              },
            });
          }
          if (constraint.oneOf !== undefined) {
            args.push({
              kind: Kind.ARGUMENT,
              name: { kind: Kind.NAME, value: "oneOf" },
              value: {
                kind: Kind.INT,
                value: constraint.oneOf.toString(),
              },
            });
          }
          if (constraint.pattern !== undefined) {
            args.push({
              kind: Kind.ARGUMENT,
              name: { kind: Kind.NAME, value: "pattern" },
              value: {
                kind: Kind.STRING,
                value: constraint.pattern,
              },
            });
          }
        }

        if (args.length === 0) {
          return field;
        }

        return build.extend(
          field,
          {
            // Add the directive.
            astNode: {
              kind: Kind.INPUT_VALUE_DEFINITION,
              name: { kind: Kind.NAME, value: fieldName },
              type: {
                kind: Kind.NAMED_TYPE,
                name: {
                  kind: Kind.NAME,
                  value: (field.type as any).name,
                },
              },

              ...(field.astNode || {}),
              directives: [
                ...(field.astNode?.directives || []),
                {
                  kind: Kind.DIRECTIVE,
                  name: { kind: Kind.NAME, value: "constraint" },
                  arguments: args,
                },
              ],
            },
          },
          `Adding @constraint to '${fieldName}' field in '${Self.name}'`
        );
      },
    },
  },
};
