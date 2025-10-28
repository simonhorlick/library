import { printSchemaWithDirectives } from "@graphql-tools/utils";
import fs from "fs/promises";

export const ExportGqlSchemaPlugin: GraphileConfig.Plugin = {
  name: `ExportGqlSchemaPlugin`,
  version: "0.0.0",
  schema: {
    hooks: {
      finalize: {
        callback: (schema) => {
          const gqlSchema = printSchemaWithDirectives(schema);

          fs.writeFile("../backend.graphql", gqlSchema);

          schema.description = `The library backend API.`;

          return schema;
        },
      },
    },
  },
};
