import { wrapWithLogging } from "./LoggingInsertStep";
import { pgInsertSingle } from "@dataplan/pg";

/**
 * Example usage of wrapWithLogging
 *
 * This example demonstrates how to wrap a PgInsertSingleStep with logging.
 *
 * Usage in your plugin:
 *
 * ```typescript
 * // Instead of using pgInsertSingle directly:
 * const $insert = pgInsertSingle(resource, Object.create(null));
 *
 * // Wrap it with wrapWithLogging for error logging:
 * const $insert = wrapWithLogging(
 *   pgInsertSingle(resource, Object.create(null))
 * );
 * ```
 *
 * The wrapWithLogging function will:
 * 1. Intercept the execute method of the step
 * 2. Wrap it with try-catch for error logging
 * 3. Log any errors that occur during execution
 * 4. Re-throw the error to maintain normal error handling flow
 * 5. Return the same step instance, maintaining full compatibility
 */

export function exampleUsage() {
  // This is a conceptual example - actual usage would be in a GraphQL mutation plugin
  console.log(
    "wrapWithLogging wraps PgInsertSingleStep.execute to add error logging"
  );
  console.log("See LoggingInsertStep.ts for implementation details");
}
