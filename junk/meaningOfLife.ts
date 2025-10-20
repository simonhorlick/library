import { extendSchema } from "postgraphile/utils";
import { constant } from "postgraphile/grafast";

export const MyPlugin = extendSchema((build) => {
  return {
    typeDefs: /* GraphQL */ `
      extend type Query {
        meaningOfLife: Int
      }
    `,

    objects: {
      Query: {
        plans: {
          meaningOfLife() {
            return constant(42);
          },
        },
      },
    },
  };
});
