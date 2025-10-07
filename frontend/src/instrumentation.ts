import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { WebTracerProvider } from "@opentelemetry/sdk-trace-web";
import { DocumentLoadInstrumentation } from "@opentelemetry/instrumentation-document-load";
import { ZoneContextManager } from "@opentelemetry/context-zone";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { resourceFromAttributes } from "@opentelemetry/resources";

export const register = () => {
  const otlpExporter = new OTLPTraceExporter({
    url: import.meta.env.PUBLIC_OTEL_HTTP_COLLECTOR_URL,
  });

  const provider = new WebTracerProvider({
    spanProcessors: [new BatchSpanProcessor(otlpExporter)],
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: "browser",
    }),
  });

  provider.register({
    // Changing default contextManager to use ZoneContextManager - supports asynchronous operations - optional
    contextManager: new ZoneContextManager(),
  });

  // Registering instrumentations
  registerInstrumentations({
    instrumentations: [new DocumentLoadInstrumentation()],
  });
};
