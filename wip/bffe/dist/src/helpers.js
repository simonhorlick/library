"use strict";
// import {
//   BuildQueryResult,
//   DBQueryConfig,
//   ExtractTablesWithRelations,
// } from "drizzle-orm/relations";
// import {
//   FieldViolation as FieldViolationType,
//   InvalidPaymentMethodError as InvalidPaymentMethodErrorType,
//   InsufficientStockError as InsufficientStockErrorType,
//   Product,
// } from "./__generated__/resolvers-types";
// import * as schema from "./schema";
// type Schema = typeof schema;
// type TSchema = ExtractTablesWithRelations<Schema>;
// export type IncludeRelation<TableName extends keyof TSchema> = DBQueryConfig<
//   "one" | "many",
//   boolean,
//   TSchema,
//   TSchema[TableName]
// >["with"];
// export type InferResultType<
//   TableName extends keyof TSchema,
//   With extends IncludeRelation<TableName> | undefined = undefined
// > = BuildQueryResult<
//   TSchema,
//   TSchema[TableName],
//   {
//     with: With;
//   }
// >;
// export const FieldViolation = (
//   field: string,
//   code: string,
//   message: string
// ): FieldViolationType => ({
//   __typename: "FieldViolation",
//   field,
//   code,
//   message,
// });
// export const RequiredField = (
//   field: string,
//   message: string
// ): FieldViolationType => ({
//   __typename: "FieldViolation",
//   field,
//   code: "required",
//   message,
// });
// export const InvalidPaymentMethodError = (
//   message: string
// ): InvalidPaymentMethodErrorType => ({
//   __typename: "InvalidPaymentMethodError",
//   message,
// });
// export const InsufficientStockError = (
//   message: string
// ): InsufficientStockErrorType => ({
//   __typename: "InsufficientStockError",
//   message,
// });
//# sourceMappingURL=helpers.js.map