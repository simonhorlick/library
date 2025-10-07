/**
 * Handler that will be called during the execution of a PostLogin flow.
 *
 * @param {Event} event - Details about the user and the context in which they are logging in.
 * @param {PostLoginAPI} api - Interface whose methods can be used to change the behavior of the login.
 */
exports.onExecutePostLogin = async (event, api) => {
  const fetch = require("node-fetch"); // Add node-fetch@2.6.1 as a dependency in the dependencies tab.

  if (event.stats.logins_count === 1) {
    const query = `
mutation CreateUser($user: UserInput!) {
  createUser(input: {user: $user}) {
    user {
      createdAt
    }
  }
}`;

    const variables = {
      user: { email: event.user.email, sub: event.user.user_id },
    };

    const res = await fetch(event.secrets.PUBLIC_API_ENDPOINT, {
      method: "POST",
      body: JSON.stringify({
        query: query,
        variables: { object: variables },
        operationName: "CreateUser",
      }),
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${event.secrets.API_M2M_TOKEN}`,
      },
    });
  }
};

/**
 * Handler that will be invoked when this action is resuming after an external redirect. If your
 * onExecutePostLogin function does not perform a redirect, this function can be safely ignored.
 *
 * @param {Event} event - Details about the user and the context in which they are logging in.
 * @param {PostLoginAPI} api - Interface whose methods can be used to change the behavior of the login.
 */
exports.onContinuePostLogin = async (event, api) => {};
