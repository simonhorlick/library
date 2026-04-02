/**
 * Playwright Global Setup
 */

import dotenv from "dotenv";

async function globalSetup() {
  // Load test environment variables
  dotenv.config({ path: ".env.test" });
}

export default globalSetup;
