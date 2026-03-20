import type { ResearchResult } from "@deep-research/types";

export type JobStatus = "pending" | "running" | "completed" | "failed";

export interface ResearchJob {
  jobId: string;
  status: JobStatus;
  result?: ResearchResult;
  error?: string;
  createdAt: Date;
}

const JOB_TTL_MS = 60 * 60 * 1000; // 1 hour
const EVICT_INTERVAL_MS = 10 * 60 * 1000; // every 10 min

const jobs = new Map<string, ResearchJob>();
let evictTimer: ReturnType<typeof setInterval> | null = null;

function evictExpired(): void {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) {
    if (job.createdAt.getTime() < cutoff) jobs.delete(id);
  }
}

export function createJob(): string {
  const jobId = crypto.randomUUID();
  jobs.set(jobId, {
    jobId,
    status: "pending",
    createdAt: new Date(),
  });
  if (evictTimer == null) {
    evictTimer = setInterval(evictExpired, EVICT_INTERVAL_MS);
    evictTimer.unref?.();
  }
  return jobId;
}

export function getJob(jobId: string): ResearchJob | undefined {
  return jobs.get(jobId);
}

export function setJobRunning(jobId: string): void {
  const job = jobs.get(jobId);
  if (job) job.status = "running";
}

export function setJobCompleted(jobId: string, result: ResearchResult): void {
  const job = jobs.get(jobId);
  if (job) {
    job.status = "completed";
    job.result = result;
  }
}

export function setJobFailed(jobId: string, error: string): void {
  const job = jobs.get(jobId);
  if (job) {
    job.status = "failed";
    job.error = error;
  }
}

/** Stop eviction timer (e.g. on graceful shutdown). */
export function destroyJobStore(): void {
  if (evictTimer) {
    clearInterval(evictTimer);
    evictTimer = null;
  }
}
