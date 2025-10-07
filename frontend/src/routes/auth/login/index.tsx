import { type RequestEvent } from "@builder.io/qwik-city";
import * as client from "openid-client";

// Build a redirect to the authorization server.
export const onGet = async ({ cookie, redirect, env }: RequestEvent) => {
  const config: client.Configuration = await client.discovery(
    new URL(import.meta.env.PUBLIC_AUTH_TOKEN_ISSUER),
    import.meta.env.PUBLIC_AUTH_CLIENT_ID,
    env.get("AUTH_CLIENT_SECRET")
  );

  /**
   * PKCE: The following MUST be generated for every redirect to the
   * authorization_endpoint. You must store the code_verifier and state in the
   * end-user session such that it can be recovered as the user gets redirected
   * from the authorization server back to your application.
   */
  const code_verifier = client.randomPKCECodeVerifier();
  const code_challenge = await client.calculatePKCECodeChallenge(code_verifier);

  const parameters: Record<string, string> = {
    redirect_uri: `${import.meta.env.PUBLIC_ORIGIN}/auth/callback`,
    scope: "openid profile email",
    audience: import.meta.env.PUBLIC_AUTH_TOKEN_AUDIENCE,
    code_challenge,
    code_challenge_method: "S256",

    // // Instruct the authorization server to redirect back here for the
    // // complete-profile flow.
    // complete_uri: `${import.meta.env.PUBLIC_ORIGIN}/complete-profile`,
  };

  if (!config.serverMetadata().supportsPKCE()) {
    // Auth0 supports PKCE, so this should never be thrown.
    throw new Error("Server does not support PKCE");
  }

  const redirectTo = client.buildAuthorizationUrl(config, parameters);

  // now redirect the user to redirectTo.href
  console.log("Sending redirect to", redirectTo.href);

  // Store the code verifier with the user so we can retrieve it later in the
  // callback endpoint.
  cookie.set("code_verifier", code_verifier, { secure: true });

  throw redirect(302, redirectTo.href);
};
