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

  async createTask(query: string, signal?: AbortSignal): Promise<string> {
    const res = await fetch(`${MANUS_BASE_URL}/v1/tasks`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        task: query,
        webhook_url: this.webhookUrl,
        return_format: "markdown",
      }),
      ...(signal !== undefined && { signal }),
    });
    if (!res.ok) throw new Error(`Manus createTask failed: ${res.status}`);
    const data = (await res.json()) as { task_id: string };
    return data.task_id;
  }

  async getTask(taskId: string, signal?: AbortSignal): Promise<{ status: string; result?: string }> {
    const res = await fetch(`${MANUS_BASE_URL}/v1/tasks/${taskId}`, {
      headers: this.headers,
      ...(signal !== undefined && { signal }),
    });
    if (!res.ok) throw new Error(`Manus getTask failed: ${res.status}`);
    return res.json() as Promise<{ status: string; result?: string }>;
  }

  async run(query: string, options?: { signal?: AbortSignal; maxWaitMs?: number }): Promise<ToolResult> {
    const maxWaitMs = options?.maxWaitMs ?? 900_000;
    const signal = options?.signal;
    const start = Date.now();
    try {
      const taskId = await this.createTask(query, signal);

      this.store?.init(taskId);

      const result = this.store
        ? await this.waitViaStore(taskId, maxWaitMs, signal)
        : await this.waitViaPolling(taskId, maxWaitMs, start, signal);

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

  private async waitViaStore(taskId: string, maxWaitMs: number, signal?: AbortSignal): Promise<string | null> {
    const task = await this.store!.waitFor(taskId, maxWaitMs, signal);
    if (task.status === "completed") return task.result ?? null;
    return null;
  }

  private async waitViaPolling(
    taskId: string,
    maxWaitMs: number,
    start: number,
    signal?: AbortSignal
  ): Promise<string | null> {
    while (true) {
      if (signal?.aborted) return null;
      if (Date.now() - start > maxWaitMs) return null;
      const task = await this.getTask(taskId, signal);
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
