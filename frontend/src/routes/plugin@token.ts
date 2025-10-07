import { type RequestHandler } from "@builder.io/qwik-city";
import { trace } from "@opentelemetry/api";
import * as jose from "jose";
import { JWKS } from "~/api/keys";

// onRequest is a middleware for extracting the auth token from the cookie and
// making it available in the request context for all nested routes. We check
// the token's signature and expiration date to ensure it's valid. If not, we
// redirect to the login page.
export const onRequest: RequestHandler = async (event) => {
  // Exclude all /auth routes from this middleware.
  const notAuthenticatedPrefixes = ["/auth"];
  if (
    notAuthenticatedPrefixes.some((prefix) => event.pathname.startsWith(prefix))
  ) {
    await event.next();
    return;
  }

  const token = event.cookie.get("token")?.value;

  // If the token is sent we should verify it.
  if (token) {
    try {
      const { payload } = await jose.jwtVerify(token, JWKS, {
        issuer: import.meta.env.PUBLIC_AUTH_TOKEN_ISSUER,
        audience: import.meta.env.PUBLIC_AUTH_TOKEN_AUDIENCE,
      });

      // At this point the token has been verified and is valid. Attach the raw
      // token and the payload to the request context so it's available to all
      // nested routes.
      event.sharedMap.set("token", token);
      event.sharedMap.set("token-payload", payload);
    } catch (error) {
      // Record the failure details.
      if (error instanceof Error) {
        console.error(error.message);
        trace.getActiveSpan()?.recordException(error);
      }

      // If the token was sent, but invalid, regardless of the action we send
      // a redirect to the login page.
      throw event.redirect(302, "/auth/login");
    }
  }

  await event.next();
};
