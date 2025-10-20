import { sideEffectWithPgClientTransaction, withPgClient } from "@dataplan/pg";
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
  makeGrafastSchema,
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
        sub: String!
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
          registerUser(_, { $input: { $sub, $email } }) {
            const $result = withPgClient(
              executor,
              list([$sub, $email]),
              async (pgClient, [sub, email]) => {
                try {
                  return await pgClient.withTransaction(async (pgClient) => {
                    const {
                      rows: [user],
                    } = await pgClient.query<{
                      id: string;
                      username: string;
                    }>({
                      text: `
                      insert into public.users (email,sub)
                      values ($1, $2)
                      returning *`,
                      values: [email, sub],
                    });

                    await sendEmail(email, "Welcome!");

                    return { id: user.id, __typename: "User" };
                  });
                } catch (e) {
                  if (e instanceof DatabaseError && e.code === "23505") {
                    if (e.constraint === "unique_user_username") {
                      return {
                        __typename: "UsernameConflict",
                        message: `The username is already in use`,
                        username: "username",
                      };
                    } else if (e.constraint === "unique_email") {
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
          const $__typename = lambda($obj, (obj: any) => {
            // If it has typename, use that
            if (obj.__typename) return obj.__typename;
            // Otherwise, if it has an id it must be a user
            if (obj.id != null) return "User";
            // Otherwise, no idea!
            throw new Error(`Could not determine type`);
          });
          return {
            $__typename,
            planForType(t) {
              switch (t.name) {
                case "UsernameConflict":
                  // These types just use their objects directly
                  return $obj;

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

async function sendEmail(email: string, message: string) {
  /*
    Write your email-sending logic here. Note that we recommend you enqueue a
    job to send the email rather than sending it directly; if you don't already
    have a job queue then check out https://worker.graphile.org
  */
}
