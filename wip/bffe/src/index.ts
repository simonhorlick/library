import { createApolloServer } from "./server";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import dotenv from "dotenv";
import * as schema from "./schema";

async function launch() {
  // Load environment variables.
  dotenv.config();

  const pool = new Pool({
    database: process.env.DB_NAME || "library",
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: Number.parseInt(process.env.DB_PORT || "5432"),
  });

  const db = drizzle(pool, { schema, logger: false });

  const { server, url } = await createApolloServer(4000, { db: db });
  console.log(`Listening on ${url}`);
}

launch();
