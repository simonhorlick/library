import { Pool } from "pg";
import postgraphile from "postgraphile";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import preset from "./graphile.config";
import request from "supertest";
import { grafserv } from "grafserv/fastify/v4";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";

/**
 * Helper function to create a Fastify server with PostGraphile.
 */
async function createTestServer(): Promise<{
  app: FastifyInstance;
  url: string;
}> {
  const pgl = postgraphile(preset);
  const serv = pgl.createServ(grafserv);
  const app = Fastify({
    logger: false, // Disable logging in tests for cleaner output.
  });
  serv.addTo(app);

  // Use port 0 to let the OS assign an available port.
  const url = await app.listen({ port: 0 });

  return { app, url };
}

/**
 * Helper function to execute a GraphQL mutation and return the response.
 */
async function executeMutation(url: string, mutation: string) {
  const response = await request(url).post("/graphql").send({
    query: mutation,
  });

  return response;
}

/**
 * Helper function to create a book mutation with conflict handling.
 */
function createBookMutation(
  isbn: string,
  title: string,
  clientMutationId?: string
): string {
  const clientIdField = clientMutationId
    ? `clientMutationId: "${clientMutationId}"`
    : "";

  return `mutation CreateBook {
    createBook(input: {
      ${clientIdField}
      book: {
        isbn: "${isbn}",
        title: "${title}"
      }
    }) {
      ${clientMutationId ? "clientMutationId" : ""}
      result {
        __typename
        ... on Book {
          isbn
          title
          createdAt
          updatedAt
        }
        ... on BookIsbnConflict {
          message
        }
      }
    }
  }`;
}

/**
 * Helper function to create a user mutation with conflict handling.
 */
function createUserMutation(
  email: string,
  username: string,
  clientMutationId?: string
): string {
  const clientIdField = clientMutationId
    ? `clientMutationId: "${clientMutationId}"`
    : "";

  return `mutation CreateUser {
    createUser(input: {
      ${clientIdField}
      user: {
        email: "${email}",
        username: "${username}"
      }
    }) {
      ${clientMutationId ? "clientMutationId" : ""}
      result {
        __typename
        ... on User {
          id
          username
          email
        }
        ... on UserUsernameConflict {
          message
        }
        ... on UserEmailConflict {
          message
        }
      }
    }
  }`;
}

