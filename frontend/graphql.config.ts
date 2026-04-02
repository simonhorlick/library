import { type CodegenConfig } from "@graphql-codegen/cli";
import { startsWith } from "valibot";

const config: CodegenConfig = {
  schema: ["../backend.graphql"],
  documents: ["src/**/*.tsx", "src/**/*.ts"],
  overwrite: true,
  ignoreNoDocuments: true,
  generates: {
    "./src/__generated__/valibot.ts": {
      plugins: ["typescript-validation-schema"],
      config: {
        importFrom: "./graphql",
        schema: "valibot",
        directives: {
          constraint: {
            minLength: ["minLength", "$1"],
            maxLength: ["maxLength", "$1"],
            exclusiveMin: ["minValue", "$1+1"],
            exclusiveMax: ["maxValue", "$1-1"],
            // pattern: ["regex", "new RegExp($1)"],
            pattern: ["regex", "/$1/"],
            min: ["minValue", "$1"],
            max: ["maxValue", "$1"],
            equals: ["value", "$1"],
            oneOf: ["values", "$1"],
            startsWith: ["startsWith", "$1"],
            endsWith: ["endsWith", "$1"],
          },
        },
        // withObjectType: true,
        scalarSchemas: {
          Date: "v.date()",
          Email: "v.pipe(v.string(), v.email())",
          Datetime: "v.pipe(v.string(), v.isoDateTime())",
        },
        scalars: {
          ID: {
            input: "string",
            output: "string",
          },
          Datetime: {
            input: "string",
            output: "string",
          },
          BigInt: {
            input: "string",
            output: "string",
          },
        },
      },
    },

    "./src/__generated__/": {
      preset: "client",
      presetConfig: {
        fragmentMasking: {
          // make the fragment masking function name less confusing
          unmaskFunctionName: "getFragmentData",
        },
      },
      config: {
        immutableTypes: true,
        documentMode: "string",
        scalars: {
          // Ensure we specify any hasura types here otherwise they'll default to any.
          timestamptz: "string", // "2022-03-22T16:51:01.472895+08:00"
          bigint: "number", // 284575443
          date: "string", // "2022-10-28"
          Datetime: "string",
          BigInt: "string",
        },
      },
    },
  },
};

export default config;
