import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { logger as pinoLogger } from "./logger.js";
import {
  createResearchOrchestrator,
  ManusTaskStore,
  ResearchQuerySchema,
} from "@deep-research/sdk";
import { config } from "./config.js";
import { getApiKey, requireApiKey, checkRateLimit } from "./middleware.js";
import { ManusWebhookPayloadSchema } from "./schemas.js";
import { getManusPublicKey, verifyManusWebhook } from "./manus-webhook-verify.js";
import { FileJobSessionStore } from "./job-session-store/index.js";
import { tracer, withSpan, toolSpanStorage } from "./trace.js";
import { SpanStatusCode } from "@opentelemetry/api";

// ── Job session store (persisted to file; swappable for DB later) ───────────────
const jobStore = new FileJobSessionStore({ filePath: config.jobStorePath, logger: pinoLogger });

// ── Shared in-process store ───────────────────────────────────────────────────
// Single source of truth for Manus task results.
// The webhook handler writes here; ManusClient.run() reads here.
// No Redis needed — same process, same memory.

const manusStore = new ManusTaskStore();

const orchestrator = createResearchOrchestrator(
  {
    manusApiKey: config.manusApiKey,
    perplexityApiKey: config.perplexityApiKey,
    tavilyApiKey: config.tavilyApiKey,
    firecrawlApiKey: config.firecrawlApiKey,
    braveApiKey: config.braveApiKey,
    anthropicApiKey: config.anthropicApiKey,
    webhookBaseUrl: config.webhookBaseUrl,
  },
  {
    manusStore,
    onToolEvent: (evt) => {
      const spanMap = toolSpanStorage.getStore();
      if (evt.phase === "invoke") {
        const span = tracer.startSpan("tool.run", {
          attributes: {
            "tool.name": evt.tool,
            "tool.query.preview": evt.queryPreview.slice(0, 200),
          },
        });
        if (evt.invocationId && spanMap) spanMap.set(evt.invocationId, span);
        pinoLogger.info(
          {
            component: "tool",
            phase: "invoke",
            tool: evt.tool,
            queryPreview: evt.queryPreview,
            ...(evt.opts && { opts: evt.opts }),
          },
          `tool ${evt.tool} invoke`,
        );
      } else {
        const id = evt.invocationId;
        if (id && spanMap) {
          const span = spanMap.get(id);
          if (span) {
            span.setAttribute("tool.latency_ms", evt.latencyMs);
            span.setAttribute("tool.citations_count", evt.citationsCount);
            span.setAttribute("tool.success", evt.success);
            if (evt.error) span.setAttribute("tool.error", evt.error.slice(0, 500));
            span.setStatus(evt.success ? { code: SpanStatusCode.OK } : { code: SpanStatusCode.ERROR, message: evt.error });
            span.end();
            spanMap.delete(id);
          }
        }
        pinoLogger.info(
          {
            component: "tool",
            phase: "response",
            tool: evt.tool,
            success: evt.success,
            latencyMs: evt.latencyMs,
            citationsCount: evt.citationsCount,
            ...(evt.error && { error: evt.error }),
            ...(evt.outputPreview && { outputPreview: evt.outputPreview }),
          },
          `tool ${evt.tool} response`,
        );
      }
    },
  },
);

// ── App ───────────────────────────────────────────────────────────────────────

export const app = new Hono();

app.use("*", async (c, next) => {
  const start = Date.now();
  await next();
  pinoLogger.info(
    { method: c.req.method, path: c.req.path, status: c.res.status, durationMs: Date.now() - start },
    "request"
  );
});
app.use("*", cors());

// ── Protected routes (auth when API_KEY is set) ───────────────────────────────
app.use("/research", requireApiKey);

// ── Routes ────────────────────────────────────────────────────────────────────

app.get("/", (c) =>
  c.json({ status: "ok", service: "deep-research-agent", version: "0.1.0" }),
);

app.get("/health", (c) =>
  c.json({ status: "healthy", manusStoreTasks: manusStore.size }),
);

