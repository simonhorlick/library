import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { graphqlAuthed } from "../helpers";

// Permission tests for the users table. RLS policies on the users table
// require specific permissions in the JWT to allow read and write access. We
// seed a test user via a direct superuser connection (bypassing RLS) then
// verify that different permission sets produce the correct access outcomes.
describe("users RLS permissions", () => {
  let adminClient: Client;

  beforeAll(async () => {
    adminClient = new Client({
      database: "library_test",
      host: process.env.DB_HOST,
      port: Number.parseInt(process.env.DB_PORT || "5432"),
      user: process.env.DB_SUPERUSER || process.env.PGUSER || undefined,
      password:
        process.env.DB_SUPERUSER_PASSWORD || process.env.PGPASSWORD || undefined,
    });
    await adminClient.connect();

    // Seed a user directly as superuser so RLS is bypassed.
    await adminClient.query(`
      INSERT INTO users (email, username, bio)
      VALUES ('seeded@example.com', 'seededuser', 'Seeded via SQL')
      ON CONFLICT (email) DO NOTHING
    `);
  });

  afterAll(async () => {
    await adminClient.query(
      `DELETE FROM users WHERE email = 'seeded@example.com'`,
    );
    await adminClient.end();
  });

  it("returns no users when the token has no permissions", async () => {
    const { body } = await graphqlAuthed(
      `
      query {
        users { nodes { id email username } }
      }
    `,
      undefined,
      [],
    );

    expect(body.data.users.nodes).toEqual([]);
  });

  it("returns users when the token has the read:user permission", async () => {
    const { body } = await graphqlAuthed(
      `
      query {
        users { nodes { id email username } }
      }
    `,
      undefined,
      ["read:user"],
    );

    const seeded = body.data.users.nodes.find(
      (u: any) => u.email === "seeded@example.com",
    );
    expect(seeded).toBeDefined();
    expect(seeded.username).toBe("seededuser");
  });

  it("blocks insert when the token only has read:user", async () => {
    const { body } = await graphqlAuthed(
      `
      mutation {
        createUser(input: { user: { email: "noperm@example.com", username: "noperm" } }) {
          result {
            __typename
            ... on User { id }
          }
        }
      }
    `,
      undefined,
      ["read:user"],
    );

    // The insert should fail because the RLS policy requires write:user. The
    // exact error shape depends on PostGraphile's error handling, but the
    // mutation should not return a successful User.
    const result = body.data?.createUser?.result;
    const hasUser = result?.__typename === "User";
    const hasError = body.errors && body.errors.length > 0;
    expect(hasUser).toBe(false);
    expect(hasError || result === null).toBe(true);
  });

  it("blocks insert when the token only has write:user but not read:user", async () => {
    // PostgreSQL RLS enforces the SELECT policy when returning rows after an
    // insert, so write:user alone is insufficient - the insert fails because
    // the RETURNING clause cannot read the new row.
    const { body: createBody } = await graphqlAuthed(
      `
      mutation {
        createUser(input: { user: { email: "writeonly@example.com", username: "writeonly" } }) {
          result {
            __typename
            ... on User { id email username }
          }
        }
      }
    `,
      undefined,
      ["write:user"],
    );

    expect(createBody.errors).toBeDefined();
    expect(createBody.errors[0].message).toContain("row-level security");
  });

  it("allows full access with both read:user and write:user", async () => {
    const { body: createBody } = await graphqlAuthed(
      `
      mutation {
        createUser(input: { user: { email: "fullaccess@example.com", username: "fullaccess" } }) {
          result {
            __typename
            ... on User { id email username }
          }
        }
      }
    `,
      undefined,
      ["read:user", "write:user"],
    );

    expect(createBody.data.createUser.result.__typename).toBe("User");
    expect(createBody.data.createUser.result.email).toBe(
      "fullaccess@example.com",
    );

    const userId = createBody.data.createUser.result.id;

    // Verify the user is visible via a query.
    const { body: queryBody } = await graphqlAuthed(
      `
      query ($id: BigInt!) {
        user(id: $id) { id email username }
      }
    `,
      { id: userId },
      ["read:user", "write:user"],
    );

    expect(queryBody.data.user.email).toBe("fullaccess@example.com");

    // Clean up.
    await adminClient.query(
      `DELETE FROM users WHERE email = 'fullaccess@example.com'`,
    );
  });

  it("allows update with write:user permission", async () => {
    // Seed a user to update.
    await adminClient.query(`
      INSERT INTO users (email, username, bio)
      VALUES ('updatable@example.com', 'updatable', 'original bio')
      ON CONFLICT (email) DO NOTHING
    `);
    const result = await adminClient.query(
      `SELECT id FROM users WHERE email = 'updatable@example.com'`,
    );
    const userId = result.rows[0].id.toString();

    const { body } = await graphqlAuthed(
      `
      mutation ($id: BigInt!) {
        updateUser(input: { id: $id, patch: { bio: "updated bio" } }) {
          user { id bio }
        }
      }
    `,
      { id: userId },
      ["write:user", "read:user"],
    );

    expect(body.data.updateUser.user.bio).toBe("updated bio");

    // Clean up.
    await adminClient.query(
      `DELETE FROM users WHERE email = 'updatable@example.com'`,
    );
  });
});
