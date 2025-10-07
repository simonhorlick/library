/*
 * WHAT IS THIS FILE?
 *
 * It's the entry point for Cloudflare Pages when building for production.
 *
 * Learn more about the Cloudflare Pages integration here:
 * - https://qwik.dev/docs/deployments/cloudflare-pages/
 *
 */
import {
  createQwikCity,
  type PlatformCloudflarePages,
} from "@builder.io/qwik-city/middleware/cloudflare-pages";
import qwikCityPlan from "@qwik-city-plan";
import { manifest } from "@qwik-client-manifest";
import render from "./entry.ssr";
import { instrument, type ResolveConfigFn } from "@microlabs/otel-cf-workers";

declare global {
  interface QwikCityPlatform extends PlatformCloudflarePages {}
}

type Env = PlatformCloudflarePages["env"] & {
  ASSETS: {
    fetch: (req: Request) => Response;
  };
};

const handler = {
  fetch: createQwikCity({ render, qwikCityPlan, manifest }),
};

const config: ResolveConfigFn = (env: Env) => {
  return {
    exporter: {
      url: import.meta.env.PUBLIC_OTEL_HTTP_COLLECTOR_URL,
    },
    service: { name: "frontend" },
  };
};
const instrumented = instrument(handler, config);

// Export fetch
export const fetch = instrumented.fetch;
