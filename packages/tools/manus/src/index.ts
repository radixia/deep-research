/**
 * Manus API v2 client.
 * The "deep executor" — autonomously plans and runs multi-step research tasks.
 *
 * Result delivery strategy (in order of preference):
 * 1. Webhook push → ManusTaskStore (fastest, no polling overhead)
 * 2. Fallback: poll Manus API directly (if no store provided or webhook not reachable)
 */

import type { ToolResult, Citation } from "@deep-research/types";
import { ManusTaskStore } from "./store.js";

export { ManusTaskStore } from "./store.js";

const MANUS_BASE_URL = "https://api.manus.ai";
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
      "x-manus-api-key": apiKey,
      "Content-Type": "application/json",
    };
  }

  async createTask(query: string, signal?: AbortSignal): Promise<string> {
    const res = await fetch(`${MANUS_BASE_URL}/v2/task.create`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        message: {
          content: query,
        },
      }),
      ...(signal !== undefined && { signal }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Manus createTask failed: ${res.status} ${body}`);
    }
    const data = (await res.json()) as { ok: boolean; task_id: string; error?: { code: string; message: string } };
    if (!data.ok) {
      throw new Error(`Manus createTask error: ${data.error?.code ?? "unknown"} — ${data.error?.message ?? ""}`);
    }
    return data.task_id;
  }

  async getTask(taskId: string, signal?: AbortSignal): Promise<{ status: string; result?: string }> {
    const res = await fetch(`${MANUS_BASE_URL}/v2/task.detail?task_id=${encodeURIComponent(taskId)}`, {
      headers: this.headers,
      ...(signal !== undefined && { signal }),
    });
    if (!res.ok) throw new Error(`Manus getTask failed: ${res.status}`);
    const data = (await res.json()) as {
      ok: boolean;
      task?: { status: string };
    };
    // Map v2 statuses to our internal ones
    const rawStatus = data.task?.status ?? "unknown";
    const status = rawStatus === "stopped" ? "completed" : rawStatus;
    return { status };
  }

  /** Fetch final assistant messages from a completed task. */
  async getTaskResult(taskId: string, signal?: AbortSignal): Promise<string | null> {
    const res = await fetch(
      `${MANUS_BASE_URL}/v2/task.listMessages?task_id=${encodeURIComponent(taskId)}&order=desc&limit=50`,
      {
        headers: this.headers,
        ...(signal !== undefined && { signal }),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      ok: boolean;
      messages?: Array<{ role: string; content?: string; event_type?: string }>;
    };
    if (!data.ok || !data.messages) return null;

    // Collect assistant message content from the response
    const assistantMessages = data.messages
      .filter((m) => m.role === "assistant" && m.content)
      .map((m) => m.content!)
      .reverse(); // oldest first

    return assistantMessages.length > 0 ? assistantMessages.join("\n\n") : null;
  }

  async run(query: string, options?: { signal?: AbortSignal; maxWaitMs?: number }): Promise<ToolResult> {
    const maxWaitMs = options?.maxWaitMs ?? 900_000;
    const signal = options?.signal;
    const start = Date.now();
    try {
      const taskId = await this.createTask(query, signal);

      this.store?.init(taskId);

      // Always poll: webhook store is a bonus (resolves faster if webhook fires),
      // but we can't rely on it since webhooks may not reach localhost.
      const result = await this.waitViaPolling(taskId, maxWaitMs, start, signal);

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
    signal?: AbortSignal,
  ): Promise<string | null> {
    while (true) {
      if (signal?.aborted) return null;
      if (Date.now() - start > maxWaitMs) return null;
      const task = await this.getTask(taskId, signal);
      if (task.status === "completed") {
        // Fetch the actual result content via listMessages
        return this.getTaskResult(taskId, signal);
      }
      if (task.status === "failed" || task.status === "error") return null;
      await sleep(API_POLL_INTERVAL_MS);
    }
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function extractCitations(text: string, sourceTool: Citation["sourceTool"]): Citation[] {
  const byUrl = new Map<string, { title: string; fromMarkdown: boolean }>();
  const mdLink = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = mdLink.exec(text)) !== null) {
    const url = match[2]!.replace(/\/$/, "");
    if (!byUrl.has(url)) byUrl.set(url, { title: match[1]!.trim(), fromMarkdown: true });
  }
  // Plain URLs (not already captured as markdown links)
  const plain = /(?:^|[\s(])(https?:\/\/[^\s\])"'<>]+)/g;
  while ((match = plain.exec(text)) !== null) {
    let url = match[1]!;
    url = url.replace(/[.,;:!?)]+$/, "").replace(/\/$/, "");
    if (!/^https?:\/\//i.test(url) || byUrl.has(url)) continue;
    byUrl.set(url, { title: url, fromMarkdown: false });
  }
  const list = Array.from(byUrl.entries()).map(([url, meta]) => ({
    url,
    title: meta.title,
    snippet: "",
    sourceTool,
    fetchedAt: new Date(),
    credibilityScore: 0.5,
  }));
  return list.map((c, i) => ({
    ...c,
    credibilityScore: Math.min(1, 0.48 + (list.length - i - 1) * 0.03 + (c.title !== c.url ? 0.05 : 0)),
  }));
}
