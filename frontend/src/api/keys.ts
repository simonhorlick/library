import * as jose from "jose";

console.log(`fetching JWKS from ${import.meta.env.PUBLIC_AUTH_JWKS_URL}`);
export const JWKS = jose.createRemoteJWKSet(
  new URL(import.meta.env.PUBLIC_AUTH_JWKS_URL)
);
