import { extendSchema } from "postgraphile/utils";
import { access, constant, object } from "postgraphile/grafast";
import { withPgClientTransaction } from "postgraphile/@dataplan/pg";

export const MyRegisterUserMutationPlugin = extendSchema((build) => {
  const { sql } = build;
  const { users } = build.input.pgRegistry.pgResources;
  const { executor } = users;
  // Or: `const executor = build.input.pgRegistry.pgExecutors.main;`
  return {
    typeDefs: /* GraphQL */ `
      input RegisterUserInput {
        sub: String!
        email: String!
        bio: String
      }

      type RegisterUserPayload {
        user: User
        query: Query
      }

      extend type Mutation {
        registerUser(input: RegisterUserInput!): RegisterUserPayload
      }
    `,
    objects: {
      Mutation: {
        plans: {
          registerUser(_, fieldArgs) {
            const $input = fieldArgs.getRaw("input");
            const $user = withPgClientTransaction(
              executor,
              $input,
              async (pgClient, input) => {
                // Our custom logic to register the user:
                const {
                  rows: [user],
                } = await pgClient.query({
                  text: `
                  INSERT INTO public.users (sub, email)
                  VALUES ($1, $2)
                  RETURNING *`,
                  values: [input.sub, input.email],
                });

                // Send the email. If this fails then the error will be caught
                // and the transaction rolled back; it will be as if the user
                // never registered
                await mockSendEmail(
                  input.email,
                  "Welcome to my site",
                  `You're user ${(user as any).sub} - thanks for being awesome`
                );

                // Return the newly created user
                return user;
              }
            );

            // To allow for future expansion (and for the `clientMutationId`
            // field to work), we'll return an object step containing our data:
            return object({ user: $user });
          },
        },
      },

      // The payload also needs plans detailing how to resolve its fields:
      RegisterUserPayload: {
        plans: {
          user($data) {
            const $user = $data.get("user");
            // It would be tempting to return $user here, but the step class
            // is not compatible with the auto-generated `User` type, so
            // errors will occur. We must ensure that we return a compatible
            // step, so we will retrieve the relevant record from the database:

            // Get the '.sub' property from $user:
            const $userSub = access($user, "sub");

            // Return a step representing this row in the database.
            return users.get({ sub: $userSub });
          },
          query($user) {
            // Anything truthy should work for the `query: Query` field.
            return constant(true);
          },
        },
      },
    },
  };
});

async function mockSendEmail(
  to: string,
  subject: string,
  body: string
): Promise<void> {
  console.log(
    `Sending email to ${to} with subject ${subject} and body ${body}`
  );
  // In a real implementation, you would send the email here.
  return;
}
