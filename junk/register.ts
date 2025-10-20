import { sideEffectWithPgClient, withPgClient } from "@dataplan/pg";
import { extendSchema } from "postgraphile/utils";
import {
  ObjectStep,
  constant,
  object,
  ExecutableStep,
  access,
  list,
  get,
  lambda,
} from "postgraphile/grafast";
import { DatabaseError } from "pg";

export const RegisterUserPlugin = extendSchema((build) => {
  const { users } = build.input.pgRegistry.pgResources;
  const { executor } = users;
  // Or: `const executor = build.input.pgRegistry.pgExecutors.main;`
  return {
    typeDefs: /* GraphQL */ `
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
    objects: {
      Mutation: {
        plans: {
          registerUser(_, { $input: { $username, $email } }) {
            const $result = sideEffectWithPgClient(
              executor,
              list([$username, $email]),
              async (pgClient, [username, email]) => {
                try {
                  return await pgClient.withTransaction(async (pgClient) => {
                    const {
                      rows: [user],
                    } = await pgClient.query<{
                      id: string;
                      username: string;
                    }>({
                      text: `
                      insert into public.users (username, email)
                      values ($1, $2)
                      returning *`,
                      values: [username, email],
                    });

                    // TODO: Add an email job to the queue.

                    return { __typename: "User", id: user.id };
                  });
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
    unions: {
      // Planning our polymorphic type
      RegisterUserResult: {
        planType($obj) {
          // Determine the type
          const $__typename = lambda($obj, (obj: any) => obj.__typename);
          return {
            $__typename,
            planForType(t) {
              switch (t.name) {
                case "UsernameConflict":
                case "EmailAddressConflict":
                  // These types just use their objects directly
                  return $obj;

                case "User": {
                  // In this case, we need to get the record from the database
                  // associated with the given user id.
                  const $id = get($obj, "id") as any;
                  return users.get({ id: $id });
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
  };
});
