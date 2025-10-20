import { sideEffectWithPgClient } from "@dataplan/pg";
import { extendSchema, gql } from "postgraphile/utils";
import {
  ObjectStep,
  constant,
  object,
  list,
  lambda,
  Step,
} from "postgraphile/grafast";
import { DatabaseError } from "pg";
import { GraphQLObjectType } from "grafast/graphql";

const constraintDirective = `        directive @constraint(
          # String constraints
          minLength: Int
          maxLength: Int
          startsWith: String
          endsWith: String
          contains: String
          notContains: String
          pattern: String
          format: String
          # Number constraints
          min: Float
          max: Float
          exclusiveMin: Float
          exclusiveMax: Float
          multipleOf: Float
          uniqueTypeName: String
        ) on INPUT_FIELD_DEFINITION | FIELD_DEFINITION
`;

export const RegisterUserPlugin = extendSchema((build) => {
  return {
    typeDefs: /* GraphQL */ `
      extend type Mutation {
        registerUser(input: RegisterUserInput!): RegisterUserPayload
      }

      input RegisterUserInput {
        """
        can generate client code using https://the-guild.dev/graphql/codegen/plugins/typescript/typescript-validation-schema
        # https://github.com/confuser/graphql-constraint-directive
        """
        username: String! @length(min: 3, max: 50)
        email: String! @length(min: 5, max: 255)
      }

      type RegisterUserPayload {
        result: RegisterUserResult
        query: Query
      }

      union RegisterUserResult =
          CreatedUser
        | UsernameConflict
        | EmailAddressConflict

      type CreatedUser {
        id: BigInt!
        username: String!
        email: String!
        bio: String
        createdAt: Datetime!
        updatedAt: Datetime!
      }

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

                case "CreatedUser": {
                  return $specifier;
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
              build.input.pgRegistry.pgExecutors.main,
              list([$username, $email]),
              async (pgClient, [username, email]) => {
                try {
                  const result = await pgClient.query<{
                    id: bigint;
                    username: string;
                    email: string;
                    bio: string | null;
                    created_at: Date;
                    updated_at: Date;
                  }>({
                    text: `insert into public.users (username, email) values ($1, $2) returning id, username, email, bio, to_char("created_at", 'YYYY-MM-DD"T"HH24:MI:SS.USTZH:TZM'::text) as created_at, to_char("updated_at", 'YYYY-MM-DD"T"HH24:MI:SS.USTZH:TZM'::text) as updated_at`,
                    values: [username, email],
                  });

                  return {
                    __typename: "CreatedUser",
                    id: result.rows[0].id,
                    username: result.rows[0].username,
                    email: result.rows[0].email,
                    bio: result.rows[0].bio,
                    createdAt: result.rows[0].created_at,
                    updatedAt: result.rows[0].updated_at,
                  };
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
      // UsernameConflict: {
      //   assertStep: ExecutableStep,
      // },
      // EmailAddressConflict: {
      //   assertStep: ExecutableStep,
      // },
    },
  };
});
