import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import { readFileSync } from "fs";
import { Resolvers, ResolversTypes } from "./__generated__/resolvers-types";
import { check_violation, unique_violation } from "./db";
import { DatabaseError } from "pg";
import { sql } from "drizzle-orm/sql";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  createApollo4QueryValidationPlugin,
  constraintDirectiveTypeDefs,
} from "graphql-constraint-directive/apollo4";
import * as schema from "./schema";

const typeDefs = readFileSync("./schema.graphql", { encoding: "utf-8" });

const head = <T>(xs: Array<T>): T | null => xs[0] ?? null;

const resolvers: Resolvers<Context> = {
  Mutation: {
    registerUser: async (_, args, ctx) => {
      console.log(`args is ${JSON.stringify(args)}`);

      try {
        return await ctx.db.transaction(
          async (tx) => {
            const result = await tx.execute<{
              id: string;
              username: string;
              email: string;
              bio: string;
              created_at: string;
              updated_at: string;
            }>(
              sql`insert into public.users (username, email) values (${args.input.username}, ${args.input.email}) returning id, username, email, bio, to_char("created_at", 'YYYY-MM-DD"T"HH24:MI:SS.USTZH:TZM'::text) as created_at, to_char("updated_at", 'YYYY-MM-DD"T"HH24:MI:SS.USTZH:TZM'::text) as updated_at`
            );

            return {
              __typename: "RegisterUserPayload",
              result: {
                __typename: "CreatedUser",
                id: result.rows[0].id,
                username: result.rows[0].username,
                email: result.rows[0].email,
                bio: result.rows[0].bio,
                createdAt: result.rows[0].created_at,
                updatedAt: result.rows[0].updated_at,
              },
            } satisfies ResolversTypes["RegisterUserPayload"];
          },
          // Lock the product rows until the transaction is committed.
          { isolationLevel: "repeatable read" }
        );
      } catch (e) {
        if (e instanceof DatabaseError) {
          if (e.code == check_violation) {
          } else if (e.code == unique_violation) {
            if (e.constraint === "unique_user_username") {
              return {
                __typename: "RegisterUserPayload",
                result: {
                  __typename: "UsernameConflict",
                  message: `The username '${args.input.username}' is already in use`,
                  username: args.input.username,
                },
              };
            } else if (e.constraint === "unique_user_email") {
              return {
                __typename: "RegisterUserPayload",
                result: {
                  __typename: "EmailAddressConflict",
                  message: `The email address '${args.input.email}' is already in use`,
                  email: args.input.email,
                },
              };
            }
          }
        }

        console.log(`${JSON.stringify(e)}`);

        // Unknown error.
        throw e;
      }
    },
  },
};

export interface Context {
  db: NodePgDatabase<typeof schema>;
}

export const createApolloServer = async (port: number, ctx: Context) => {
  const server = new ApolloServer<Context>({
    typeDefs: [constraintDirectiveTypeDefs, typeDefs],
    resolvers,
    // Serve an introspection endpoint so clients can fetch the schema
    // definitions.
    introspection: true,
    plugins: [createApollo4QueryValidationPlugin()],
  });
  const url = await startStandaloneServer(server, {
    context: async () => ctx,
    listen: { port: port },
  });
  return { server, url: url.url };
};
