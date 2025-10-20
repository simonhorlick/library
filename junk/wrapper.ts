export const wrapper = wrapPlans(
  (context) => {
    if (context.scope.isRootMutation) {
      return { scope: context.scope };
    }
    return null;
  },
  ({ scope }) =>
    (plan, _, fieldArgs) => {
      sideEffect(fieldArgs.getRaw(), (args) => {
        scope.directives?.forEach((directive) => {
          console.log(
            `Directive @${directive.directiveName} on mutation '${scope.fieldName}'`
          );
        });
        console.log(
          `Mutation '${scope.fieldName}' starting with arguments:`,
          args
        );
      });

      const $result = plan();

      sideEffect($result, (result) => {
        console.log(`Mutation '${scope.fieldName}' result:`, result);
      });

      return $result;
    }
);
