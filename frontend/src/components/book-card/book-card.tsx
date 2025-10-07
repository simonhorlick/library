import { component$, useStyles$ } from "@builder.io/qwik";
import { type FragmentType, getFragmentData, graphql } from "~/__generated__";
import { AuthorCard } from "../author-card/author-card";

// A GraphQL fragment that pulls the fields we need for the book card.
export const BookFragment = graphql(`
  fragment BookFragment on Book {
    title
    isbn
    authors {
      nodes {
        id
        ...AuthorFragment
      }
    }
  }
`);

export const BookCard = component$(
  (props: { book: FragmentType<typeof BookFragment> }) => {
    useStyles$(`
      .book-card {
      }

      .book-card .data {
        font-family: 'IBM Plex Mono', monospace;
      }
    `);

    const book = getFragmentData(BookFragment, props.book);
    return (
      <div class="book-card">
        <div>
          <div class="data">{book.isbn}</div>
          <div class="title">{book.title}</div>
        </div>
        {book.authors &&
          book.authors.nodes.map((author) => (
            <AuthorCard key={author.id} author={author} />
          ))}
      </div>
    );
  }
);
