"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config = {
    schema: "./schema.graphql",
    documents: ["src/**/*.ts"],
    ignoreNoDocuments: true,
    generates: {
        "./src/__generated__/resolvers-types.ts": {
            plugins: ["typescript", "typescript-resolvers"],
            config: {
                useIndexSignature: true,
            },
        },
    },
};
exports.default = config;
//# sourceMappingURL=codegen.js.map