"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userTable = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
exports.userTable = (0, pg_core_1.pgTable)("users", {
    id: (0, pg_core_1.bigint)("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    name: (0, pg_core_1.text)().notNull(),
    email: (0, pg_core_1.text)().notNull(),
    bio: (0, pg_core_1.text)(),
    created_at: (0, pg_core_1.timestamp)("created_at", {
        withTimezone: true,
        mode: "date",
    }).defaultNow(),
    updated_at: (0, pg_core_1.timestamp)("updated_at", {
        withTimezone: true,
        mode: "date",
    }).defaultNow(),
});
//# sourceMappingURL=schema.js.map