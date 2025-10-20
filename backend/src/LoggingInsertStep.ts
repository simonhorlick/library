import type { PgInsertSingleStep, PgResource } from "@dataplan/pg";
import type { ExecutionDetails } from "grafast";

/**
 * Wraps a PgInsertSingleStep with error logging in the execute method.
 * This function intercepts the execute method to add try-catch logging
 * while maintaining full compatibility with PgInsertSingleStep.
 *
 * @param step - The PgInsertSingleStep to wrap
 * @returns The same step with execute method wrapped for logging
 */
export function wrapWithLogging<
  TResource extends PgResource<any, any, any, any, any> = PgResource
>(step: PgInsertSingleStep<TResource>): PgInsertSingleStep<TResource> {
  // Store the original execute method
  const originalExecute = step.execute.bind(step);

  // Replace the execute method with our logging wrapper
  step.execute = async function execute(details: ExecutionDetails) {
    try {
      // Call the original execute method
      return await originalExecute(details);
    } catch (error) {
      // Log the error
      console.error("Error executing PgInsertSingleStep:", error);

      // Re-throw the error to maintain the original behavior
      throw error;
    }
  };

  // Return the same step instance with modified execute
  return step;
}
