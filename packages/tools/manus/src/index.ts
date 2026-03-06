/**
 * Manus API client.
 * The "deep executor" — autonomously plans and runs multi-step research tasks.
 *
 * Result delivery strategy (in order of preference):
 * 1. Webhook push → ManusTaskStore (fastest, no polling overhead)
 * 2. Fallback: poll Manus API directly (if no store provided or webhook not reachable)
 */

import type { ToolResult, Citation } from "@deep-research/types";
import { ManusTaskStore } from "./store.js";

export { ManusTaskStore } from "./store.js";

const MANUS_BASE_URL = "https://open.manus.im";
const API_POLL_INTERVAL_MS = 5_000;

export class ManusClient {
  private readonly headers: Record<string, string>;

  constructor(
    private readonly apiKey: string,
    private readonly webhookUrl?: string,
    /** Inject the shared store so webhook results are picked up automatically. */
    private readonly store?: ManusTaskStore,
  ) {
    this.headers = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };
  }

  async createTask(query: string): Promise<string> {
    const res = await fetch(`${MANUS_BASE_URL}/v1/tasks`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        task: query,
        webhook_url: this.webhookUrl,
        return_format: "markdown",
      }),
    });
    if (!res.ok) throw new Error(`Manus createTask failed: ${res.status}`);
    const data = (await res.json()) as { task_id: string };
    return data.task_id;
  }

  async getTask(taskId: string): Promise<{ status: string; result?: string }> {
    const res = await fetch(`${MANUS_BASE_URL}/v1/tasks/${taskId}`, {
      headers: this.headers,
    });
    if (!res.ok) throw new Error(`Manus getTask failed: ${res.status}`);
    return res.json() as Promise<{ status: string; result?: string }>;
  }

  async run(query: string, maxWaitMs = 900_000): Promise<ToolResult> {
    const start = Date.now();
    try {
      const taskId = await this.createTask(query);

      // Register the task in the store immediately so the webhook handler
      // can write to it as soon as the result arrives.
      this.store?.init(taskId);

      const result = this.store
        ? await this.waitViaStore(taskId, maxWaitMs)
        : await this.waitViaPolling(taskId, maxWaitMs, start);

      return {
        tool: "manus",
        rawOutput: result ?? null,
        citations: result ? extractCitations(result, "manus") : [],
        latencyMs: Date.now() - start,
        success: result !== null,
        error: result === null ? "Manus task failed or timed out" : undefined,
      };
    } catch (err) {
      return {
        tool: "manus",
        rawOutput: null,
        citations: [],
        latencyMs: Date.now() - start,
        success: false,
        error: String(err),
      };
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /** Wait for the webhook to deliver the result via the in-process store. */
  private async waitViaStore(taskId: string, maxWaitMs: number): Promise<string | null> {
    const task = await this.store!.waitFor(taskId, maxWaitMs);
    if (task.status === "completed") return task.result ?? null;
    return null;
  }

  /**
   * Fallback: poll the Manus API directly.
   * Used when no store is configured (e.g. in tests or when webhook is unavailable).
   */
  private async waitViaPolling(taskId: string, maxWaitMs: number, start: number): Promise<string | null> {
    while (true) {
      if (Date.now() - start > maxWaitMs) return null;
      const task = await this.getTask(taskId);
      if (task.status === "completed") return task.result ?? null;
      if (task.status === "failed") return null;
      await sleep(API_POLL_INTERVAL_MS);
    }
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function extractCitations(text: string, sourceTool: Citation["sourceTool"]): Citation[] {
  const citations: Citation[] = [];
  const mdLink = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = mdLink.exec(text)) !== null) {
    citations.push({
      url: match[2]!,
      title: match[1]!,
      snippet: "",
      sourceTool,
      fetchedAt: new Date(),
      credibilityScore: 0.5,
    });
  }
  return citations;
}
