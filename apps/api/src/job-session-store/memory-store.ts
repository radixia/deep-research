import type { ResearchResult } from "@deep-research/types";
import type { JobSessionStore } from "./types.js";
import type { ResearchJob } from "../job-store.js";

const JOB_TTL_MS = 60 * 60 * 1000;
const EVICT_INTERVAL_MS = 10 * 60 * 1000;

export class MemoryJobSessionStore implements JobSessionStore {
  private readonly jobs = new Map<string, ResearchJob>();
  private evictTimer: ReturnType<typeof setInterval> | null = null;

  private evictExpired(): void {
    const cutoff = Date.now() - JOB_TTL_MS;
    for (const [id, job] of this.jobs) {
      if (job.createdAt.getTime() < cutoff) this.jobs.delete(id);
    }
  }

  async create(): Promise<string> {
    const jobId = crypto.randomUUID();
    this.jobs.set(jobId, {
      jobId,
      status: "pending",
      createdAt: new Date(),
    });
    if (this.evictTimer == null) {
      this.evictTimer = setInterval(() => this.evictExpired(), EVICT_INTERVAL_MS);
      (this.evictTimer as NodeJS.Timeout).unref?.();
    }
    return jobId;
  }

  async get(jobId: string): Promise<ResearchJob | undefined> {
    return this.jobs.get(jobId);
  }

  async setRunning(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (job) job.status = "running";
  }

  async setCompleted(jobId: string, result: ResearchResult): Promise<void> {
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = "completed";
      job.result = result;
    }
  }

  async setFailed(jobId: string, error: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = "failed";
      job.error = error;
    }
  }

  destroy(): void {
    if (this.evictTimer) {
      clearInterval(this.evictTimer);
      this.evictTimer = null;
    }
  }
}
