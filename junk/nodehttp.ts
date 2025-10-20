// import "./init-opentelemetry";

// import preset from "./graphile.config";
// import { postgraphile } from "postgraphile";
// import { grafserv } from "grafserv/node"; // Adaptor for Node's HTTP server
// import { createServer } from "node:http";

// const server = createServer();

// const pgl = postgraphile(preset);

// const serv = pgl.createServ(grafserv);

// // Attach a request handler to the server
// serv.addTo(server);

// server.on("error", (e) => console.error(e));

// // Start the server
// server.listen(process.env.PORT ?? 5678);
