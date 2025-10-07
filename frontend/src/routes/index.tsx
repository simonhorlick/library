import { component$ } from "@builder.io/qwik";
import { type DocumentHead } from "@builder.io/qwik-city";

export default component$(() => {
  return (
    <>
      <h1>Library</h1>
      <a href="/auth/login">Sign In</a>
      <a href="/books">Books</a>
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
