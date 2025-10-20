import { EXPORTABLE, wrapPlans } from "postgraphile/utils";
import {
  sideEffect,
  context,
  ExecutableStep,
  FieldArgs,
} from "postgraphile/grafast";

export const LengthCheckPlugin = wrapPlans(
  (context) => {
    // if (context.scope.isRootMutation) {
    return { ctx: context };
    // }
    // return null;
  },
  ({ ctx }) =>
    (plan, step, fieldArgs) => {
      sideEffect(fieldArgs.getRaw(), (args: Record<string, any>) => {
        console.log(
          `Mutation '${ctx.scope.fieldName}' starting with arguments:`,
          args
        );
        console.log("Context:", ctx);
        console.log(
          ctx.fieldWithHooks({ fieldName: ctx.scope.fieldName }, (x: any) => {
            console.log("fieldWithHooks", x);
            return x;
          })
        );
      });

      const $result = plan();

      sideEffect($result, (result) => {
        console.log(`Mutation '${ctx.scope.fieldName}' result:`, result);
      });

      return $result;
    }
);

// const validatePermissions = (propName: string, scope: string) =>
//   EXPORTABLE(
//     (context, sideEffect, propName, scope) =>
//       // biome-ignore lint/suspicious/noExplicitAny: SmartFieldPlanResolver is not an exported type
//       (plan: any, _: ExecutableStep, fieldArgs: FieldArgs) => {
//         const $projectSocial = fieldArgs.getRaw(["input", propName]);
//         // const $currentUser = context<GraphQLContext>().get("currentUser");
//         // const $db = context<GraphQLContext>().get("db");

//         sideEffect([$projectSocial], async ([projectSocial]) => {
//           console.log("LengthCheckPlugin", { projectSocial });
//         });

//         return plan();
//       },
//     [context, sideEffect, propName, scope]
//   );

// export const LengthCheckPlugin = wrapPlans({
//   Mutation: {
//     registerUser: validatePermissions("projectSocial", "create"),
//   },
// });
