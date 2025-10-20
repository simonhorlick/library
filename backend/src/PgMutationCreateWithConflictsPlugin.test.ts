import { Pool } from "pg";
import postgraphile from "postgraphile";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import preset from "./graphile.config";
import request from "supertest";
import { grafserv } from "grafserv/fastify/v4";
import Fastify from "fastify";

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
    const createMutation = `mutation CreateBook {
    createBook(input:  {
      book:  {
          isbn: "123",
          title: "123"
      }
    }) {
      result {
        __typename
      }
    }
  }
  `;

    const pgl = postgraphile(preset);
    const serv = pgl.createServ(grafserv);
    const app = Fastify({
      logger: true,
    });
    serv.addTo(app);

    const url = await app.listen({ port: 9898 });

    // send our request to the url of the test server
    const response = await request(url).post("/graphql").send({
      query: createMutation,
    });

    console.log(JSON.stringify(response.body, null, 2));

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.createBook.result.__typename).toEqual(
      "BookIsbnConflict"
    );

    await app.close();
  });

  it("should return conflict details for unique constraint violations", async () => {
    const createMutation = `mutation CreateBook {
    createBook(input:  {
      book:  {
          isbn: "123",
          title: "Duplicate ISBN"
      }
    }) {
      result {
        __typename
        ... on BookIsbnConflict {
          message
        }
      }
    }
  }
  `;

    const pgl = postgraphile(preset);
    const serv = pgl.createServ(grafserv);
    const app = Fastify({
      logger: true,
    });
    serv.addTo(app);

    const url = await app.listen({ port: 9900 });

    const response = await request(url).post("/graphql").send({
      query: createMutation,
    });

    console.log(JSON.stringify(response.body, null, 2));

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
    const createMutation = `mutation CreateBook {
    createBook(input:  {
      clientMutationId: "test-mutation-123"
      book:  {
          isbn: "${Date.now()}",
          title: "Test Book with Client ID"
      }
    }) {
      clientMutationId
      result {
        __typename
        ... on Book {
          isbn
          title
        }
      }
    }
  }
  `;

    const pgl = postgraphile(preset);
    const serv = pgl.createServ(grafserv);
    const app = Fastify({
      logger: true,
    });
    serv.addTo(app);

    const url = await app.listen({ port: 9901 });

    const response = await request(url).post("/graphql").send({
      query: createMutation,
    });

    console.log(JSON.stringify(response.body, null, 2));

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
    const createMutation = `mutation CreateBook {
    createBook(input:  {
      clientMutationId: "conflict-mutation-456"
      book:  {
          isbn: "123",
          title: "Duplicate ISBN"
      }
    }) {
      clientMutationId
      result {
        __typename
        ... on BookIsbnConflict {
          message
        }
      }
    }
  }
  `;

    const pgl = postgraphile(preset);
    const serv = pgl.createServ(grafserv);
    const app = Fastify({
      logger: true,
    });
    serv.addTo(app);

    const url = await app.listen({ port: 9902 });

    const response = await request(url).post("/graphql").send({
      query: createMutation,
    });

    console.log(JSON.stringify(response.body, null, 2));

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
    const isbn = Date.now().toString();
    const createMutation = `mutation CreateBook {
    createBook(input:  {
      book:  {
          isbn: "${isbn}",
          title: "Complete Test Book"
      }
    }) {
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
  }
  `;

    const pgl = postgraphile(preset);
    const serv = pgl.createServ(grafserv);
    const app = Fastify({
      logger: true,
    });
    serv.addTo(app);

    const url = await app.listen({ port: 9899 });

    // send our request to the url of the test server
    const response = await request(url).post("/graphql").send({
      query: createMutation,
    });

    console.log(JSON.stringify(response.body, null, 2));

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
    const createMutation = `mutation CreateBook {
    createBook(input:  {
      book:  {
          isbn: "123",
          title: "Duplicate ISBN Test"
      }
    }) {
      result {
        __typename
        ... on BookIsbnConflict {
          message
        }
      }
    }
  }
  `;

    const pgl = postgraphile(preset);
    const serv = pgl.createServ(grafserv);
    const app = Fastify({
      logger: true,
    });
    serv.addTo(app);

    const url = await app.listen({ port: 9906 });

    const response = await request(url).post("/graphql").send({
      query: createMutation,
    });

    console.log(JSON.stringify(response.body, null, 2));

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
    const timestamp = Date.now();
    const username = `duplicate_username_${timestamp}`;
    const createUserMutation = `mutation CreateUser {
    createUser(input:  {
      user:  {
          email: "test${timestamp}@example.com",
          username: "${username}"
      }
    }) {
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
      }
    }
  }
  `;

    const pgl = postgraphile(preset);
    const serv = pgl.createServ(grafserv);
    const app = Fastify({
      logger: true,
    });
    serv.addTo(app);

    const url = await app.listen({ port: 9907 });

    // First, create a user with the username we'll try to duplicate.
    const firstResponse = await request(url).post("/graphql").send({
      query: createUserMutation,
    });

    console.log(
      "First user creation:",
      JSON.stringify(firstResponse.body, null, 2)
    );
    expect(firstResponse.body.errors).toBeUndefined();
    expect(firstResponse.body.data.createUser.result.__typename).toEqual(
      "User"
    );

    // Now try to create another user with the same username.
    const duplicateResponse = await request(url).post("/graphql").send({
      query: createUserMutation,
    });

    console.log(
      "Duplicate username attempt:",
      JSON.stringify(duplicateResponse.body, null, 2)
    );

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
    const email = `duplicate_email_${Date.now()}@example.com`;
    const timestamp = Date.now();

    const pgl = postgraphile(preset);
    const serv = pgl.createServ(grafserv);
    const app = Fastify({
      logger: true,
    });
    serv.addTo(app);

    const url = await app.listen({ port: 9908 });

    // First, create a user with the email we'll try to duplicate.
    const firstMutation = `mutation CreateUser {
    createUser(input:  {
      user:  {
          email: "${email}",
          username: "user_${timestamp}_1"
      }
    }) {
      result {
        __typename
        ... on User {
          id
          username
          email
        }
        ... on UserEmailConflict {
          message
        }
      }
    }
  }
  `;

    const firstResponse = await request(url).post("/graphql").send({
      query: firstMutation,
    });

    console.log(
      "First user creation:",
      JSON.stringify(firstResponse.body, null, 2)
    );
    expect(firstResponse.body.errors).toBeUndefined();
    expect(firstResponse.body.data.createUser.result.__typename).toEqual(
      "User"
    );

    // Now try to create another user with the same email but different username.
    const secondMutation = `mutation CreateUser {
    createUser(input:  {
      user:  {
          email: "${email}",
          username: "user_${timestamp}_2"
      }
    }) {
      result {
        __typename
        ... on User {
          id
          username
          email
        }
        ... on UserEmailConflict {
          message
        }
      }
    }
  }
  `;

    const duplicateResponse = await request(url).post("/graphql").send({
      query: secondMutation,
    });

    console.log(
      "Duplicate email attempt:",
      JSON.stringify(duplicateResponse.body, null, 2)
    );

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
    const introspectionQuery = `query IntrospectCreateBookResult {
    __type(name: "CreateBookResult") {
      kind
      name
      possibleTypes {
        name
      }
    }
  }
  `;

    const pgl = postgraphile(preset);
    const serv = pgl.createServ(grafserv);
    const app = Fastify({
      logger: true,
    });
    serv.addTo(app);

    const url = await app.listen({ port: 9909 });

    const response = await request(url).post("/graphql").send({
      query: introspectionQuery,
    });

    console.log(
      "Introspection result:",
      JSON.stringify(response.body, null, 2)
    );

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
    const introspectionQuery = `query IntrospectCreateUserResult {
    __type(name: "CreateUserResult") {
      kind
      name
      possibleTypes {
        name
      }
    }
  }
  `;

    const pgl = postgraphile(preset);
    const serv = pgl.createServ(grafserv);
    const app = Fastify({
      logger: true,
    });
    serv.addTo(app);

    const url = await app.listen({ port: 9910 });

    const response = await request(url).post("/graphql").send({
      query: introspectionQuery,
    });

    console.log(
      "Introspection result:",
      JSON.stringify(response.body, null, 2)
    );

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
