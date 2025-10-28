import { printSchemaWithDirectives } from "@graphql-tools/utils";
import fs from "fs/promises";

const topLevelDescription = `The library backend API.

### Authorization

All endpoints expect a bearer token to be provided in the \`Authorization\` header.
To obtain a token you must authenticate users via an OpenID Connect flow against the authorization server found at dev-s8y8lvri.us.auth0.com.

### Mutations

Input objects are annotated with \`@constraint\` directives indicating the validation rules that will be applied.

When calling mutation endpoints make sure to check the result types.
Mutations that can fail due to runtime constraints will often return a union type that includes both a success and failure type.
Check the \`__typename\` of the result type to determine the correct action.

### Pagination

Connections are used for pagination.
They implement the Relay Cursor Connections Specification.
When querying a connection, you can use the \`first\`, \`after\`, \`last\` and \`before\` arguments to page through results.
The connection object contains \`pageInfo\` and \`edges\` fields to help with pagination.

### Filtering and Ordering

To filter results, use the \`condition\` argument on connections.
To order results, use the \`orderBy\` argument on connections.
Both arguments accept various options depending on the type of data being queried.
`;

export const ExportGqlSchemaPlugin: GraphileConfig.Plugin = {
  name: `ExportGqlSchemaPlugin`,
  version: "0.0.0",
  schema: {
    hooks: {
      finalize: {
        callback: (schema) => {
          schema.description = topLevelDescription;

          const gqlSchema = printSchemaWithDirectives(schema);

          fs.writeFile("../backend.graphql", gqlSchema);

          return schema;
        },
      },
    },
  },
};
