import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";

import { ResearchOrchestrator, ManusClient, PerplexityClient, TavilyClient, FirecrawlClient, FusionEngine } from "@deep-research/orchestrator";
import { ResearchQuerySchema } from "@deep-research/types";
import { config } from "./config.js";
import { createHmac, timingSafeEqual } from "node:crypto";

// ── Clients ──────────────────────────────────────────────────────────────────

const orchestrator = new ResearchOrchestrator(
  new ManusClient(config.manusApiKey, `${config.webhookBaseUrl}/webhooks/manus`),
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

app.get("/health", (c) => c.json({ status: "healthy" }));

app.post("/research", async (c) => {
  const body = await c.req.json();
  const parsed = ResearchQuerySchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error.flatten() }, 400);
  }

  const result = await orchestrator.research(parsed.data);
  return c.json(result);
});

app.post("/webhooks/manus", async (c) => {
  const body = await c.req.arrayBuffer();
  const rawBody = Buffer.from(body);

  if (config.manusWebhookSecret) {
    const signature = c.req.header("x-manus-signature") ?? "";
    const expected = `sha256=${createHmac("sha256", config.manusWebhookSecret).update(rawBody).digest("hex")}`;
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
      return c.json({ error: "Invalid signature" }, 401);
    }
  }

  const data = JSON.parse(rawBody.toString()) as { task_id?: string; status?: string };
  // TODO: store result in Redis/DB for retrieval
  return c.json({ received: true, task_id: data.task_id, status: data.status });
});

// ── Server ────────────────────────────────────────────────────────────────────

console.log(`🔍 Deep Research Agent starting on port ${config.port} [${config.env}]`);

serve({ fetch: app.fetch, port: config.port });
