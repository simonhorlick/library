import { SignJWT, importJWK } from "jose";
import { TEST_PRIVATE_JWK } from "./keys";

const TEST_ISSUER = "https://test-issuer.example.com/";
const TEST_AUDIENCE = "test-audience";
const API_URL = "http://localhost:5679/graphql";

// Sign a JWT with the given permissions array using the test private key. The
// resulting token is accepted by the test server's JWKS endpoint.
export const createToken = async (
  permissions: string[],
  sub: string = "test-user|123",
): Promise<string> => {
  const privateKey = await importJWK(TEST_PRIVATE_JWK, "RS256");

  return new SignJWT({ permissions, sub })
    .setProtectedHeader({ alg: "RS256", kid: TEST_PRIVATE_JWK.kid })
    .setIssuedAt()
    .setIssuer(TEST_ISSUER)
    .setAudience(TEST_AUDIENCE)
    .setExpirationTime("1h")
    .sign(privateKey);
};

// Send a GraphQL request to the test server. When a token is provided it is
// included as a Bearer token in the Authorization header.
export const graphql = async (
  query: string,
  variables?: Record<string, unknown>,
  token?: string,
): Promise<{ status: number; body: any }> => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });

  const body = await response.json();
  return { status: response.status, body };
};

// Convenience wrapper that creates a token with the given permissions then
// sends a GraphQL request with it.
export const graphqlAuthed = async (
  query: string,
  variables?: Record<string, unknown>,
  permissions: string[] = [],
): Promise<{ status: number; body: any }> => {
  const token = await createToken(permissions);
  return graphql(query, variables, token);
};
