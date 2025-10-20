"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApolloServer = void 0;
const server_1 = require("@apollo/server");
const standalone_1 = require("@apollo/server/standalone");
const fs_1 = require("fs");
const db_1 = require("./db");
const pg_1 = require("pg");
const sql_1 = require("drizzle-orm/sql");
const apollo4_1 = require("graphql-constraint-directive/apollo4");
const typeDefs = (0, fs_1.readFileSync)("./schema.graphql", { encoding: "utf-8" });
const head = (xs) => { var _a; return (_a = xs[0]) !== null && _a !== void 0 ? _a : null; };
const resolvers = {
    Mutation: {
        registerUser: (_, args, ctx) => __awaiter(void 0, void 0, void 0, function* () {
            console.log(`args is ${JSON.stringify(args)}`);
            try {
                return yield ctx.db.transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
                    const result = yield tx.execute((0, sql_1.sql) `insert into public.users (username, email) values (${args.input.username}, ${args.input.email}) returning id, username, email, bio, to_char("created_at", 'YYYY-MM-DD"T"HH24:MI:SS.USTZH:TZM'::text) as created_at, to_char("updated_at", 'YYYY-MM-DD"T"HH24:MI:SS.USTZH:TZM'::text) as updated_at`);
                    return {
                        __typename: "RegisterUserPayload",
                        result: {
                            __typename: "CreatedUser",
                            id: result.rows[0].id,
                            username: result.rows[0].username,
                            email: result.rows[0].email,
                            bio: result.rows[0].bio,
                            createdAt: result.rows[0].created_at,
                            updatedAt: result.rows[0].updated_at,
                        },
                    };
                }), 
                // Lock the product rows until the transaction is committed.
                { isolationLevel: "repeatable read" });
            }
            catch (e) {
                if (e instanceof pg_1.DatabaseError) {
                    if (e.code == db_1.check_violation) {
                    }
                    else if (e.code == db_1.unique_violation) {
                        if (e.constraint === "unique_user_username") {
                            return {
                                __typename: "RegisterUserPayload",
                                result: {
                                    __typename: "UsernameConflict",
                                    message: `The username '${args.input.username}' is already in use`,
                                    username: args.input.username,
                                },
                            };
                        }
                        else if (e.constraint === "unique_user_email") {
                            return {
                                __typename: "RegisterUserPayload",
                                result: {
                                    __typename: "EmailAddressConflict",
                                    message: `The email address '${args.input.email}' is already in use`,
                                    email: args.input.email,
                                },
                            };
                        }
                    }
                }
                console.log(`${JSON.stringify(e)}`);
                // Unknown error.
                throw e;
            }
        }),
    },
};
const createApolloServer = (port, ctx) => __awaiter(void 0, void 0, void 0, function* () {
    const server = new server_1.ApolloServer({
        typeDefs: [apollo4_1.constraintDirectiveTypeDefs, typeDefs],
        resolvers,
        // Serve an introspection endpoint so clients can fetch the schema
        // definitions.
        introspection: true,
        plugins: [(0, apollo4_1.createApollo4QueryValidationPlugin)()],
    });
    const url = yield (0, standalone_1.startStandaloneServer)(server, {
        context: () => __awaiter(void 0, void 0, void 0, function* () { return ctx; }),
        listen: { port: port },
    });
    return { server, url: url.url };
});
exports.createApolloServer = createApolloServer;
//# sourceMappingURL=server.js.map