import { cloudflarePagesAdapter } from "@builder.io/qwik-city/adapters/cloudflare-pages/vite";
import { extendConfig } from "@builder.io/qwik-city/vite";
import baseConfig from "../../vite.config";

export default extendConfig(baseConfig, () => {
  return {
    build: {
      ssr: true,
      rollupOptions: {
        input: ["src/entry.cloudflare-pages.tsx", "@qwik-city-plan"],
        external: [
          // This is needed because the `@microlabs/otel-cf-workers` package
          // uses `buffer` and `events`. These are provided as polyfills by
          // specifying "nodejs_compat" in the runtime compatibility flags.
          "node:buffer",
          "node:events",
        ],
      },
    },
    plugins: [cloudflarePagesAdapter()],
  };
});
