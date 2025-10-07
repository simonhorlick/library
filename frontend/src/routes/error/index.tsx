import { component$ } from "@builder.io/qwik";

export default component$(() => {
  throw new Error("This is a test error");
});
