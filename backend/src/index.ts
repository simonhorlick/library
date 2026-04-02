// Must be first.
// import "./init-opentelemetry";

import * as dotenv from "dotenv";
import { createApolloServer } from "./server";

// Parse environment variables
dotenv.config();

createApolloServer(5678);
