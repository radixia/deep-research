import pino from "pino";
import { getTraceContext } from "./trace.js";

/** Logger that merges traceId/spanId from the active OpenTelemetry span into every log. */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  mixin: () => getTraceContext(),
  ...(process.env.NODE_ENV !== "test" && process.env.NODE_ENV !== "production"
    ? { transport: { target: "pino-pretty", options: { colorize: true } } }
    : {}),
});

export function childLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}
