import { describe, it, expect } from "vitest";
import { graphqlAuthed } from "../helpers";

// Smoke tests for the books CRUD operations. These verify the basic create,
// read, update, and delete lifecycle works through the full HTTP stack.
describe("books", () => {
  it("returns an empty list when no books exist", async () => {
    const { status, body } = await graphqlAuthed(`
      query {
        books { nodes { isbn title } }
      }
    `);

    expect(status).toBe(200);
    expect(body.data.books.nodes).toEqual([]);
  });

  it("creates a book and retrieves it by isbn", async () => {
    const { body: createBody } = await graphqlAuthed(`
      mutation {
        createBook(input: { book: { isbn: "9780451524935", title: "1984" } }) {
          result {
            __typename
            ... on Book { isbn title }
          }
        }
      }
    `);

    expect(createBody.data.createBook.result.__typename).toBe("Book");
    expect(createBody.data.createBook.result.isbn).toBe("9780451524935");
    expect(createBody.data.createBook.result.title).toBe("1984");

    const { body: queryBody } = await graphqlAuthed(`
      query {
        book(isbn: "9780451524935") { isbn title }
      }
    `);

    expect(queryBody.data.book.isbn).toBe("9780451524935");
    expect(queryBody.data.book.title).toBe("1984");
  });

  it("updates a book title", async () => {
    const { body } = await graphqlAuthed(`
      mutation {
        updateBook(input: { isbn: "9780451524935", patch: { title: "Nineteen Eighty-Four" } }) {
          book { isbn title }
        }
      }
    `);

    expect(body.data.updateBook.book.title).toBe("Nineteen Eighty-Four");
  });

  it("deletes a book", async () => {
    const { body: deleteBody } = await graphqlAuthed(`
      mutation {
        deleteBook(input: { isbn: "9780451524935" }) {
          book { isbn }
        }
      }
    `);

    expect(deleteBody.data.deleteBook.book.isbn).toBe("9780451524935");

    // Confirm the book no longer exists.
    const { body: queryBody } = await graphqlAuthed(`
      query {
        book(isbn: "9780451524935") { isbn }
      }
    `);

    expect(queryBody.data.book).toBeNull();
  });
});
