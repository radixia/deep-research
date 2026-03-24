/**
 * OpenTelemetry SDK setup. Load with --import so it runs before application code.
 * Skip when NODE_ENV=test to avoid affecting tests.
 */
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

const isTest = process.env.NODE_ENV === "test";
const useOtlp = Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT);

if (!isTest) {
  const traceExporter = useOtlp
    ? new OTLPTraceExporter()
    : new ConsoleSpanExporter();

  const sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME ?? "deep-research-api",
    traceExporter,
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();

  const shutdown = (): void => {
    sdk.shutdown().catch((err) => console.error("OTel SDK shutdown error", err));
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
