import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import {
  BatchSpanProcessor,
  ConsoleSpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
// import { FastifyOtelInstrumentation } from "@fastify/otel";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";
import { resourceFromAttributes } from "@opentelemetry/resources";

const otlpExporter = new OTLPTraceExporter({
  url: "http://localhost:4318/v1/traces",
});

// export const fastifyOtelInstrumentation = new FastifyOtelInstrumentation({});

diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: "backend",
  }),
  spanProcessors: [
    new BatchSpanProcessor(otlpExporter),
    // new SimpleSpanProcessor(new ConsoleSpanExporter()),
  ],
  instrumentations: [
    new HttpInstrumentation(),
    // The start times coming out of this instrumentation are not correct.
    new PgInstrumentation({
      enhancedDatabaseReporting: true,
      enabled: true,
      addSqlCommenterCommentToQueries: true,
    }),
  ],
});

try {
  sdk.start();
} catch (error) {
  console.error("Error initializing OpenTelemetry:", error);
}
