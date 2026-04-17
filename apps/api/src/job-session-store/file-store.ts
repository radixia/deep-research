import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { dirname } from "node:path";
import { existsSync } from "node:fs";
import type { ResearchResult } from "@deep-research/types";
import type { JobSessionStore, JobStoreLogger } from "./types.js";
import type { ResearchJob } from "../job-store.js";

/** Stored shape: dates as ISO strings for JSON round-trip */
interface StoredJob {
  jobId: string;
  status: ResearchJob["status"];
  result?: ResearchResult;
  error?: string;
  createdAt: string;
}

function toStored(job: ResearchJob): StoredJob {
  return {
    jobId: job.jobId,
    status: job.status,
    ...(job.result !== undefined && { result: job.result }),
    ...(job.error !== undefined && { error: job.error }),
    createdAt:
      job.createdAt instanceof Date ? job.createdAt.toISOString() : (job.createdAt as string),
  };
}

function fromStored(stored: StoredJob): ResearchJob {
  const createdAt = new Date(stored.createdAt);
  const result = stored.result
    ? {
        ...stored.result,
        createdAt:
          stored.result.createdAt instanceof Date
            ? stored.result.createdAt
            : new Date(stored.result.createdAt as string),
        completedAt:
          stored.result.completedAt != null
            ? stored.result.completedAt instanceof Date
              ? stored.result.completedAt
              : new Date(stored.result.completedAt as string)
            : undefined,
      }
    : undefined;
  return {
    jobId: stored.jobId,
    status: stored.status,
    ...(result !== undefined && { result }),
    ...(stored.error !== undefined && { error: stored.error }),
    createdAt,
  };
}

export interface FileJobSessionStoreOptions {
  /** Path to the JSON file (e.g. output/jobs.json). Directory is created if missing. */
  filePath: string;
  /** Optional logger for store operations (create, setRunning, setCompleted, setFailed). */
  logger?: JobStoreLogger;
}

export class FileJobSessionStore implements JobSessionStore {
  private readonly filePath: string;
  private readonly logger?: JobStoreLogger;
  private cache = new Map<string, ResearchJob>();

  constructor(options: FileJobSessionStoreOptions) {
    this.filePath = options.filePath;
    this.logger = options.logger;
  }

  private async ensureDir(): Promise<void> {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
  }

  private async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, "utf-8");
      const data = JSON.parse(raw) as Record<string, StoredJob>;
      this.cache = new Map(
        Object.entries(data).map(([id, stored]) => [id, fromStored(stored)])
      );
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        this.cache = new Map();
        return;
      }
      throw err;
    }
  }

  private async save(): Promise<void> {
    await this.ensureDir();
    const data: Record<string, StoredJob> = {};
    for (const [id, job] of this.cache) {
      data[id] = toStored(job);
    }
    const tmpPath = `${this.filePath}.${process.pid}.${Date.now()}`;
    await writeFile(tmpPath, JSON.stringify(data, null, 0), "utf-8");
    await rename(tmpPath, this.filePath);
  }

  private async readModifyWrite<T>(fn: () => T): Promise<T> {
    await this.load();
    const result = fn();
    await this.save();
    return result;
  }

  async create(): Promise<string> {
    const jobId = await this.readModifyWrite(() => {
      const id = crypto.randomUUID();
      this.cache.set(id, {
        jobId: id,
        status: "pending",
        createdAt: new Date(),
      });
      return id;
    });
    this.logger?.info({ component: "job_store", operation: "create", jobId, status: "pending" }, "job_store.create");
    return jobId;
  }

  async get(jobId: string): Promise<ResearchJob | undefined> {
    await this.load();
    return this.cache.get(jobId);
  }

  async setRunning(jobId: string): Promise<void> {
    await this.readModifyWrite(() => {
      const job = this.cache.get(jobId);
      if (job) job.status = "running";
    });
    this.logger?.info({ component: "job_store", operation: "setRunning", jobId, status: "running" }, "job_store.setRunning");
  }

  async setCompleted(jobId: string, result: ResearchResult): Promise<void> {
    await this.readModifyWrite(() => {
      const job = this.cache.get(jobId);
      if (job) {
        job.status = "completed";
        job.result = result;
      }
    });
    this.logger?.info(
      { component: "job_store", operation: "setCompleted", jobId, status: "completed", summaryLength: result.summary?.length ?? 0, sourcesCount: result.sources?.length ?? 0 },
      "job_store.setCompleted"
    );
  }

  async setFailed(jobId: string, error: string): Promise<void> {
    await this.readModifyWrite(() => {
      const job = this.cache.get(jobId);
      if (job) {
        job.status = "failed";
        job.error = error;
      }
    });
    this.logger?.info({ component: "job_store", operation: "setFailed", jobId, status: "failed", error: error.slice(0, 200) }, "job_store.setFailed");
  }
}
