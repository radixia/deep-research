/**
 * Manus API client.
 * The "deep executor" — autonomously plans and runs multi-step research tasks.
 * Results delivered via webhook or polling.
 */

import type { ToolResult, Citation } from "@deep-research/types";

const MANUS_BASE_URL = "https://open.manus.im";

export class ManusClient {
  private readonly headers: Record<string, string>;

  constructor(
    private readonly apiKey: string,
    private readonly webhookUrl?: string,
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
      while (true) {
        const elapsed = Date.now() - start;
        if (elapsed > maxWaitMs) {
          return { tool: "manus", rawOutput: null, citations: [], latencyMs: elapsed, success: false, error: `Timeout after ${maxWaitMs}ms` };
        }
        const task = await this.getTask(taskId);
        if (task.status === "completed") {
          return {
            tool: "manus",
            rawOutput: task.result ?? null,
            citations: extractCitations(task.result ?? "", "manus"),
            latencyMs: Date.now() - start,
            success: true,
          };
        }
        if (task.status === "failed") {
          return { tool: "manus", rawOutput: null, citations: [], latencyMs: Date.now() - start, success: false, error: "Manus task failed" };
        }
        await sleep(5000);
      }
    } catch (err) {
      return { tool: "manus", rawOutput: null, citations: [], latencyMs: Date.now() - start, success: false, error: String(err) };
    }
  }
}

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
