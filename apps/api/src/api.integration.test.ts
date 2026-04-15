import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import type { ResearchResult, ToolClient, ToolResult, Citation } from "@deep-research/types";
import { FusionEngine } from "@deep-research/fusion";
import { ResearchOrchestrator } from "@deep-research/orchestrator";

// ── Build a test app with mocked orchestrator ────────────────────────────────

function mockTool(name: string): ToolClient {
  return {
    run: async (query: string): Promise<ToolResult> => {
      const citations: Citation[] = [
        {
          url: `https://${name}.test/result`,
          title: `${name} result`,
          snippet: `${name} snippet for: ${query}`,
          sourceTool: name as Citation["sourceTool"],
          fetchedAt: new Date(),
          credibilityScore: 0.7,
        },
      ];
      return {
        tool: name,
        rawOutput: `${name} response`,
        citations,
        latencyMs: 10,
        success: true,
      };
    },
  };
}

// In-memory job store for tests
interface TestJob {
  status: string;
  result?: ResearchResult;
  error?: string;
}

function createTestApp() {
  const jobs = new Map<string, TestJob>();

  const tools: Record<string, ToolClient> = {
    perplexity: mockTool("perplexity"),
    tavily: mockTool("tavily"),
    brave: mockTool("brave"),
    firecrawl: mockTool("firecrawl"),
    manus: mockTool("manus"),
  };

  const orchestrator = new ResearchOrchestrator(tools, new FusionEngine());

  const app = new Hono();

  app.get("/health", (c) => c.json({ status: "healthy" }));

  app.post("/research", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    // Import zod schema
    const { ResearchQuerySchema } = await import("@deep-research/types");
    const parsed = ResearchQuerySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid request", details: parsed.error.flatten() }, 400);
    }

    const jobId = crypto.randomUUID();
    jobs.set(jobId, { status: "running" });

    // Run synchronously for test simplicity
    try {
      const result = await orchestrator.research(parsed.data);
      jobs.set(jobId, { status: "completed", result });
    } catch (err) {
      jobs.set(jobId, {
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return c.json({ jobId, status: jobs.get(jobId)?.status ?? "pending" }, 202);
  });

  app.get("/research/:jobId", (c) => {
    const jobId = c.req.param("jobId");
    const job = jobs.get(jobId);
    if (!job) return c.json({ error: "Job not found" }, 404);

    const payload: { status: string; result?: unknown; error?: string } = {
      status: job.status,
    };
    if (job.status === "completed" && job.result) payload.result = job.result;
    if (job.status === "failed" && job.error) payload.error = job.error;
    return c.json(payload);
  });

  return { app, jobs };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("API — integration", () => {
  const { app } = createTestApp();

  describe("POST /research", () => {
    it("accepts request with providers and returns 202", async () => {
      const res = await app.request("/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: "test query",
          depth: "quick",
          providers: ["tavily"],
        }),
      });

      expect(res.status).toBe(202);
      const body = (await res.json()) as { jobId: string; status: string };
      expect(body.jobId).toBeDefined();
      expect(typeof body.jobId).toBe("string");
    });

    it("accepts request with allowedDomains", async () => {
      const res = await app.request("/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: "domain test",
          depth: "quick",
          allowedDomains: ["arxiv.org", "github.com"],
        }),
      });

      expect(res.status).toBe(202);
    });

    it("works without providers or allowedDomains (backward compat)", async () => {
      const res = await app.request("/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: "backward compat",
          depth: "quick",
        }),
      });

      expect(res.status).toBe(202);
    });

    it("returns 400 for invalid provider name", async () => {
      const res = await app.request("/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: "test",
          providers: ["nonexistent_provider"],
        }),
      });

      expect(res.status).toBe(400);
    });

    it("returns 400 for empty query", async () => {
      const res = await app.request("/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "" }),
      });

      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid JSON body", async () => {
      const res = await app.request("/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      });

      expect(res.status).toBe(400);
    });
  });

  describe("GET /research/:jobId", () => {
    it("returns completed result with structured fields", async () => {
      // Create a job
      const createRes = await app.request("/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: "structured fields test",
          providers: ["tavily", "brave"],
        }),
      });
      const { jobId } = (await createRes.json()) as { jobId: string };

      // Get the job (in test app, research is synchronous)
      const getRes = await app.request(`/research/${jobId}`);
      expect(getRes.status).toBe(200);

      const body = (await getRes.json()) as {
        status: string;
        result?: {
          executiveSummary: string;
          detailSections: Array<{ tool: string; content: string; chunks: unknown[] }>;
          references: Array<{ index: number; url: string; title: string }>;
          summary: string;
          sources: unknown[];
          confidenceScore: number;
        };
      };

      expect(body.status).toBe("completed");
      expect(body.result).toBeDefined();

      const result = body.result!;
      // Legacy fields still present
      expect(result.summary).toBeDefined();
      expect(result.sources).toBeDefined();
      expect(result.confidenceScore).toBeGreaterThan(0);

      // New structured fields
      expect(result.executiveSummary).toBeDefined();
      expect(result.executiveSummary.length).toBeGreaterThan(0);

      expect(result.detailSections).toBeDefined();
      expect(result.detailSections.length).toBe(2);

      expect(result.references).toBeDefined();
      expect(result.references.length).toBeGreaterThan(0);
      expect(result.references[0]!.index).toBe(1);
    });

    it("returns 404 for unknown job ID", async () => {
      const res = await app.request("/research/nonexistent-id");
      expect(res.status).toBe(404);
    });
  });

  describe("GET /health", () => {
    it("returns healthy status", async () => {
      const res = await app.request("/health");
      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string };
      expect(body.status).toBe("healthy");
    });
  });
});
