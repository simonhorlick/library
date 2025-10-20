// import { ApolloServer } from "@apollo/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApolloServer } from "./server";
import request from "supertest";
import { Pool } from "pg";

describe("e2e demo", () => {
  let url: string;

  // before the tests we spin up a new Apollo Server
  beforeAll(async () => {
    const pool = new Pool({
      database: "library",
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      host: process.env.DB_HOST,
      port: Number.parseInt(process.env.DB_PORT || "5432"),
    });

    // // Note we must wrap our object destructuring in parentheses because we already declared these variables
    // // We pass in the port as 0 to let the server pick its own ephemeral port for testing
    url = await createApolloServer(0);

    console.log(`started server`);
  });

  // after the tests we'll stop the server
  afterAll(async () => {
    // await server.stop();
  });

  const registerUserMutation = `
mutation RegisterUser($email: String!, $sub: String!) {
  registerUser(input:  {
     email: $email,
     sub: $sub
  }) {
    user {
      __typename
      sub
      email
    }
  }
}`;

  it("should register a user", async () => {
    const uniqueSub = Math.floor(1_000_000 * Math.random()).toString();
    // send our request to the url of the test server
    const response = await request(url)
      .post("/graphql")
      .send({
        query: registerUserMutation,
        variables: {
          email: `ok+${uniqueSub}@example.com`,
          sub: uniqueSub,
        },
      });
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data).toEqual({
      registerUser: {
        user: {
          __typename: "User",
          email: `ok+${uniqueSub}@example.com`,
          sub: uniqueSub,
        },
      },
    });
  });
});
