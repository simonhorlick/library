import { describe, it, expect } from "vitest";
import { graphqlAuthed } from "../helpers";

// Smoke tests for users CRUD. The users table has RLS so these tests use a
// token with the appropriate permissions. Note that user deletion is disabled
// at the schema level.
describe("users", () => {
  let userId: string;
  const permissions = ["read:user", "write:user"];

  it("creates a user", async () => {
    const { body } = await graphqlAuthed(`
      mutation {
        createUser(input: { user: { email: "test@example.com", username: "testuser" } }) {
          result {
            __typename
            ... on User { id email username }
            ... on UserEmailConflict { message }
            ... on UserUsernameConflict { message }
          }
        }
      }
    `, undefined, permissions);

    expect(body.data.createUser.result.__typename).toBe("User");
    expect(body.data.createUser.result.email).toBe("test@example.com");
    expect(body.data.createUser.result.username).toBe("testuser");
    userId = body.data.createUser.result.id;
  });

  it("retrieves the user by id", async () => {
    const { body } = await graphqlAuthed(`
      query ($id: BigInt!) {
        user(id: $id) { id email username bio }
      }
    `, { id: userId }, permissions);

    expect(body.data.user.email).toBe("test@example.com");
    expect(body.data.user.username).toBe("testuser");
  });

  it("updates the user bio", async () => {
    const { body } = await graphqlAuthed(`
      mutation ($id: BigInt!) {
        updateUser(input: { id: $id, patch: { bio: "Hello world" } }) {
          user { id bio }
        }
      }
    `, { id: userId }, permissions);

    expect(body.data.updateUser.user.bio).toBe("Hello world");
  });

  it("lists users and finds the created user", async () => {
    const { body } = await graphqlAuthed(`
      query {
        users { nodes { id email username } }
      }
    `, undefined, permissions);

    const found = body.data.users.nodes.find(
      (u: any) => u.username === "testuser"
    );
    expect(found).toBeDefined();
  });

  // User deletion is omitted from the schema via the graphile config, so the
  // deleteUser mutation should not exist.
  it("does not expose a deleteUser mutation", async () => {
    const { body } = await graphqlAuthed(`
      mutation ($id: BigInt!) {
        deleteUser(input: { id: $id }) {
          user { id }
        }
      }
    `, { id: userId }, permissions);

    // The server should return a validation error since the mutation field
    // does not exist in the schema.
    expect(body.errors).toBeDefined();
    expect(body.errors.length).toBeGreaterThan(0);
  });
});
