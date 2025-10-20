// import { ApolloServer } from "@apollo/server";
// import { afterAll, beforeAll, describe, expect, it } from "vitest";
// import { createApolloServer, Context } from "./server";
// import request from "supertest";
// // import * as schema from "./schema";
// import { Pool } from "pg";
// import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
// import { readFileSync } from "fs";
// import { eq } from "drizzle-orm/expressions";

// describe("e2e demo", () => {
//   let server: ApolloServer<Context>;
//   let url: string;
//   let db: NodePgDatabase<typeof schema>;

//   // before the tests we spin up a new Apollo Server
//   beforeAll(async () => {
//     const pool = new Pool({
//       database: "book_store_test",
//       user: process.env.DB_USER,
//       password: process.env.DB_PASSWORD,
//       host: process.env.DB_HOST,
//       port: Number.parseInt(process.env.DB_PORT || "5432"),
//     });

//     db = drizzle(pool, { schema, logger: true });

//     const migrations = readFileSync("../schema.sql", { encoding: "utf-8" });

//     await db.execute(migrations);

//     // Note we must wrap our object destructuring in parentheses because we already declared these variables
//     // We pass in the port as 0 to let the server pick its own ephemeral port for testing
//     ({ server, url } = await createApolloServer(0, { db: db }));

//     console.log(`started server`);
//   });

//   // after the tests we'll stop the server
//   afterAll(async () => {
//     await server.stop();

//     const migrations = readFileSync("../schema-down.sql", {
//       encoding: "utf-8",
//     });
//     await db.execute(migrations);
//   });

//   const listBooksQuery = `
//     query ListBooks {
//       listBooks {
//         ...BookFragment
//       }
//     }
//     fragment BookFragment on Book {
//       title
//       author {
//         ...AuthorFragment
//       }
//     }
//     fragment AuthorFragment on Author {
//       name
//       bio
//     }
//   `;

//   it("should return a list of books", async () => {
//     // send our request to the url of the test server
//     const response = await request(url)
//       .post("/")
//       .send({ query: listBooksQuery });
//     expect((response as any).errors).toBeUndefined();
//     expect(response.body.data).toEqual({
//       listBooks: [
//         { title: "War and Peace", author: null },
//         { title: "Death's End", author: null },
//         { title: "Educated", author: null },
//         {
//           title: "Regenesis: Feeding the World Without Devouring the Planet",
//           author: null,
//         },
//         {
//           author: null,
//           title: "Anna Karenina",
//         },
//         {
//           author: null,
//           title: "Four Thousand Weeks: Time Management for Mortals",
//         },
//       ],
//     });
//   });

//   const listOrdersQuery = `
//     query ListOrders {
//       listOrders {
//         ...OrderFragment
//       }
//     }
//     fragment OrderFragment on Order {
//       id
//       status
//       items {
//         ...OrderItemFragment
//       }
//     }
//     fragment OrderItemFragment on OrderItem {
//       id
//       price
//       quantity
//       product {
//         ...ProductFragment
//       }
//     }
//     fragment ProductFragment on Product {
//       id
//       name
//       price
//       stock
//     }
//   `;

//   it("should return a list of orders", async () => {
//     // send our request to the url of the test server
//     const response = await request(url)
//       .post("/")
//       .send({ query: listOrdersQuery });
//     console.log(JSON.stringify(response.body));
//     expect((response as any).errors).toBeUndefined();
//     expect(response.body.data).toEqual({
//       listOrders: [
//         {
//           id: 1,
//           status: "PAID",
//           items: [
//             {
//               id: 1,
//               price: 2.5,
//               quantity: 2,
//               product: { id: 1, name: "Apple", price: 2.5, stock: 10 },
//             },
//             {
//               id: 2,
//               price: 3.49,
//               quantity: 1,
//               product: { id: 2, name: "Banana", price: 3.49, stock: 10 },
//             },
//           ],
//         },
//       ],
//     });
//   });

//   const checkoutMutation = `
//     mutation Checkout($order: OrderInput!) {
//       checkout(order: $order) {
//         __typename
//         ... on FieldViolation {
//           code
//           field
//           message
//         }
//         ... on InsufficientStockError {
//           __typename
//           message
//         }
//         ... on InvalidPaymentMethodError {
//           __typename
//           message
//         }
//         ... on Order {
//           id
//           status
//         }
//       }
//     }
//   `;

//   it("should return an error if there are no items in the order", async () => {
//     const response = await request(url)
//       .post("/")
//       .send({
//         query: checkoutMutation,
//         variables: {
//           order: {
//             items: [],
//             paymentMethod: "visa",
//           },
//         },
//       });
//     console.log(JSON.stringify(response.body));
//     expect((response as any).errors).toBeUndefined();
//     expect(response.body.data).toEqual({
//       checkout: {
//         __typename: "FieldViolation",
//         code: "required",
//         field: "order.items",
//         message: "Items are required",
//       },
//     });
//   });

//   it("should complete the checkout flow", async () => {
//     const response = await request(url)
//       .post("/")
//       .send({
//         query: checkoutMutation,
//         variables: {
//           order: {
//             items: [
//               {
//                 productId: 1,
//                 quantity: 1,
//               },
//               {
//                 productId: 1,
//                 quantity: 1,
//               },
//             ],
//             paymentMethod: "visa",
//           },
//         },
//       });
//     console.log(`response: ${JSON.stringify(response.body)}`);
//     expect((response as any).errors).toBeUndefined();
//     expect(response.body.data).toEqual({
//       checkout: { __typename: "Order", id: 2, status: "PAID" },
//     });
//     const product = await db
//       .select()
//       .from(schema.productTable)
//       .where(eq(schema.productTable.id, 1));
//     expect(product[0].stock).toBe(8);
//   });

//   it("should return an error if there is insufficient stock", async () => {
//     const response = await request(url)
//       .post("/")
//       .send({
//         query: checkoutMutation,
//         variables: {
//           order: {
//             items: [
//               {
//                 productId: 1,
//                 quantity: 100,
//               },
//             ],
//             paymentMethod: "visa",
//           },
//         },
//       });
//     console.log(`response: ${JSON.stringify(response.body)}`);
//     expect((response as any).errors).toBeUndefined();
//     expect(response.body.data).toEqual({
//       checkout: {
//         __typename: "InsufficientStockError",
//         message: "Insufficient stock",
//       },
//     });
//   });
// });
