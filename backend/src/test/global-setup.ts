import { createServer } from "http";
import { readFileSync } from "fs";
import { join } from "path";
import { Pool, Client } from "pg";
import { TEST_PUBLIC_JWK } from "./keys";

// The JWKS document served by the test key server. It contains the public half
// of the test RSA key pair so the Fastify server can verify test JWTs.
const JWKS_DOCUMENT = JSON.stringify({ keys: [TEST_PUBLIC_JWK] });

const TEST_DB_NAME = "library_test";
const JWKS_PORT = 5680;
const API_PORT = 5679;

// Build connection options for a superuser session. Locally this falls back
// to peer auth with the current OS user; in CI the PGUSER and PGPASSWORD
// environment variables (or DB_SUPERUSER / DB_SUPERUSER_PASSWORD) provide
// explicit credentials.
const superuserConnectionOptions = () => ({
  database: "postgres",
  host: process.env.DB_HOST,
  port: Number.parseInt(process.env.DB_PORT || "5432"),
  user: process.env.DB_SUPERUSER || process.env.PGUSER || undefined,
  password:
    process.env.DB_SUPERUSER_PASSWORD || process.env.PGPASSWORD || undefined,
});

const setupDatabase = async () => {
  // Connect to the default postgres database to create the test database.
  const adminClient = new Client(superuserConnectionOptions());
  await adminClient.connect();

  // Terminate any existing connections to the test database so the drop
  // succeeds without interference.
  await adminClient.query(`
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE datname = '${TEST_DB_NAME}' AND pid <> pg_backend_pid()
  `);

  await adminClient.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
  await adminClient.query(`CREATE DATABASE ${TEST_DB_NAME}`);
  await adminClient.end();

  // Connect to the test database and apply the schema. We also ensure the
  // api_user role exists since the schema grants privileges to it.
  const testClient = new Client({
    ...superuserConnectionOptions(),
    database: TEST_DB_NAME,
  });
  await testClient.connect();

  await testClient.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'api_user') THEN
        CREATE ROLE api_user WITH LOGIN PASSWORD 'supersecret';
      END IF;
    END $$;
  `);

  const schema = readFileSync(
    join(__dirname, "..", "..", "schema.sql"),
    "utf-8",
  );
  await testClient.query(schema);
  await testClient.end();
};

// Start a minimal HTTP server that serves the JWKS document at the well-known
// endpoint. The Fastify server uses this to verify test JWTs.
const startJwksServer = (): Promise<ReturnType<typeof createServer>> => {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      if (req.url === "/.well-known/jwks.json") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JWKS_DOCUMENT);
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    server.listen(JWKS_PORT, () => resolve(server));
  });
};

export const setup = async () => {
  await setupDatabase();

  const jwksServer = await startJwksServer();

  // Configure environment variables before importing the server module so the
  // Fastify server picks up the test database and JWKS endpoint.
  process.env.DB_NAME = TEST_DB_NAME;
  process.env.DB_USER = "api_user";
  process.env.DB_PASSWORD = "supersecret";
  process.env.PUBLIC_AUTH_JWKS_URL = `http://localhost:${JWKS_PORT}/.well-known/jwks.json`;
  process.env.PUBLIC_AUTH_TOKEN_ISSUER = "https://test-issuer.example.com/";
  process.env.PUBLIC_AUTH_TOKEN_AUDIENCE = "test-audience";
  process.env.NODE_ENV = "test";

  // Dynamic import so the server module reads the env vars we just set.
  const { createApolloServer } = await import("../server");
  const serverAddress = await createApolloServer(API_PORT);
  console.log(`Test server listening at ${serverAddress}`);

  // Return the teardown function that vitest calls after all tests complete.
  return async () => {
    jwksServer.close();

    // Drop the test database so we don't leave artefacts behind.
    const adminClient = new Client(superuserConnectionOptions());
    await adminClient.connect();
    await adminClient.query(`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = '${TEST_DB_NAME}' AND pid <> pg_backend_pid()
    `);
    await adminClient.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await adminClient.end();
  };
};

export default setup;
