import { PostGraphileAmberPreset } from "postgraphile/presets/amber";
import { PgSimplifyInflectionPreset } from "@graphile/simplify-inflection";
import { makeV4Preset } from "postgraphile/presets/v4";
import { makePgService } from "postgraphile/adaptors/pg";
import { Pool } from "pg";
import { jsonPgSmartTags } from "postgraphile/utils";
import { RegisterUserPlugin } from "./register";
import { OTELPlugin } from "@haathie/postgraphile-otel";
import { ReasonableLimitsPlugin } from "@haathie/postgraphile-reasonable-limits";
import { PgManyToManyPreset } from "@graphile-contrib/pg-many-to-many";
import { grafserv } from "postgraphile/grafserv/node";

/*
  Create a user for postgraphile with the following SQL:
    CREATE USER api_user WITH PASSWORD 'supersecret';
    GRANT CONNECT ON DATABASE library TO api_user;
    GRANT USAGE ON SCHEMA public TO api_user;

    GRANT ALL PRIVILEGES ON books TO api_user;
    GRANT ALL PRIVILEGES ON book_authors TO api_user;
    GRANT ALL PRIVILEGES ON authors TO api_user;
    GRANT ALL PRIVILEGES ON users TO api_user;

  Or, if you want to restrict access to read-only:
    REVOKE ALL ON users FROM public;
*/
/*
  Or better yet, a more fine-grained approach:
    GRANT SELECT ON users TO api_user;
    GRANT INSERT (sub, email) ON users TO api_user;
    GRANT UPDATE (email) ON users TO api_user;
    --GRANT DELETE ON users TO api_user;

  Note, do not use column-level select grants as this prevents statements like
  SELECT * FROM users.
*/
const pool = new Pool({
  database: process.env.DB_NAME || "library",
  user: process.env.DB_USER || "api_user",
  password: process.env.DB_PASSWORD || "supersecret",
  host: process.env.DB_HOST,
  port: Number.parseInt(process.env.DB_PORT || "5432"),
});

const MySmartTagsPlugin = jsonPgSmartTags({
  version: 1,
  config: {
    class: {
      /* Tags specify which operations are emitted, but do not define the
         security model. If there are tables that should be inaccessible then
         they must be configured correctly in postgres.
      */
      books: {
        tags: {
          omit: "create,update,delete",
          maxRecordsPerPage: "200",
          defaultRecordsPerPage: "10",
          // behaviour: "+list",
        },
      },
      authors: {
        tags: {
          omit: "create,update,delete",
          maxRecordsPerPage: "200",
          defaultRecordsPerPage: "10",
          // behaviour: "+list",
        },
      },
      users: {
        tags: {
          omit: "create,delete",
          maxRecordsPerPage: "200",
          defaultRecordsPerPage: "10",
          // behaviour: "+list",
        },
      },
      book_authors: {
        tags: {
          // omitting read causes problems with many-to-many relationships.
          // omitting many here prevents the automatic generation of a
          // book_authors link on books (this is what we want, we want authors
          // on books).
          omit: "all,create,update,delete,many",
          // behaviour: "+list",
        },
      },
    },
    attribute: {
      // Timestamp fields are set by the database and should not be editable by
      // clients.
      created_at: { tags: { omit: "create,update" } },
      updated_at: { tags: { omit: "create,update" } },
    },
    constraint: {
      fk_book_author_id: {
        tags: {
          // otherwise the generated field name on books is "authorsByBookAuthorBookIsbnAndAuthorId"
          manyToManyFieldName: "authors",
        },
      },
    },
  },
});

/** @type {GraphileConfig.Preset} */
const preset = {
  grafserv: {
    dangerouslyAllowAllCORSRequests: true,
  },
  grafast: {
    timeouts: {
      planning: 100,
      execution: 1_000,
    },
    explain: true, // DO NOT ENABLE IN PRODUCTION!
  },
  extends: [
    PostGraphileAmberPreset,
    PgSimplifyInflectionPreset,
    PgManyToManyPreset,
    makeV4Preset({
      // Inspect the GRANT/REVOKE privileges in the database and reflect these
      // in the GraphQL schema.
      ignoreRBAC: false,
      // Not used.
      subscriptions: false,
      // This allows some results to be non-null, but assumes you don't return
      // nulls in confusing ways.
      setofFunctionsContainNulls: false,
      // For development.
      showErrorStack: "json",
      extendedErrors: ["hint", "detail", "errcode"],
      // Place the generated graphql schema at the project root.
      exportGqlSchemaPath: "../backend.graphql",
    }),
  ],

  plugins: [
    MySmartTagsPlugin,
    RegisterUserPlugin,
    OTELPlugin,
    ReasonableLimitsPlugin,
  ],

  pgServices: [
    makePgService({
      pool,
      schemas: ["public"],
      pgSettings: (req: any) => ({
        // Reduce the chance of denial of service attacks by setting a
        // statement timeout.
        // Adds another query to each request.
        statement_timeout: "3000",

        // Application-specific settings must be prefixed with a unique string.
        "app.token.sub": req.fastifyv4.request.token?.sub ?? null,
        "app.token.scope": req.fastifyv4.request.token?.scope ?? null,
      }),
    }),
  ],

  schema: {
    dontSwallowErrors: true,
  },
};

export default preset;
