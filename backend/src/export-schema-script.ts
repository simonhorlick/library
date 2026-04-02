import { postgraphile } from "postgraphile";
import config from "./graphile.config.js";
import fs from "fs";
import { printSchemaWithDirectives } from "@graphql-tools/utils";

const pgl = postgraphile(config);
async function main() {
  const schema = await pgl.getSchema();
  const gqlContent = printSchemaWithDirectives(schema);
  console.log(gqlContent);
  // Dump the schema graphql to a file
  await fs.promises.writeFile("../backend.graphql", gqlContent);
}

main()
  .finally(() => pgl.release())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
