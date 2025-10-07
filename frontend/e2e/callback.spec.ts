import { expect, test } from "@playwright/test";

test.describe("/auth/callback", () => {
  test("should render error page if error parameter is supplied", async ({
    page,
    request,
  }) => {
    const upstreamApiError =
      "/auth/callback/?error=access_denied&error_description=invalid%20json%20response%20body%20at%20https%3A%2F%2Flibrary.example%2Fv1%2Fgraphql%20reason%3A%20Unexpected%20token%20%27%3C%27%2C%20%22%3Chtml%3E%0D%0A%3Ch%22...%20is%20not%20valid%20JSON";
    await page.goto(upstreamApiError);

    await expect(
      page.getByRole("heading", { name: "Login Error" })
    ).toBeVisible();
  });

  // TODO: Add a test for the success case.
});
