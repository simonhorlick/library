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
      "CreateBookConflict"
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
        ... on CreateBookConflict {
          message
          code
          constraint
          detail
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
      "CreateBookConflict"
    );

    const conflict = response.body.data.createBook.result;
    expect(conflict.code).toBe("23505"); // unique_violation
    expect(conflict.message).toBeDefined();
    expect(conflict.message).toContain("isbn");
    expect(conflict.detail).toBeDefined();

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
        ... on CreateBookConflict {
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
      "CreateBookConflict"
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
        ... on CreateBookConflict {
          message
          code
          constraint
          detail
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

  it("should handle CHECK constraint violations", async () => {
    const createMutation = `mutation CreateBook {
    createBook(input:  {
      book:  {
          isbn: "",
          title: "Empty ISBN Test"
      }
    }) {
      result {
        __typename
        ... on CreateBookConflict {
          message
          code
          constraint
          detail
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

    const url = await app.listen({ port: 9905 });

    const response = await request(url).post("/graphql").send({
      query: createMutation,
    });

    console.log(JSON.stringify(response.body, null, 2));

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.createBook.result.__typename).toEqual(
      "CreateBookConflict"
    );

    const conflict = response.body.data.createBook.result;
    expect(conflict.code).toBe("23514"); // check_violation
    expect(conflict.message).toBeDefined();
    expect(conflict.constraint).toBe("isbn_not_empty_ck");

    await app.close();
  });
});
