import type { RequestHandler } from "@builder.io/qwik-city";

// Override caching for /profile pages to not cache as they are unique per visitor.
export const onGet: RequestHandler = async ({ cacheControl }) => {
  cacheControl({
    public: false,
    noStore: true, // always generate a fresh page
    maxAge: 0,
    sMaxAge: 0,
    staleWhileRevalidate: 0,
  });
};

// // onRequest is a middleware that requires a valid bearer token on all nested
// // routes.
// export const onRequest: RequestHandler = async (event) => {
//   const token = event.sharedMap.get("token");

//   // If the token isn't sent then redirect to the login page.
//   if (!token) {
//     // TODO: Silent authentication.
//     throw event.redirect(302, "/auth/login");
//   }

//   await event.next();
// };
