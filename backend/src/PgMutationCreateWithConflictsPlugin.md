# Prompts

We want to create a plugin for postgraphile that will generate graphql mutations to insert objects. This is already handled by PgMutationCreatePlugin.ts, however we want to adjust the generated payload types to contain the created object on success, but also a Conflict type containing details of any database constraint failure that might be thrown from the database. A concrete example of this would be:

```graphql
type Mutation {
  createBook(input: CreateBookInput!): CreateBookPayload
}

input CreateBookInput {
  title: String!
  author: String!
}

type CreateBookPayload {
  result: CreateBookResult
  query: Query
}

union CreateBookResult =
    CreatedBook
  | DatabaseConflict

type CreatedBook {
  id: BigInt!
  title: String!
  author: String!
}

type DatabaseConflict {
  message: String!
}
```

Examine the codebase and suggest some ways that this functionality could be implemented.

## GPT-5-Codex

Read [](file:///Users/simon/src/github.com/graphile/crystal/grafast/grafast/src/constants.ts)

Searched text for `TRAP_ERROR` (`**/grafast/**`), 20 results

Read [](file:///Users/simon/src/github.com/graphile/crystal/grafast/grafast/__tests__/trap-test.ts#1-1), lines 1 to 200

Searched text for `PASS_THROUGH` (`**/grafast/**`), 20 results

Read [](file:///Users/simon/src/github.com/graphile/crystal/grafast/grafast/src/steps/__flag.ts#40-40), lines 40 to 160

Read [](file:///Users/simon/src/github.com/graphile/crystal/grafast/grafast/src/steps/__flag.ts#160-160), lines 160 to 320

Read [](file:///Users/simon/src/github.com/graphile/crystal/grafast/grafast/src/steps/lambda.ts)

Read [](file:///Users/simon/src/github.com/graphile/crystal/grafast/grafast/src/step.ts#1-1), lines 1 to 160

Searched text for `addDataDependency` (`**/grafast/**`), 13 results

Read [](file:///Users/simon/src/github.com/graphile/crystal/grafast/grafast/src/step.ts#640-640), lines 640 to 760

Checked PgMutationCreatePlugin.ts (payload wiring) and pgInsertSingle.ts (mutator execution). Here are three viable implementation strategies:

1. Fork-and-replace create payload  
   - Duplicate `PgMutationCreatePlugin`, change the payload registration to build a `result` field plus a `DatabaseConflict` type and union (`build.registerUnionType`).  
   - In the mutation plan, wrap the `PgInsertSingleStep` with `trap($insert, TRAP_ERROR, { valueForError: "PASS_THROUGH" })` and map successes vs trapped `DatabaseError` objects via `lambda`.  
   - On success, return `{ __typename: "CreatedBook", record: $insert }`; on error inspect `constraint`/`code` and return `{ __typename: "DatabaseConflict", message, ... }`.  
   - Ensures full control but requires maintaining a near-copy of the stock plugin.

2. Layered plugin that patches the existing payload  
   - Write a plugin that runs after `PgMutationCreatePlugin`, hooking `GraphQLObjectType_fields` for scopes with `isPgCreatePayloadType`.  
   - Replace the table field with a lazy `result` field, registering the union/type only once per resource (`build.registerUnionType`, `build.registerObjectType`).  
   - Inject a `makeWrapPlansPlugin` (see makeWrapPlansPlugin.ts) to wrap the mutation plan, convert the existing `$insert` result into `{ result: ... }`, and use `grafast.trap` to surface constraint failures.  
   - Keeps upstream plugin intact; risk is coordinating field removal/replacement carefully.

3. Plan-only wrapper  
   - Leave the schema untouched but use `makeWrapPlansPlugin` to re-shape the mutation output at plan time: wrap the existing payload step, convert `tableFieldName` + `clientMutationId` into an object that also carries a derived `result` union.  
   - Detect conflicts by trapping errors from `$object.get("result")`, returning a tagged object; success path returns `{ __typename: tableTypeName, ... }`.  
   - Add a companion schema plugin registering the union + conflict object and exposing a resolver that reads the tagged objects placed in the payload.  
   - Minimises schema churn but requires careful plan surgery to avoid double-selecting the row.

Across all approaches you’ll need:  
- A helper that converts a `DatabaseError` (`code === '23505'`, `constraint` etc.) into your Conflict payload.  
- A new type registration site (e.g. `DatabaseConflict`) under `GraphileBuild` scopes so other plugins can extend it if needed.  
- Tests covering both success and unique-constraint failure (see patterns in RegisterUserPlugin.test.ts for unions + traps).

Natural next steps: decide how invasive you’re comfortable being (option 1 = most explicit, option 2 = additive, option 3 = surgical), then spike the runtime error-trapping logic before committing to the schema shape.

### Use the "Fork-and-replace create payload" strategy to create a plugin.

Read [](file:///Users/simon/src/github.com/graphile/crystal/graphile-build/graphile-build-pg/src/plugins/PgMutationCreateConflictLoggerPlugin.ts)

Searched text for `isPgCreatePayloadType` (`**/graphile-build/**`), 4 results

Searched text for `isPgCreatePayloadType` (`**/*.ts`), 2 results

Searched text for `registerUnionType(` (`**/graphile-build/**/*.ts`), 3 results

Read [](file:///Users/simon/src/github.com/graphile/crystal/graphile-build/graphile-utils/src/makeExtendSchemaPlugin.ts#720-720), lines 720 to 820

Read [](file:///Users/simon/src/github.com/graphile/crystal/grafast/website/grafast/step-library/standard-steps/trap.mdx)

Searched text for `FLAG_ERROR` (`**/grafast/grafast/src/index.ts`), no results

Searched text for `TRAP_ERROR` (`**/graphile-build/**`), no results

Searched text for `TRAP_ERROR` (`**/graphile-build/src/**/*.ts`), no results

Searched text for `condition(` (`**/grafast/**/*.ts`), 20 results

Read [](file:///Users/simon/src/github.com/graphile/crystal/grafast/grafast/src/steps/condition.ts)

Searched text for `function get(` (`**/grafast/grafast/src/**`), no results

Searched text for `export function get` (`**/grafast/grafast/src/**`), 8 results

Read [](file:///Users/simon/src/github.com/graphile/crystal/grafast/grafast/src/steps/get.ts)

Read [](file:///Users/simon/src/github.com/graphile/crystal/grafast/grafast/src/constants.ts)

Searched text for `TRAP_ERROR` (`**/graphile-build/src/global.ts`), no results

Read [](file:///Users/simon/src/github.com/graphile/crystal/grafast/grafast/src/steps/access.ts#1-1), lines 1 to 200

Created [](file:///Users/simon/src/github.com/graphile/crystal/graphile-build/graphile-build-pg/src/plugins/PgMutationCreateWithConflictsPlugin.ts)

Searched text for `getOutputTypeByName` (`**/graphile-build/**`), 20 results

Using "Apply Patch"


```

```


Using "Apply Patch"


```

```


Using "Apply Patch"


```

```


Using "Apply Patch"


```

```


Checked [](file:///Users/simon/src/github.com/graphile/crystal/graphile-build/graphile-build-pg/src/plugins/PgMutationCreateWithConflictsPlugin.ts), no problems found

Forked pg-create mutation support into a dedicated plugin that emits a union payload with conflict reporting.

- Added `PgMutationCreateWithConflictsPlugin` (PgMutationCreateWithConflictsPlugin.ts). It mirrors create-mutation wiring but:
  - Registers a per-table conflict object type and a result union (table type | conflict) via new inflection helpers.
  - Wraps the insert step with `trap`/`lambda` logic to detect `23***` constraint errors, gate error recovery, and surface conflict metadata while leaving other errors untouched.
  - Keeps the original table field for backward compatibility and exposes a new `result` field using the union.
- Exported the plugin from index.ts so it can be included in presets.

Switch your preset from `PgMutationCreatePlugin` to the new `PgMutationCreateWithConflictsPlugin` (and optionally keep the logger wrapper) to try it out. Next, consider wiring tests around unique violations to ensure the conflict branch stays stable and decide whether to deprecate the legacy table field in favor of the union.

Made changes.