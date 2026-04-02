import { describe, it, expect } from "vitest";
import { graphqlAuthed } from "../helpers";

// Smoke tests for the authors CRUD operations. Authors have no RLS so these
// tests verify the basic lifecycle works end-to-end.
describe("authors", () => {
  let authorId: string;

  it("creates an author", async () => {
    const { body } = await graphqlAuthed(`
      mutation {
        createAuthor(input: { author: { name: "George Orwell", bio: "English novelist" } }) {
          result {
            __typename
            ... on Author { id name bio }
          }
        }
      }
    `);

    expect(body.data.createAuthor.result.__typename).toBe("Author");
    expect(body.data.createAuthor.result.name).toBe("George Orwell");
    authorId = body.data.createAuthor.result.id;
  });

  it("retrieves the author by id", async () => {
    const { body } = await graphqlAuthed(
      `
      query ($id: BigInt!) {
        author(id: $id) { id name bio }
      }
    `,
      { id: authorId },
    );

    expect(body.data.author.name).toBe("George Orwell");
    expect(body.data.author.bio).toBe("English novelist");
  });

  it("updates the author", async () => {
    const { body } = await graphqlAuthed(
      `
      mutation ($id: BigInt!) {
        updateAuthor(input: { id: $id, patch: { name: "Eric Arthur Blair" } }) {
          author { id name }
        }
      }
    `,
      { id: authorId },
    );

    expect(body.data.updateAuthor.author.name).toBe("Eric Arthur Blair");
  });

  it("deletes the author", async () => {
    const { body } = await graphqlAuthed(
      `
      mutation ($id: BigInt!) {
        deleteAuthor(input: { id: $id }) {
          author { id }
        }
      }
    `,
      { id: authorId },
    );

    expect(body.data.deleteAuthor.author.id).toBe(authorId);

    // Confirm it no longer exists.
    const { body: queryBody } = await graphqlAuthed(
      `
      query ($id: BigInt!) {
        author(id: $id) { id }
      }
    `,
      { id: authorId },
    );

    expect(queryBody.data.author).toBeNull();
  });
});
