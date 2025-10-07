import { type RequestHandler } from "@builder.io/qwik-city";
import {
  RedirectMessage,
  ServerError,
} from "@builder.io/qwik-city/middleware/request-handler";
import { isDev } from "@builder.io/qwik/build";
import { SpanStatusCode, trace } from "@opentelemetry/api";

// This middleware will run right at the top of the stack, so it can catch
// errors from all other middleware and routes.
export const onRequest: RequestHandler = async ({ next }) => {
  try {
    return await next();
  } catch (err) {
    // Pass through 3xx redirects
    if (isRedirectMessage(err)) {
      throw err;
    }

    // Pass through ServerErrors
    if (isServerError(err)) {
      throw err;
    }

    // Log unknown errors
    if (err instanceof Error) {
      trace.getActiveSpan()?.recordException(err);
      trace.getActiveSpan()?.setStatus({
        code: SpanStatusCode.ERROR,
        message: err.message,
      });
    }

    if (isDev) {
      throw err;
    } else {
      throw new ServerError(500, "Internal server error");
    }
  }
};

function isServerError(err: unknown): err is ServerError {
  return (
    err instanceof ServerError ||
    // This is required for dev environments due to an issue with vite: https://github.com/vitejs/vite/issues/3910
    (isDev && err instanceof Error && err.constructor.name === "ServerError")
  );
}

function isRedirectMessage(err: unknown): err is RedirectMessage {
  return (
    err instanceof RedirectMessage ||
    // This is required for dev environments due to an issue with vite: https://github.com/vitejs/vite/issues/3910
    (isDev &&
      err instanceof Error &&
      err.constructor.name === "RedirectMessage")
  );
}
