import pino from "pino";
import { getTraceContext } from "./trace.js";

const base = pino({
  level: process.env.LOG_LEVEL ?? "info",
  ...(process.env.NODE_ENV !== "test" && process.env.NODE_ENV !== "production"
    ? { transport: { target: "pino-pretty", options: { colorize: true } } }
    : {}),
});

/** Logger that merges traceId/spanId from the active OpenTelemetry span into every log. */
export const logger = base.child(
  {},
  { mixin: (obj: Record<string, unknown>) => ({ ...obj, ...getTraceContext() }) }
);

export function childLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}
