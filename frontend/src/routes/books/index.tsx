import {
  Resource,
  component$,
  useResource$,
  useSignal,
  useStylesScoped$,
} from "@builder.io/qwik";
import { routeLoader$ } from "@builder.io/qwik-city";
import { graphql } from "~/__generated__";
import { execute } from "~/api/client";
import { type BearerToken } from "~/api/token";
import { BookCard } from "~/components/book-card/book-card";
import styles from "./profile.css?inline";
import { AllBooksQuery } from "~/__generated__/graphql";

export const useUser = routeLoader$(({ sharedMap }) => {
  const token = sharedMap.get("token") as string;
  const payload = sharedMap.get("token-payload") as BearerToken;

  return { token, payload };
});

const queryAllBooks = graphql(`
  query AllBooks($after: Cursor) {
    books(after: $after) {
      nodes {
        isbn
        ...BookFragment
      }
      pageInfo {
        startCursor
        endCursor
        hasNextPage
      }
    }
  }
`);

export default component$(() => {
  const user = useUser();
  const cursor = useSignal(null as string | null);

  const books = useResource$<AllBooksQuery>(({ track, cleanup }) => {
    // TODO: It's better to create an API client from the token and pass it
    // via the context.
    track(() => cursor.value);
    const controller = new AbortController();
    cleanup(() => controller.abort());
    return execute(
      {
        authorization: `Bearer ${user.value.token}`,
      },
      controller,
      queryAllBooks,
      {
        after: cursor.value,
      }
    );
  });

  useStylesScoped$(styles);

  return (
    <>
      <h1>Books</h1>
      <a href="/auth/logout">Sign Out</a>
      <main>
        <Resource
          value={books}
          onRejected={(err) => <div>Failed to fetch books: {err.message}</div>}
          onResolved={(response) => {
            const books = response.books?.nodes;
            if (books === null || books === undefined || books.length === 0) {
              return <div>No books found</div>;
            }
            return (
              <>
                {response.books?.pageInfo.hasNextPage && (
                  <button
                    onClick$={() =>
                      (cursor.value = response.books?.pageInfo.endCursor)
                    }
                  >
                    Next
                  </button>
                )}
                {books.map((book) => (
                  <BookCard key={book.isbn} book={book} />
                ))}
              </>
            );
          }}
        />
      </main>
    </>
  );
});
