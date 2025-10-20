// import "graphile-config";

// import type { PgResource } from "@dataplan/pg";
// import type { GrafastFieldConfig } from "grafast";
// import { EXPORTABLE } from "graphile-build";

// declare global {
//   namespace GraphileConfig {
//     interface Plugins {
//       PgMutationCreateConflictLoggerPlugin: true;
//     }
//   }

//   namespace GraphileBuild {
//     interface ScopeObjectFieldsField {
//       /**
//        * The PostGraphile resource that this mutation operates on. Populated by
//        * PgMutationCreatePlugin.
//        */
//       pgFieldResource?: PgResource<any, any, any, any, any>;
//     }
//   }
// }

// const WRAPPED = Symbol("PgMutationCreateConflictLoggerPluginWrapped");

// export const PgMutationCreateConflictLoggerPlugin: GraphileConfig.Plugin = {
//   name: "PgMutationCreateConflictLoggerPlugin",
//   description:
//     "Wraps create mutation plans so that database constraint failures are logged",
//   version: "0.1.0",
//   after: ["PgMutationCreatePlugin"],

//   schema: {
//     hooks: {
//       GraphQLObjectType_fields_field(field, build, context) {
//         const {
//           scope: { isPgCreateMutation, pgFieldResource },
//         } = context;
//         if (!isPgCreateMutation || !pgFieldResource) {
//           return field;
//         }

//         const { plan: oldPlan } = field as GrafastFieldConfig<any, any, any>;
//         if (!oldPlan || (oldPlan as any)[WRAPPED]) {
//           return field;
//         }

//         const {
//           grafast: { list, lambda, sideEffect },
//         } = build;

//         const resourceName = pgFieldResource.name;

//         const plan = EXPORTABLE(
//           (oldPlan, list, lambda, sideEffect, resourceName) =>
//             function planWithConstraintLogging(...planArgs: any[]) {
//               const $payload = oldPlan.apply(this as any, planArgs);
//               const getStepForKey =
//                 $payload && typeof $payload.getStepForKey === "function"
//                   ? $payload.getStepForKey
//                   : null;
//               if (!getStepForKey) {
//                 return $payload;
//               }
//               const $result = getStepForKey.call($payload, "result", true);
//               if (!$result) {
//                 return $payload;
//               }

//               const $loggedResult = sideEffect($result, (value: any) => {
//                 if (
//                   value &&
//                   typeof value === "object" &&
//                   "flags" in value &&
//                   "value" in value
//                 ) {
//                   const flagged = value as {
//                     flags?: number;
//                     value?: any;
//                   };
//                   const error = flagged.value;
//                   if (error && typeof error === "object") {
//                     const code = (error as any).code;
//                     if (typeof code === "string" && code.startsWith("23")) {
//                       const constraint = (error as any).constraint;
//                       const detail = (error as any).detail;
//                       const constraintText =
//                         constraint != null
//                           ? ` constraint '${String(constraint)}'`
//                           : "";
//                       const detailText = detail ? ` detail: ${detail}` : "";
//                       console.warn(
//                         `[postgraphile] Insert conflict on resource '${resourceName}' (code ${code})${constraintText}${detailText}`
//                       );
//                     }
//                   }
//                 }
//                 return value;
//               });

//               return lambda(
//                 list([$loggedResult, $payload]),
//                 ([, payload]) => payload,
//                 true
//               );
//             },
//           [oldPlan, list, lambda, sideEffect, resourceName]
//         );
//         (plan as any)[WRAPPED] = true;

//         return {
//           ...field,
//           plan,
//         } satisfies typeof field;
//       },
//     },
//   },
// };
