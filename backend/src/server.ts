import Fastify from "fastify";
import { grafserv } from "grafserv/fastify/v4";
import { postgraphile } from "postgraphile";
import jose from "jose";
import * as dotenv from "dotenv";
import preset from "./graphile.config";
import cors from "@fastify/cors";

declare module "fastify" {
  interface FastifyRequest {
    token: jose.JWTPayload | null;
  }
}

export const createApolloServer = async (port: number) => {
  // Create a Fastify app
  const app = Fastify({
    logger: true,
  });

  //   const JWKS = jose.createRemoteJWKSet(
  //     new URL(process.env.PUBLIC_AUTH_JWKS_URL!)
  //   );

  //   // Intercept all incoming requests to validate the token in the Authorization
  //   // header.
  //   app.addHook("preHandler", async (request, reply) => {
  //     if (request.headers.authorization === undefined) {
  //       reply
  //         .code(401)
  //         .send({ errors: [{ message: "No authorization header found" }] });
  //       return;
  //     }

  //     const bearerTokenPrefix = "Bearer ";
  //     if (!request.headers.authorization.startsWith(bearerTokenPrefix)) {
  //       reply
  //         .code(401)
  //         .send({ errors: [{ message: "Invalid authorization header" }] });
  //       return;
  //     }

  //     // Extract the token from the Authorization header.
  //     const token = request.headers.authorization.substring(
  //       bearerTokenPrefix.length
  //     );

  //     try {
  //       const { payload } = await jose.jwtVerify(token, JWKS, {
  //         issuer: process.env.PUBLIC_AUTH_TOKEN_ISSUER,
  //         audience: process.env.PUBLIC_AUTH_TOKEN_AUDIENCE,
  //       });

  //       // Add the token payload to the request object for later use.
  //       request.token = payload;
  //     } catch (error) {
  //       reply.code(403).send({ errors: [{ message: "Not authorized" }] });
  //       return;
  //     }

  //     console.log(`token ctx is: ${request.token}`);

  //     // Continue processing the request.
  //     return;
  //   });

  // Enable CORS
  app.register(cors, {
    origin: "*",
  });

  const pgl = postgraphile(preset);
  const serv = pgl.createServ(grafserv);

  // Add the Grafserv instance's route handlers to the Fastify app
  serv.addTo(app).catch((e) => {
    console.error(e);
    process.exit(1);
  });

  // Start the Fastify server
  return await app.listen({ port: port });
};
