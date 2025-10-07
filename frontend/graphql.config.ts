import { type CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  schema: ["../backend.graphql"],
  documents: ["src/**/*.tsx", "src/**/*.ts"],
  overwrite: true,
  ignoreNoDocuments: true,
  generates: {
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
        },
      },
    },
  },
};

export default config;