app.post("/research", async (c) => {
  return toolSpanStorage.run(new Map(), async () => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    const parsed = ResearchQuerySchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: "Invalid request", details: parsed.error.flatten() }, 400);
    }

    const apiKey = getApiKey(c);
    if (!checkRateLimit(apiKey, parsed.data.depth)) {
      return c.json({ error: "Rate limit exceeded" }, 429);
    }

    const request = parsed.data;
    const jobId = await withSpan(
    "job_store.create",
    { "job.status": "pending" },
    async () => {
      const id = await jobStore.create();
      return id;
    }
  );
  pinoLogger.info({ jobId, depth: request.depth, query: request.query.slice(0, 80) }, "research job created");

  await withSpan("job_store.setRunning", { "job.id": jobId, "job.status": "running" }, async () => {
    await jobStore.setRunning(jobId);
  });
  const signal = c.req.raw.signal;
  const researchStartMs = Date.now();
  const researchSpan = tracer.startSpan("research.run", {
    attributes: {
      "research.depth": request.depth,
      "research.query.preview": request.query.slice(0, 100),
      "job.id": jobId,
    },
  });
  orchestrator
    .research(request, signal)
    .then((result) => {
      researchSpan.setAttribute("research.status", "completed");
      researchSpan.setAttribute("research.sources_count", result.sources?.length ?? 0);
      researchSpan.end();
      pinoLogger.info({ jobId, depth: request.depth, durationMs: Date.now() - researchStartMs, status: "completed", sourcesCount: result.sources?.length ?? 0 }, "research completed");
      return jobStore.setCompleted(jobId, result);
    })
    .catch((err) => {
      const errorMessage = err instanceof Error ? err.message : String(err);
      researchSpan.setAttribute("research.status", "failed");
      researchSpan.setAttribute("research.error", errorMessage.slice(0, 500));
      researchSpan.recordException(err instanceof Error ? err : new Error(errorMessage));
      researchSpan.end();
      pinoLogger.warn({ jobId, depth: request.depth, durationMs: Date.now() - researchStartMs, status: "failed", error: errorMessage.slice(0, 500) }, "research failed");
      return jobStore.setFailed(jobId, errorMessage);
    });

    return c.json({ jobId, status: "pending" as const }, 202);
  });
});

app.get("/research/:jobId", async (c) => {
  const jobId = c.req.param("jobId");
  const job = await jobStore.get(jobId);
  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }
  const payload: { status: string; result?: unknown; error?: string } = {
    status: job.status,
  };
  if (job.status === "completed" && job.result) payload.result = job.result;
  if (job.status === "failed" && job.error) payload.error = job.error;
  return c.json(payload);
});

/**
 * Manus webhook — receives task results pushed by Manus after completion.
 * Signature verification uses RSA-SHA256 per https://open.manus.ai/docs/webhooks/security
 *
 * Flow:
 *   Manus API → POST /webhooks/manus → manusStore.set(taskId, result)
 *   ManusClient.run() → manusStore.waitFor(taskId) → resolves immediately
 */
app.post("/webhooks/manus", async (c) => {
  const body = await c.req.arrayBuffer();
  const rawBody = Buffer.from(body);

  const signature = c.req.header("x-webhook-signature") ?? "";
  const timestamp = c.req.header("x-webhook-timestamp") ?? "";

  const skipVerification = config.env !== "production" && !signature && !timestamp;
  if (!skipVerification) {
    if (!signature || !timestamp) {
      return c.json({ error: "Missing X-Webhook-Signature or X-Webhook-Timestamp" }, 400);
    }
    const webhookUrl = `${config.webhookBaseUrl.replace(/\/$/, "")}/webhooks/manus`;
    let publicKey: string | null = null;
    try {
      publicKey = await getManusPublicKey(config.manusApiKey);
    } catch (err) {
      pinoLogger.warn({ err }, "Manus public key fetch failed");
      if (config.env === "production") {
        return c.json({ error: "Signature verification unavailable" }, 503);
      }
      // In development: accept webhook without verification so Manus "Test" / registration succeeds
      pinoLogger.warn("Skipping signature verification (dev fallback)");
    }
    if (publicKey) {
      const valid = verifyManusWebhook({
        url: webhookUrl,
        body: rawBody,
        signatureB64: signature,
        timestamp,
        publicKeyPem: publicKey,
      });
      if (!valid) {
        return c.json({ error: "Invalid signature" }, 401);
      }
    }
  }

  let data: unknown;
  try {
    data = JSON.parse(rawBody.toString());
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const parsed = ManusWebhookPayloadSchema.safeParse(data);
  if (!parsed.success) {
    return c.json({ error: "Invalid webhook payload", details: parsed.error.flatten() }, 400);
  }

  const { event_type, task_detail } = parsed.data;

  if (event_type === "task_stopped" && task_detail) {
    const status = task_detail.stop_reason === "finish" ? "completed" : "failed";
    manusStore.set(task_detail.task_id, {
      status,
      result: task_detail.message,
      error: status === "failed" ? task_detail.message : undefined,
    });
  }
  // task_created and task_progress: acknowledge only, no store update

  return c.json({
    received: true,
    event_type,
    task_id: task_detail?.task_id,
    status: event_type === "task_stopped" && task_detail?.stop_reason === "finish" ? "completed" : undefined,
  });
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────

const SHUTDOWN_TIMEOUT_MS = 30_000;
let server: ReturnType<typeof serve> | null = null;

if (process.env.NODE_ENV !== "test") {
  server = serve({ fetch: app.fetch, port: config.port });
}

function shutdown(): void {
  pinoLogger.info("Shutting down");
  manusStore.destroy();
  jobStore.destroy?.();
  if (server) {
    server.close?.();
  }
  setTimeout(() => process.exit(0), SHUTDOWN_TIMEOUT_MS).unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// ── Server ────────────────────────────────────────────────────────────────────

if (process.env.NODE_ENV !== "test") {
  pinoLogger.info({ port: config.port, env: config.env }, "Deep Research Agent starting");
}
