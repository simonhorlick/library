import { component$ } from "@builder.io/qwik";
import { type DocumentHead } from "@builder.io/qwik-city";

export default component$(() => {
  return (
    <>
      <h1>Library</h1>
      <ul>
        <li>
          <a href="/auth/login">Sign In</a>
        </li>
        <li>
          <a href="/auth/logout">Sign Out</a>
        </li>
        <li>
          <a href="/books">Books</a>
        </li>
      </ul>
    </>
  );
});

export const head: DocumentHead = {
  title: "Library",
  meta: [
    {
      name: "description",
      content: "Library",
    },
  ],
};
