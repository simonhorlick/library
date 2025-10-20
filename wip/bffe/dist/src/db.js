"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exclusion_violation = exports.check_violation = exports.unique_violation = exports.foreign_key_violation = exports.not_null_violation = exports.restrict_violation = exports.integrity_constraint_violation = void 0;
// See: https://www.postgresql.org/docs/current/errcodes-appendix.html
exports.integrity_constraint_violation = "23000";
exports.restrict_violation = "23001";
exports.not_null_violation = "23502";
exports.foreign_key_violation = "23503";
exports.unique_violation = "23505";
exports.check_violation = "23514";
exports.exclusion_violation = "23P01";
//# sourceMappingURL=db.js.map