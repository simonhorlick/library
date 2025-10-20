import { extendSchema } from "postgraphile/utils";
import {
  AbstractTypePlan,
  AbstractTypePlanner,
  get,
  lambda,
  makeGrafastSchema,
  ObjectPlan,
  Step,
  UnionPlan,
} from "postgraphile/grafast";

const typeDefs = /* GraphQL */ `
  type Query {
    dummy: String
  }

  type Mutation {
    signup(input: RegisterUserInput!): RegisterUserPayload
  }

  type User {
    sub: String!
    email: String!
  }

  input RegisterUserInput {
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
`;

const objects: { [typeName: string]: ObjectPlan<any> } = {
  Mutation: {
    plans: {
      signup(_, fieldArgs) {
        const { $email } = fieldArgs;
        return lambda([$email], ([email]) => {
          // Simulate user registration logic
          if (email === "conflict@example.com") {
            return {
              __typename: "EmailAddressConflict",
              message: "Email already in use",
              email,
            };
          }
          return { __typename: "User", id: "1", email };
        });
      },
    },
  },
};

const unions: { [typeName: string]: UnionPlan<any, any> } = {
  RegisterUserResult: {
    planType($specifier: Step<string>): AbstractTypePlanner {
      const $parsed = lambda($specifier, parseNodeId, true);
      const $__typename = get($parsed, "__typename");
      return {
        $__typename,
      };
    },
  },
};

function parseNodeId(nodeId: string) {
  const [__typename, rawId] = nodeId.split(":");
  const id = parseInt(rawId, 10);
  return { __typename, id };
}

export const schema = makeGrafastSchema({
  typeDefs,
  objects,
  unions,
});

export const RegisterUserPlugin = extendSchema((build) => {
  return {
    typeDefs,
    objects,
    unions,
  };
});
