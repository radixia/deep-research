/**
 * In-process task store for Manus webhook results.
 *
 * No external dependencies — uses a plain Map with TTL-based cleanup.
 * Works as long as the API server is a single process (which it is for now).
 * If you ever scale to multiple instances, replace with Redis or a DB.
 */

export interface StoredTask {
  status: "pending" | "completed" | "failed";
  result?: string;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour
const POLL_INTERVAL_MS = 500;

export class ManusTaskStore {
  private readonly store = new Map<string, StoredTask>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly ttlMs = DEFAULT_TTL_MS) {
    // Cleanup expired tasks every 10 minutes
    this.cleanupTimer = setInterval(() => this.evict(), 10 * 60 * 1000);
    // Don't block process exit
    this.cleanupTimer.unref?.();
  }

  /** Called by the webhook handler when Manus delivers a result. */
  set(taskId: string, data: { status: "completed" | "failed"; result?: string; error?: string }): void {
    const existing = this.store.get(taskId) ?? { status: "pending" as const, createdAt: new Date() };
    const updated: StoredTask = {
      status: data.status,
      createdAt: existing.createdAt,
      completedAt: new Date(),
    };
    if (data.result !== undefined) updated.result = data.result;
    if (data.error !== undefined) updated.error = data.error;
    this.store.set(taskId, updated);
  }

  /** Initialize a task as pending (optional — helps track tasks created before webhook arrives). */
  init(taskId: string): void {
    if (!this.store.has(taskId)) {
      this.store.set(taskId, { status: "pending", createdAt: new Date() });
    }
  }

  get(taskId: string): StoredTask | undefined {
    return this.store.get(taskId);
  }

  /**
   * Poll the store until the task completes or times out.
   * Returns the stored task — caller checks `.status`.
   */
  async waitFor(taskId: string, timeoutMs: number): Promise<StoredTask> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const task = this.store.get(taskId);
      if (task && task.status !== "pending") return task;
      await sleep(POLL_INTERVAL_MS);
    }

    // Timeout — mark as failed so callers don't wait again
    const timedOut: StoredTask = {
      status: "failed",
      error: `Timed out after ${timeoutMs}ms waiting for Manus result`,
      createdAt: this.store.get(taskId)?.createdAt ?? new Date(),
      completedAt: new Date(),
    };
    this.store.set(taskId, timedOut);
    return timedOut;
  }

  /** Remove entries older than TTL. */
  private evict(): void {
    const cutoff = Date.now() - this.ttlMs;
    for (const [id, task] of this.store) {
      if (task.createdAt.getTime() < cutoff) {
        this.store.delete(id);
      }
    }
  }

  /** For tests or graceful shutdown. */
  destroy(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  get size(): number {
    return this.store.size;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
