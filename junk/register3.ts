import { sideEffectWithPgClient } from "@dataplan/pg";
import { extendSchema, gql } from "postgraphile/utils";
import {
  ObjectStep,
  constant,
  object,
  ExecutableStep,
  list,
  get,
  lambda,
  Step,
} from "postgraphile/grafast";
import { DatabaseError } from "pg";
import { GraphQLObjectType } from "grafast/graphql";

export const RegisterUserPlugin = extendSchema((build) => {
  const { users } = build.input.pgRegistry.pgResources;
  const executor = build.input.pgRegistry.pgExecutors.main;
  return {
    typeDefs: gql`
      extend type Mutation {
        registerUser(input: RegisterUserInput!): RegisterUserPayload
      }

      input RegisterUserInput {
        username: String!
        email: String!
      }

      type RegisterUserPayload {
        result: RegisterUserResult
        query: Query
      }

      union RegisterUserResult = User | UsernameConflict | EmailAddressConflict

      type UsernameConflict {
        message: String!
        username: String!
      }

      type EmailAddressConflict {
        message: String!
        email: String!
      }
    `,
    unions: {
      RegisterUserResult: {
        planType($specifier: Step<Record<string, any>>) {
          // Take the typename from the __typename property.
          const $__typename = lambda($specifier, (obj) => obj.__typename);
          return {
            $__typename,
            planForType(t: GraphQLObjectType) {
              switch (t.name) {
                case "UsernameConflict":
                case "EmailAddressConflict":
                  // These types just use their objects directly
                  return $specifier;

                case "User": {
                  // On success, RegisterUserResult returns
                  // { __typename: 'User', id }. We need to turn that into a
                  // User object based on the query selection set in the
                  // request.
                  const $id = get($specifier, "id") as any;
                  const $user = users.get({ id: $id });
                  return $user;
                }
                default: {
                  throw new Error(`Don't know how to plan ${t}`);
                }
              }
            },
          };
        },
      },
    },
    objects: {
      Mutation: {
        plans: {
          registerUser(_, { $input: { $username, $email } }) {
            const $result = sideEffectWithPgClient(
              executor,
              list([$username, $email]),
              async (pgClient, [username, email]) => {
                try {
                  const result = await pgClient.query<{
                    id: number;
                  }>({
                    text: `insert into public.users (username, email) values ($1, $2)  returning id`,
                    values: [username, email],
                  });

                  return { __typename: "User", id: result.rows[0].id };
                } catch (e) {
                  if (e instanceof DatabaseError && e.code === "23505") {
                    if (e.constraint === "unique_user_username") {
                      return {
                        __typename: "UsernameConflict",
                        message: `The username '${username}' is already in use`,
                        username,
                      };
                    } else if (e.constraint === "unique_user_email") {
                      return {
                        __typename: "EmailAddressConflict",
                        message: `The email address '${email}' is already in use`,
                        email,
                      };
                    }
                  }
                  throw e;
                }
              }
            );

            return object({ result: $result });
          },
        },
      },

      RegisterUserPayload: {
        assertStep: ObjectStep,
        plans: {
          query() {
            // The `Query` type just needs any truthy value.
            return constant(true);
          },
        },
      },

      UsernameConflict: {
        // Since User expects a step, our types must also expect a step. We
        // don't care what the step is though.
        assertStep: ExecutableStep,
      },
      EmailAddressConflict: {
        assertStep: ExecutableStep,
      },
    },
  };
});
