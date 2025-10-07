import { type RequestEvent } from "@builder.io/qwik-city";
import * as client from "openid-client";

// Build a redirect to the authorization server.
export const onGet = async ({ cookie, redirect, env }: RequestEvent) => {
  const config: client.Configuration = await client.discovery(
    new URL(import.meta.env.PUBLIC_AUTH_TOKEN_ISSUER),
    import.meta.env.PUBLIC_AUTH_CLIENT_ID,
    env.get("AUTH_CLIENT_SECRET")
  );

  const redirectTo = client.buildEndSessionUrl(config, {
    post_logout_redirect_uri: import.meta.env.PUBLIC_ORIGIN,
  });

  // now redirect the user to redirectTo.href
  console.log("Sending redirect to", redirectTo.href);

  // Delete the token as it's no longer valid.
  cookie.delete("token", {
    path: "/",
  });

  throw redirect(302, redirectTo.href);
};
