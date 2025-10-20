import { extendSchema } from "postgraphile/utils";
import { lambda, makeGrafastSchema, ObjectPlan } from "postgraphile/grafast";

const typeDefs = /* GraphQL */ `
  type Query {
    addTwoNumbers(a: Int!, b: Int!): Int
  }
`;

const objects: { [typeName: string]: ObjectPlan<any> } = {
  Query: {
    plans: {
      addTwoNumbers(_, fieldArgs) {
        const { $a, $b } = fieldArgs;
        return lambda([$a, $b], ([a, b]) => a + b);
      },
    },
  },
};

export const schema = makeGrafastSchema({
  typeDefs,
  objects,
});

export const RegisterUserPlugin = extendSchema((build) => {
  return {
    typeDefs: typeDefs,
    objects: objects,
  };
});
