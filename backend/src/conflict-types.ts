import type {} from "postgraphile";

export const ConflictTypesPlugin: GraphileConfig.Plugin = {
  name: "ConflictTypesPlugin",
  grafast: {
    middleware: {
      execute(next, { args: { operationName, contextValue, requestContext } }) {
        // Not used
        return next();
      },
      establishOperationPlan(next) {
        // Not used
        return next();
      },
      executeStep(next, event) {
        const stepname = Object.getPrototypeOf(event.step).constructor.name;
        console.log(`executeStep: ${stepname}`);

        let rslt: ReturnType<typeof next>;
        try {
          rslt = next();
        } catch (err: any) {
          console.log(`Error occurred in step ${stepname}:`, err);
          throw err;
        }

        if (Array.isArray(rslt)) {
          return Promise.all(rslt).catch((err) => {
            console.log(`Error occurred in step ${stepname}:`, err);
            throw err;
          });
        }

        if (rslt instanceof Promise) {
          return rslt
            .then((items) => Promise.all(items))
            .catch((err) => {
              console.log(`Error occurred in step ${stepname}:`, err);
              throw err;
            });
        }

        return rslt;
      },
    },
  },
};
