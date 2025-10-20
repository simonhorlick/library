import { Pool } from "pg";
import postgraphile from "postgraphile";
import { describe, expect, it } from "vitest";
import preset from "./graphile.config";
import request from "supertest";
import { grafserv } from "grafserv/fastify/v4";
import Fastify from "fastify";

describe("PgMutationCreateWithConflictsPlugin", () => {
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

    const pool = new Pool({
      database: "library",
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      host: process.env.DB_HOST,
      port: Number.parseInt(process.env.DB_PORT || "5432"),
    });

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
  });
});
