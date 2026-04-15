import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readFile } from "node:fs/promises";
import { FileJobSessionStore } from "./file-store.js";

describe("FileJobSessionStore", () => {
  let dir: string;
  let store: FileJobSessionStore;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "dr-jobs-"));
    store = new FileJobSessionStore({ filePath: join(dir, "jobs.json") });
  });

  afterEach(async () => {
    store.destroy();
    await rm(dir, { recursive: true, force: true });
  });

  it("persists jobs to disk", async () => {
    const jobId = await store.create();
    await store.setRunning(jobId);
    await store.setCompleted(jobId, {
      query: "q",
      depth: "quick",
      status: "completed",
      summary: "ok",
      sources: [],
      toolResults: [],
      confidenceScore: 0.5,
      createdAt: new Date(),
      completedAt: new Date(),
    });
    const raw = await readFile(join(dir, "jobs.json"), "utf-8");
    const data = JSON.parse(raw) as Record<string, { status: string }>;
    expect(data[jobId]?.status).toBe("completed");
  });

  it("get returns job after reload", async () => {
    const jobId = await store.create();
    const store2 = new FileJobSessionStore({ filePath: join(dir, "jobs.json") });
    const job = await store2.get(jobId);
    expect(job?.status).toBe("pending");
    store2.destroy();
  });
});
