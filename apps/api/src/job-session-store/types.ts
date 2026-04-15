import type { ResearchResult } from "@deep-research/types";
import type { ResearchJob, JobStatus } from "../job-store.js";

export type { ResearchJob, JobStatus };

/** Minimal logger for store operations (e.g. pino). */
export interface JobStoreLogger {
  info(bindings: Record<string, unknown>, msg?: string): void;
}

export interface JobSessionStore {
  create(): Promise<string>;
  get(jobId: string): Promise<ResearchJob | undefined>;
  list(): Promise<ResearchJob[]>;
  setRunning(jobId: string): Promise<void>;
  setCompleted(jobId: string, result: ResearchResult): Promise<void>;
  setFailed(jobId: string, error: string): Promise<void>;
  destroy?(): void | Promise<void>;
}
