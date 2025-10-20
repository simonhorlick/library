import { processSchema } from "postgraphile/utils";
import {
  DirectiveLocation,
  GraphQLDirective,
  GraphQLInt,
  GraphQLSchema,
} from "grafast/graphql";

const lengthDirective = new GraphQLDirective({
  name: "length",
  locations: [
    DirectiveLocation.INPUT_FIELD_DEFINITION,
    DirectiveLocation.FIELD_DEFINITION,
  ],
  args: {
    min: {
      description: "Minimum length",
      type: GraphQLInt,
    },
    max: {
      description: "Maximum length",
      type: GraphQLInt,
    },
  },
  description: "Length constraints for a String field",
});

export const LengthDirectivePlugin = processSchema((schema) => {
  // Append directive to schema
  schema = new GraphQLSchema({
    ...schema.toConfig(),
    directives: [...schema.getDirectives(), lengthDirective],
  });

  return schema;
});
