import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import { createHmac, timingSafeEqual } from "node:crypto";

import {
  ResearchOrchestrator,
  ManusClient,
  PerplexityClient,
  TavilyClient,
  FirecrawlClient,
  FusionEngine,
} from "@deep-research/orchestrator";
import { ManusTaskStore } from "@deep-research/tools-manus";
import { ResearchQuerySchema } from "@deep-research/types";
import { config } from "./config.js";

// ── Shared in-process store ───────────────────────────────────────────────────
// Single source of truth for Manus task results.
// The webhook handler writes here; ManusClient.run() reads here.
// No Redis needed — same process, same memory.

const manusStore = new ManusTaskStore();

// ── Clients ───────────────────────────────────────────────────────────────────

const orchestrator = new ResearchOrchestrator(
  new ManusClient(
    config.manusApiKey,
    `${config.webhookBaseUrl}/webhooks/manus`,
    manusStore, // ← inject the store so run() uses webhook delivery
  ),
  new PerplexityClient(config.perplexityApiKey),
  new TavilyClient(config.tavilyApiKey),
  new FirecrawlClient(config.firecrawlApiKey),
  new FusionEngine(),
);

// ── App ───────────────────────────────────────────────────────────────────────

const app = new Hono();

app.use("*", logger());
app.use("*", cors());

// ── Routes ────────────────────────────────────────────────────────────────────

app.get("/", (c) =>
  c.json({ status: "ok", service: "deep-research-agent", version: "0.1.0" }),
);

app.get("/health", (c) =>
  c.json({ status: "healthy", manusStoreTasks: manusStore.size }),
);

app.post("/research", async (c) => {
  const body = await c.req.json();
  const parsed = ResearchQuerySchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error.flatten() }, 400);
  }

  const result = await orchestrator.research(parsed.data);
  return c.json(result);
});

/**
 * Manus webhook — receives task results pushed by Manus after completion.
 *
 * Flow:
 *   Manus API → POST /webhooks/manus → manusStore.set(taskId, result)
 *   ManusClient.run() → manusStore.waitFor(taskId) → resolves immediately
 */
app.post("/webhooks/manus", async (c) => {
  const body = await c.req.arrayBuffer();
  const rawBody = Buffer.from(body);

  // Verify HMAC signature if a webhook secret is configured
  if (config.manusWebhookSecret) {
    const signature = c.req.header("x-manus-signature") ?? "";
    const expected = `sha256=${createHmac("sha256", config.manusWebhookSecret)
      .update(rawBody)
      .digest("hex")}`;

    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
      return c.json({ error: "Invalid signature" }, 401);
    }
  }

  const data = JSON.parse(rawBody.toString()) as {
    task_id?: string;
    status?: "completed" | "failed";
    result?: string;
    error?: string;
  };

  if (!data.task_id) {
    return c.json({ error: "Missing task_id" }, 400);
  }

  // Write the result into the in-process store.
  // ManusClient.run() is polling this store and will unblock immediately.
  manusStore.set(data.task_id, {
    status: data.status ?? "failed",
    result: data.result,
    error: data.error,
  });

  return c.json({ received: true, task_id: data.task_id, status: data.status });
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────

process.on("SIGTERM", () => {
  manusStore.destroy();
  process.exit(0);
});

// ── Server ────────────────────────────────────────────────────────────────────

console.log(`🔍 Deep Research Agent starting on port ${config.port} [${config.env}]`);

serve({ fetch: app.fetch, port: config.port });
