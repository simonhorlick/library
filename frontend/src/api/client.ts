import type { TypedDocumentString } from "../__generated__/graphql";
import { type GraphQLFormattedError } from "graphql";

export class GraphQLClientError extends Error {
  constructor(private errors: GraphQLFormattedError[]) {
    super(errors.map((e) => e.message).join(", "));
    this.name = "GraphQLClientError";
  }
  getErrors(): GraphQLFormattedError[] {
    return this.errors;
  }
}

export class NotAuthenticatedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotAuthenticatedError";
  }
}

// execute sends a graphql query to the backend.
export async function execute<TResult, TVariables>(
  headers: Record<string, string>,
  controller: AbortController | undefined,
  query: TypedDocumentString<TResult, TVariables>,
  variables?: TVariables
) {
  try {
    const response = await fetch(import.meta.env.PUBLIC_API_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/graphql-response+json",
        ...headers,
      },
      body: JSON.stringify({
        query,
        variables,
      }),
      signal: controller?.signal,
    });

    if (!response.ok) {
      throw new Error("Network response was not ok");
    }

    const responseBody = await response.json();
    console.log(JSON.stringify(responseBody));

    if (responseBody.errors) {
      const errors = responseBody.errors as GraphQLFormattedError[];

      if (errors.some((e) => e.extensions?.code === "invalid-jwt")) {
        throw new NotAuthenticatedError("Not authenticated");
      }

      throw new GraphQLClientError(errors);
    }

    return responseBody.data as TResult;
  } catch (e) {
    console.error(e);
    throw e;
  }
}
