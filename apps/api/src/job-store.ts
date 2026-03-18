import type { ResearchResult } from "@deep-research/types";

export type JobStatus = "pending" | "running" | "completed" | "failed";

export interface ResearchJob {
  jobId: string;
  status: JobStatus;
  result?: ResearchResult;
  error?: string;
  createdAt: Date;
}

const jobs = new Map<string, ResearchJob>();

export function createJob(): string {
  const jobId = crypto.randomUUID();
  jobs.set(jobId, {
    jobId,
    status: "pending",
    createdAt: new Date(),
  });
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
