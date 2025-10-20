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
} from "postgraphile/grafast";
import { DatabaseError } from "pg";

// TODO: Generate this from the codegen.
type RegisterUserInput = {
  username: string;
  email: string;
};

export const RegisterUserPlugin = extendSchema((build) => {
  // A reference to the users table.
  // it can be used like `users.get({ id: $userId })`
  const { users } = build.input.pgRegistry.pgResources;

  const { executor } = users;
  // Or: `const executor = build.input.pgRegistry.pgExecutors.main;`
  return {
    typeDefs: /* GraphQL */ `
      extend type Mutation {
        signup(input: RegisterUserInput!): RegisterUserPayload
      }

      input RegisterUserInput {
        username: String!
        email: String!
      }

      type RegisterUserPayload {
        result: RegisterUserResult
        query: Query
      }

      union RegisterUserResult = User | EmailAddressConflict

      type EmailAddressConflict {
        message: String!
        email: String!
      }
    `,
    objects: {
      Mutation: {
        plans: {
          registerUser(_, { $input: { $username, $email } }) {
            // Insert the user
            // If it fails with a unique violation, return an EmailAddressConflict
            // If it succeeds, return the user
            const sub = "id132";
            return users.get({ id: constant(sub) });
          },
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
