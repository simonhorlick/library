import { component$, Slot, useVisibleTask$ } from "@builder.io/qwik";
import type { RequestHandler } from "@builder.io/qwik-city";
import { register } from "~/instrumentation";

export const onGet: RequestHandler = async ({ cacheControl }) => {
  // Control caching for this request for best performance and to reduce hosting costs:
  // https://qwik.dev/docs/caching/
  cacheControl({
    // Always serve a cached response by default, up to a week stale
    staleWhileRevalidate: 60 * 60 * 24 * 7,
    // Max once every 5 seconds, revalidate on the server to get a fresh version of this page
    maxAge: 5,
  });
};

export default component$(() => {
  // Register the performance instrumentation early in the page load on the
  // browser side.
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(() => register(), { strategy: "document-ready" });

  return <Slot />;
});