describe("PgMutationCreateWithConflictsPlugin", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({
      database: "library",
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      host: process.env.DB_HOST,
      port: Number.parseInt(process.env.DB_PORT || "5432"),
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  it("should return the correct response for conflict cases", async () => {
    const { app, url } = await createTestServer();

    const mutation = createBookMutation("123", "123");
    const response = await executeMutation(url, mutation);

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.createBook.result.__typename).toEqual(
      "BookIsbnConflict"
    );

    await app.close();
  });

  it("should return the correct response when a CHECK constraint is violated", async () => {
    const { app, url } = await createTestServer();

    const mutation = createBookMutation("", "");
    const response = await executeMutation(url, mutation);

    expect(response.body.errors[0].message).toEqual(
      'new row for relation "books" violates check constraint "isbn_not_empty_ck"'
    );
    expect(response.body.data.createBook).toBeNull();

    await app.close();
  });

  it("should return conflict details for unique constraint violations", async () => {
    const { app, url } = await createTestServer();

    const mutation = createBookMutation("123", "Duplicate ISBN");
    const response = await executeMutation(url, mutation);

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.createBook.result.__typename).toEqual(
      "BookIsbnConflict"
    );

    const conflict = response.body.data.createBook.result;
    expect(conflict.message).toBeDefined();
    expect(conflict.message).toContain("isbn");

    await app.close();
  });

  it("should handle clientMutationId in successful creation", async () => {
    const { app, url } = await createTestServer();

    const isbn = Date.now().toString();
    const mutation = createBookMutation(
      isbn,
      "Test Book with Client ID",
      "test-mutation-123"
    );
    const response = await executeMutation(url, mutation);

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.createBook.clientMutationId).toBe(
      "test-mutation-123"
    );
    expect(response.body.data.createBook.result.__typename).toEqual("Book");
    expect(response.body.data.createBook.result.title).toBe(
      "Test Book with Client ID"
    );

    await app.close();
  });

  it("should handle clientMutationId in conflict cases", async () => {
    const { app, url } = await createTestServer();

    const mutation = createBookMutation(
      "123",
      "Duplicate ISBN",
      "conflict-mutation-456"
    );
    const response = await executeMutation(url, mutation);

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.createBook.clientMutationId).toBe(
      "conflict-mutation-456"
    );
    expect(response.body.data.createBook.result.__typename).toEqual(
      "BookIsbnConflict"
    );

    await app.close();
  });

  it("should return all fields for successfully created book", async () => {
    const { app, url } = await createTestServer();

    const isbn = Date.now().toString();
    const mutation = createBookMutation(isbn, "Complete Test Book");
    const response = await executeMutation(url, mutation);

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.createBook.result.__typename).toEqual("Book");
    expect(response.body.data.createBook.result.isbn).toBe(isbn);
    expect(response.body.data.createBook.result.title).toBe(
      "Complete Test Book"
    );
    expect(response.body.data.createBook.result.createdAt).toBeDefined();
    expect(response.body.data.createBook.result.updatedAt).toBeDefined();

    await app.close();
  });

  // NOTE: CHECK constraints are not handled by the constraint-specific conflict types
  // because they are not unique or primary key constraints. They will still cause
  // errors, but those errors will be returned as standard GraphQL errors rather than
  // as union types. This is intentional - the conflict handling is specifically for
  // constraints that can cause duplicate key/uniqueness violations.

  it("should return specific BookIsbnConflict type for ISBN unique constraint violations", async () => {
    // Test that the plugin generates a specific conflict type for the isbn primary key constraint.
    const { app, url } = await createTestServer();

    const mutation = createBookMutation("123", "Duplicate ISBN Test");
    const response = await executeMutation(url, mutation);

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.createBook.result.__typename).toEqual(
      "BookIsbnConflict"
    );

    const conflict = response.body.data.createBook.result;
    expect(conflict.message).toBeDefined();

    await app.close();
  });

  it("should return specific UserUsernameConflict type for username unique constraint violations", async () => {
    // Test that the plugin generates a specific conflict type for the unique_user_username constraint.
    const { app, url } = await createTestServer();

    const timestamp = Date.now();
    const username = `duplicate_username_${timestamp}`;
    const email = `test${timestamp}@example.com`;
    const mutation = createUserMutation(email, username);

    // First, create a user with the username we'll try to duplicate.
    const firstResponse = await executeMutation(url, mutation);
    expect(firstResponse.body.errors).toBeUndefined();
    expect(firstResponse.body.data.createUser.result.__typename).toEqual(
      "User"
    );

    // Now try to create another user with the same username.
    const duplicateResponse = await executeMutation(url, mutation);
    expect(duplicateResponse.body.errors).toBeUndefined();
    expect(duplicateResponse.body.data.createUser.result.__typename).toEqual(
      "UserUsernameConflict"
    );

    const conflict = duplicateResponse.body.data.createUser.result;
    expect(conflict.message).toBeDefined();

    await app.close();
  });

  it("should return specific UserEmailConflict type for email unique constraint violations", async () => {
    // Test that the plugin generates a specific conflict type for the unique_user_email constraint.
    const { app, url } = await createTestServer();

    const timestamp = Date.now();
    const email = `duplicate_email_${timestamp}@example.com`;

    // First, create a user with the email we'll try to duplicate.
    const firstMutation = createUserMutation(email, `user_${timestamp}_1`);
    const firstResponse = await executeMutation(url, firstMutation);
    expect(firstResponse.body.errors).toBeUndefined();
    expect(firstResponse.body.data.createUser.result.__typename).toEqual(
      "User"
    );

    // Now try to create another user with the same email but different username.
    const secondMutation = createUserMutation(email, `user_${timestamp}_2`);
    const duplicateResponse = await executeMutation(url, secondMutation);
    expect(duplicateResponse.body.errors).toBeUndefined();
    expect(duplicateResponse.body.data.createUser.result.__typename).toEqual(
      "UserEmailConflict"
    );

    const conflict = duplicateResponse.body.data.createUser.result;
    expect(conflict.message).toBeDefined();

    await app.close();
  });

  it("should include all constraint-specific conflict types in the union", async () => {
    // This test verifies that the CreateBookResult union includes both the Book type
    // and individual conflict types for each constraint (e.g., IsbnConflict).
    const { app, url } = await createTestServer();

    const introspectionQuery = `query IntrospectCreateBookResult {
      __type(name: "CreateBookResult") {
        kind
        name
        possibleTypes {
          name
        }
      }
    }`;

    const response = await executeMutation(url, introspectionQuery);

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.__type.kind).toEqual("UNION");
    expect(response.body.data.__type.name).toEqual("CreateBookResult");

    const typeNames = response.body.data.__type.possibleTypes.map(
      (t: any) => t.name
    );
    expect(typeNames).toContain("Book");
    expect(typeNames).toContain("BookIsbnConflict");

    await app.close();
  });

  it("should include all user constraint-specific conflict types in the union", async () => {
    // This test verifies that the CreateUserResult union includes the User type
    // and individual conflict types for username and email constraints.
    const { app, url } = await createTestServer();

    const introspectionQuery = `query IntrospectCreateUserResult {
      __type(name: "CreateUserResult") {
        kind
        name
        possibleTypes {
          name
        }
      }
    }`;

    const response = await executeMutation(url, introspectionQuery);

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.__type.kind).toEqual("UNION");
    expect(response.body.data.__type.name).toEqual("CreateUserResult");

    const typeNames = response.body.data.__type.possibleTypes.map(
      (t: any) => t.name
    );
    expect(typeNames).toContain("User");
    expect(typeNames).toContain("UserUsernameConflict");
    expect(typeNames).toContain("UserEmailConflict");

    await app.close();
  });
});
