import { describe, it, expect } from "vitest";
import { graphql } from "../helpers";

// Test that unauthenticated and malformed requests receive the correct HTTP
// error responses without leaking internal details.
describe("unauthenticated access", () => {
  const query = `query { books { nodes { isbn } } }`;

  it("returns 401 when no authorization header is present", async () => {
    const { status, body } = await graphql(query);

    expect(status).toBe(401);
    expect(body.errors[0].message).toBe("No authorization header found");
  });

  it("returns 401 when the authorization header is not a bearer token", async () => {
    const response = await fetch("http://localhost:5679/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Basic dXNlcjpwYXNz",
      },
      body: JSON.stringify({ query }),
    });

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.errors[0].message).toBe("Invalid authorization header");
  });

  it("returns 403 when the token is invalid", async () => {
    const { status, body } = await graphql(query, undefined, "invalid-token");

    expect(status).toBe(403);
    expect(body.errors[0].message).toBe("Not authorized");
  });

  it("returns 403 when the token is expired", async () => {
    // Create a token that expired an hour ago by importing jose directly.
    const { SignJWT, importJWK } = await import("jose");
    const { TEST_PRIVATE_JWK } = await import("../keys.js");

    const privateKey = await importJWK(TEST_PRIVATE_JWK, "RS256");
    const expiredToken = await new SignJWT({ permissions: [], sub: "expired" })
      .setProtectedHeader({ alg: "RS256", kid: TEST_PRIVATE_JWK.kid })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setIssuer("https://test-issuer.example.com/")
      .setAudience("test-audience")
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(privateKey);

    const { status, body } = await graphql(query, undefined, expiredToken);

    expect(status).toBe(403);
    expect(body.errors[0].message).toBe("Not authorized");
  });
});
