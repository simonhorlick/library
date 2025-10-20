import { component$, useSignal, useStore, $ } from "@builder.io/qwik";
import { routeLoader$, useNavigate } from "@builder.io/qwik-city";
import { graphql } from "~/__generated__";
import { execute, GraphQLClientError } from "~/api/client";
import { type BearerToken } from "~/api/token";
import * as v from "valibot";
import { BookInputSchema } from "~/__generated__/valibot";
import {
  formAction$,
  useForm,
  valiForm$,
  type InitialValues,
} from "@modular-forms/qwik";
import {
  CreateBookInput,
  CreateBookMutation,
  CreateBookPayload,
} from "~/__generated__/graphql";

type BookForm = v.InferInput<ReturnType<typeof BookInputSchema>>;

export const useUser = routeLoader$(({ sharedMap }) => {
  const token = sharedMap.get("token") as string;
  const payload = sharedMap.get("token-payload") as BearerToken;

  return { token, payload };
});

const createBookMutation = graphql(`
  mutation CreateBook($book: BookInput!) {
    createBook(input: { book: $book }) {
      book {
        isbn
        title
        createdAt
        updatedAt
      }
    }
  }
`);

export const useFormLoader = routeLoader$<InitialValues<BookForm>>(() => {
  return {
    isbn: "",
    title: "",
  };
});

export default component$(() => {
  const user = useUser();
  const [bookForm, { Form, Field, FieldArray }] = useForm<BookForm>({
    loader: useFormLoader(),
    validate: valiForm$(BookInputSchema()),
  });
  const errorMessage = useSignal("");
  const showErrorModal = useSignal(false);

  const closeErrorModal = $(() => {
    showErrorModal.value = false;
    errorMessage.value = "";
  });

  return (
    <>
      <Form
        onSubmit$={async (values) => {
          errorMessage.value = "";

          const result = await execute(
            {
              authorization: `Bearer ${user.value.token}`,
            },
            undefined,
            createBookMutation,
            {
              book: values,
            }
          );
          console.log("Book created:", result);
        }}
      >
        <Field name="isbn">
          {(field, props) => (
            <div>
              <label for={field.name}>ISBN</label>
              <input
                {...props}
                id={field.name}
                value={field.value}
                type="text"
              />
              {field.error && <div>{field.error}</div>}
            </div>
          )}
        </Field>
        <Field name="title">
          {(field, props) => (
            <div>
              <label for={field.name}>Title</label>
              <input
                {...props}
                id={field.name}
                value={field.value}
                type="text"
              />
              {field.error && <div>{field.error}</div>}
            </div>
          )}
        </Field>
        <button
          type="submit"
          disabled={bookForm.invalid || bookForm.submitting}
        >
          Add Book
        </button>
      </Form>
      {showErrorModal.value && (
        <div>
          <div>
            <h3>Error Creating Book</h3>
            <p>{errorMessage.value}</p>
            <div style={{ textAlign: "right" }}>
              <button onClick$={closeErrorModal}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});

// export default component$(() => {
//   const user = useUser();
//   const nav = useNavigate();

//   // Form state
//   const form = useStore({
//     isbn: "",
//     title: "",
//   });

//   // UI state
//   const isSubmitting = useSignal(false);
//   const errorMessage = useSignal("");
//   const showErrorModal = useSignal(false);

//   const handleSubmit = $(async (event: Event) => {
//     event.preventDefault();

//     // Basic validation
//     if (!form.isbn.trim() || !form.title.trim()) {
//       errorMessage.value = "Both ISBN and title are required.";
//       showErrorModal.value = true;
//       return;
//     }

//     isSubmitting.value = true;
//     errorMessage.value = "";

//     try {
//       await execute(
//         {
//           authorization: `Bearer ${user.value.token}`,
//         },
//         undefined,
//         createBookMutation,
//         {
//           book: {
//             isbn: form.isbn.trim(),
//             title: form.title.trim(),
//           },
//         }
//       );

//       // Success - redirect to books list
//       nav("/books/");
//     } catch (error) {
//       if (error instanceof GraphQLClientError) {
//         const errors = error.getErrors();
//         errorMessage.value = errors.map((e) => e.message).join(", ");
//       } else {
//         errorMessage.value = "An unexpected error occurred. Please try again.";
//       }
//       showErrorModal.value = true;
//     } finally {
//       isSubmitting.value = false;
//     }
//   });

//   const closeErrorModal = $(() => {
//     showErrorModal.value = false;
//     errorMessage.value = "";
//   });

//   return (
//     <>
//       <h1>Add New Book</h1>

//       <form onSubmit$={handleSubmit} preventdefault:submit>
//         <div>
//           <label for="isbn">ISBN:</label>
//           <input
//             id="isbn"
//             type="text"
//             value={form.isbn}
//             onInput$={(event) => {
//               form.isbn = (event.target as HTMLInputElement).value;
//             }}
//             placeholder="Enter 10 or 13 digit ISBN"
//             disabled={isSubmitting.value}
//             required
//           />
//         </div>

//         <div>
//           <label for="title">Title:</label>
//           <input
//             id="title"
//             type="text"
//             value={form.title}
//             onInput$={(event) => {
//               form.title = (event.target as HTMLInputElement).value;
//             }}
//             placeholder="Enter book title"
//             disabled={isSubmitting.value}
//             required
//           />
//         </div>

//         <div
//           style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}
//         >
//           <button
//             type="button"
//             onClick$={() => nav("/books/")}
//             disabled={isSubmitting.value}
//           >
//             Cancel
//           </button>
//           <button type="submit" disabled={isSubmitting.value}>
//             {isSubmitting.value ? "Adding..." : "Add Book"}
//           </button>
//         </div>
//       </form>

//       {/* Error Modal */}
//       {showErrorModal.value && (
//         <div>
//           <div>
//             <h3>Error Creating Book</h3>
//             <p>{errorMessage.value}</p>
//             <div style={{ textAlign: "right" }}>
//               <button onClick$={closeErrorModal}>Close</button>
//             </div>
//           </div>
//         </div>
//       )}
//     </>
//   );
// });
