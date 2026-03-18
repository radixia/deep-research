/**
 * In-process task store for Manus webhook results.
 *
 * Uses Promise resolution on set() — no polling. For multi-instance scaling,
 * replace with Redis or a DB that supports notifications.
 */

export interface StoredTask {
  status: "pending" | "completed" | "failed";
  result?: string;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface IManusTaskStore {
  get(taskId: string): StoredTask | undefined;
  set(taskId: string, data: { status: "completed" | "failed"; result?: string; error?: string }): void;
  init(taskId: string): void;
  waitFor(taskId: string, timeoutMs: number, signal?: AbortSignal): Promise<StoredTask>;
  destroy(): void;
  get size(): number;
}

const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

export class ManusTaskStore implements IManusTaskStore {
  private readonly store = new Map<string, StoredTask>();
  private readonly waiters = new Map<string, { resolve: (t: StoredTask) => void; reject: (err: Error) => void }>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly ttlMs = DEFAULT_TTL_MS) {
    this.cleanupTimer = setInterval(() => this.evict(), 10 * 60 * 1000);
    this.cleanupTimer.unref?.();
  }

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

    const waiter = this.waiters.get(taskId);
    if (waiter) {
      this.waiters.delete(taskId);
      waiter.resolve(updated);
    }
  }

  init(taskId: string): void {
    if (!this.store.has(taskId)) {
      this.store.set(taskId, { status: "pending", createdAt: new Date() });
    }
  }

  get(taskId: string): StoredTask | undefined {
    return this.store.get(taskId);
  }

  async waitFor(taskId: string, timeoutMs: number, signal?: AbortSignal): Promise<StoredTask> {
    const existing = this.store.get(taskId);
    if (existing && existing.status !== "pending") return existing;

    return new Promise<StoredTask>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.waiters.delete(taskId);
        const timedOut: StoredTask = {
          status: "failed",
          error: `Timed out after ${timeoutMs}ms waiting for Manus result`,
          createdAt: this.store.get(taskId)?.createdAt ?? new Date(),
          completedAt: new Date(),
        };
        this.store.set(taskId, timedOut);
        resolve(timedOut);
      }, timeoutMs);

      const onAbort = (): void => {
        this.waiters.delete(taskId);
        clearTimeout(timeout);
        reject(new DOMException("Aborted", "AbortError"));
      };

      if (signal?.aborted) {
        onAbort();
        return;
      }
      signal?.addEventListener("abort", onAbort, { once: true });

      this.waiters.set(taskId, {
        resolve: (t) => {
          clearTimeout(timeout);
          signal?.removeEventListener("abort", onAbort);
          resolve(t);
        },
        reject: (err) => {
          clearTimeout(timeout);
          signal?.removeEventListener("abort", onAbort);
          reject(err);
        },
      });
    });
  }

  private evict(): void {
    const cutoff = Date.now() - this.ttlMs;
    for (const [id, task] of this.store) {
      if (task.createdAt.getTime() < cutoff) {
        this.store.delete(id);
        this.waiters.delete(id);
      }
    }
  }

  destroy(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    for (const [, w] of this.waiters) {
      w.reject(new Error("Store destroyed"));
    }
    this.waiters.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

