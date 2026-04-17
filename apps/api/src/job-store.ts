import type { ResearchResult } from "@deep-research/types";

export type JobStatus = "pending" | "running" | "completed" | "failed";

export interface ResearchJob {
  jobId: string;
  status: JobStatus;
  result?: ResearchResult;
  error?: string;
  createdAt: Date;
}
