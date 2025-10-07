import { component$ } from "@builder.io/qwik";
import { routeLoader$ } from "@builder.io/qwik-city";
import * as client from "openid-client";
import { trace } from "@opentelemetry/api";

import callbackStyles from "./index.module.css";

// Handle the redirect from the OIDC provider.
export const useOIDCRedirectParams = routeLoader$<{
  errorMessage: string | null;
  errorCode: string | null;
}>(async (event) => {
  // If the OIDC provider returns an error, display it to the user.
  if (event.query.has("error")) {
    const errorCode = event.query.get("error");
    const errorMessage = event.query.get("error_description");
    trace
      .getActiveSpan()
      ?.recordException(
        new Error(`callback error: ${errorCode}: ${errorMessage}`)
      );
    return {
      errorCode: errorCode,
      errorMessage: errorMessage,
    };
  }

  const config: client.Configuration = await client.discovery(
    new URL(import.meta.env.PUBLIC_AUTH_TOKEN_ISSUER),
    import.meta.env.PUBLIC_AUTH_CLIENT_ID,
    event.env.get("AUTH_CLIENT_SECRET")
  );

  // Pull the code verifier and state from the query parameters.
  const codeVerifier = event.cookie.get("code_verifier")?.value;
  if (codeVerifier === undefined) {
    console.log(`client did not provide a code_verifier cookie`);
    throw new Error(`client did not provide a code_verifier cookie`);
  }

  // Exchange the authorization code for an access token.
  const tokens = await client.authorizationCodeGrant(
    config,
    event.url,
    {
      pkceCodeVerifier: codeVerifier,
    },
    {
      audience: import.meta.env.PUBLIC_AUTH_TOKEN_AUDIENCE,
    }
  );

  // Store the access token in a cookie.
  const isHttps = import.meta.env.DEV ? false : true;
  event.cookie.set("token", tokens.access_token, {
    secure: isHttps,
    // Make the cookie available to all routes.
    path: "/",
    // TODO: Get this from the token expiry.
    maxAge: 60 * 60 * 24 * 7,
  });

  // We're done with the code verifier now, so remove it from the cookies.
  event.cookie.delete("code_verifier");

  throw event.redirect(302, "/books");
});

export default component$(() => {
  const errorDetails = useOIDCRedirectParams();

  const activeSpanCtx = trace.getActiveSpan()?.spanContext();

  return (
    <main>
      <section class={callbackStyles["error-box"]}>
        <h1>Login Error</h1>
        <p>There was a problem logging you in. Please try again later.</p>
        <p class={callbackStyles["error-details"]}>
          Error details: {errorDetails.value.errorCode}:{" "}
          {errorDetails.value.errorMessage}
        </p>
        {activeSpanCtx?.traceId && (
          <p class={callbackStyles["error-details"]}>
            Trace ID: {activeSpanCtx.traceId}
          </p>
        )}
      </section>
    </main>
  );
});
