// import { describe, expect, it } from "vitest";
// import { grafastSync } from "grafast";
// import { schema } from "./signup";

// describe("signup", () => {
//   it("returns a conflict", () => {
//     const result = grafastSync({
//       schema,
//       source: /* GraphQL */ `
//         mutation Signup($email: String!) {
//           signup(input: { email: $email }) {
//             result {
//               __typename
//               # ... on User {
//               #   sub
//               #   email
//               # }
//               # ... on EmailAddressConflict {
//               #   message
//               #   email
//               # }
//             }
//           }
//         }
//       `,
//       variableValues: {
//         email: "conflict@example.com",
//       },
//     });
//     expect(result).toEqual({
//       data: {
//         signup: {
//           __typename: "EmailAddressConflict",
//           message: "Email already in use",
//           email: "conflict@example.com",
//         },
//       },
//     });
//   });
//   // it("returns success", () => {
//   //   const result = grafastSync({
//   //     schema,
//   //     source: /* GraphQL */ `
//   //       {
//   //         signup(input: { email: "ok@example.com" })
//   //       }
//   //     `,
//   //   });
//   //   expect(result).toEqual({
//   //     data: {
//   //       signup: { __typename: "User", id: "1", email: "ok@example.com" },
//   //     },
//   //   });
//   // });
// });
