import { AsyncLocalStorage } from "node:async_hooks";
import { trace, context, type Span, SpanStatusCode } from "@opentelemetry/api";

const TRACER_NAME = "deep-research-api";
const TRACER_VERSION = "0.1.0";

export const tracer = trace.getTracer(TRACER_NAME, TRACER_VERSION);

/** Per-request storage for tool invocation spans (invocationId -> Span). */
export const toolSpanStorage = new AsyncLocalStorage<Map<string, Span>>();

/** Return traceId and spanId from the active span for log correlation. */
export function getTraceContext(): { traceId?: string; spanId?: string } {
  const span = trace.getActiveSpan();
  if (!span) return {};
  const ctx = span.spanContext();
  return { traceId: ctx.traceId, spanId: ctx.spanId };
}

/** Run fn inside a new span, then end it. */
export async function withSpan<T>(
  name: string,
  attributes: Record<string, string | number | boolean | undefined>,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  const span = tracer.startSpan(name, { attributes: attributes as Record<string, string | number | boolean> });
  return context.with(trace.setSpan(context.active(), span), async () => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
      span.recordException(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      span.end();
    }
  });
}
