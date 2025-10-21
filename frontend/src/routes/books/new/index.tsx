import { component$, useSignal, $ } from "@builder.io/qwik";
import { routeLoader$ } from "@builder.io/qwik-city";
import { graphql } from "~/__generated__";
import { execute } from "~/api/client";
import { type BearerToken } from "~/api/token";
import * as v from "valibot";
import { BookInputSchema } from "~/__generated__/valibot";
import { useForm, valiForm$, type InitialValues } from "@modular-forms/qwik";

type BookForm = v.InferInput<ReturnType<typeof BookInputSchema>>;

export const useUser = routeLoader$(({ sharedMap }) => {
  const token = sharedMap.get("token") as string;
  const payload = sharedMap.get("token-payload") as BearerToken;

  return { token, payload };
});

const createBookMutation = graphql(`
  mutation CreateBook($book: BookInput!) {
    createBook(input: { book: $book }) {
      result {
        __typename
        ... on Book {
          isbn
          title
          createdAt
          updatedAt
        }
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

function assertNever(value: never): never {
  throw new Error(`Unhandled case: ${value}`);
}

export default component$(() => {
  const user = useUser();
  const [bookForm, { Form, Field }] = useForm<BookForm>({
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
        onSubmit$={async (values): Promise<void> => {
          errorMessage.value = "";

          try {
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

            const resultType = result.createBook!.result!.__typename;
            switch (resultType) {
              case "Book":
                console.log("Book created:", result);
                return;
              case "BookIsbnConflict":
                errorMessage.value = "A book with this ISBN already exists.";
                showErrorModal.value = true;
                return;
              default:
                // Generate a build failure if there is a new conflict type on
                // the backend.
                const _exhaustiveCheck: never = resultType;
                return assertNever(_exhaustiveCheck);
            }
          } catch (e) {
            errorMessage.value = `Error creating book: ${(e as Error).message}`;
            showErrorModal.value = true;
          }
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
