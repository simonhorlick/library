import { describe, it, expect } from "vitest";
import { graphqlAuthed } from "../helpers";

// Smoke tests for the book-authors many-to-many relationship. We create a book
// and an author, link them, verify the relationship, then clean up.
describe("book-authors", () => {
  const isbn = "9780140283334";
  let authorId: string;

  it("creates a book and an author", async () => {
    const { body: bookBody } = await graphqlAuthed(`
      mutation {
        createBook(input: { book: { isbn: "${isbn}", title: "Animal Farm" } }) {
          result {
            __typename
            ... on Book { isbn }
          }
        }
      }
    `);
    expect(bookBody.data.createBook.result.__typename).toBe("Book");

    const { body: authorBody } = await graphqlAuthed(`
      mutation {
        createAuthor(input: { author: { name: "George Orwell" } }) {
          result {
            __typename
            ... on Author { id name }
          }
        }
      }
    `);
    expect(authorBody.data.createAuthor.result.__typename).toBe("Author");
    authorId = authorBody.data.createAuthor.result.id;
  });

  it("links the book to the author", async () => {
    const { body } = await graphqlAuthed(
      `
      mutation ($authorId: BigInt!) {
        createBookAuthor(input: { bookAuthor: { bookIsbn: "${isbn}", authorId: $authorId } }) {
          result {
            __typename
            ... on BookAuthor { bookIsbn authorId }
          }
        }
      }
    `,
      { authorId },
    );

    expect(body.data.createBookAuthor.result.bookIsbn).toBe(isbn);
  });

  it("queries the book and sees its authors via the relationship", async () => {
    const { body } = await graphqlAuthed(`
      query {
        book(isbn: "${isbn}") {
          isbn
          title
          authors { nodes { id name } }
        }
      }
    `);

    expect(body.data.book.authors.nodes).toHaveLength(1);
    expect(body.data.book.authors.nodes[0].name).toBe("George Orwell");
  });

  it("removes the link and verifies the book has no authors", async () => {
    const { body: deleteBody } = await graphqlAuthed(
      `
      mutation ($authorId: BigInt!) {
        deleteBookAuthor(input: { bookIsbn: "${isbn}", authorId: $authorId }) {
          bookAuthor { bookIsbn authorId }
        }
      }
    `,
      { authorId },
    );

    expect(deleteBody.data.deleteBookAuthor.bookAuthor.bookIsbn).toBe(isbn);

    const { body: queryBody } = await graphqlAuthed(`
      query {
        book(isbn: "${isbn}") {
          authors { nodes { id } }
        }
      }
    `);

    expect(queryBody.data.book.authors.nodes).toHaveLength(0);
  });

  // Clean up the test data so other test suites start with a clean slate.
  it("cleans up", async () => {
    await graphqlAuthed(
      `
      mutation ($authorId: BigInt!) {
        deleteAuthor(input: { id: $authorId }) { author { id } }
      }
    `,
      { authorId },
    );

    await graphqlAuthed(`
      mutation {
        deleteBook(input: { isbn: "${isbn}" }) { book { isbn } }
      }
    `);
  });
});
