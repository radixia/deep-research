import { describe, it, expect } from "vitest";
import { MemoryJobSessionStore } from "./job-session-store/index.js";

describe("JobSessionStore (memory)", () => {
  const store = new MemoryJobSessionStore();

  it("create returns a UUID and get returns the job", async () => {
    const jobId = await store.create();
    expect(jobId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    const job = await store.get(jobId);
    expect(job).toBeDefined();
    expect(job?.status).toBe("pending");
    expect(job?.createdAt).toBeInstanceOf(Date);
  });

  it("setCompleted stores result", async () => {
    const jobId = await store.create();
    await store.setRunning(jobId);
    await store.setCompleted(jobId, {
      query: "q",
      depth: "quick",
      status: "completed",
      summary: "Done",
      sources: [],
      toolResults: [],
      confidenceScore: 0.8,
      executiveSummary: "",
      detailSections: [],
      references: [],
      createdAt: new Date(),
      completedAt: new Date(),
    });
    const job = await store.get(jobId);
    expect(job?.status).toBe("completed");
    expect(job?.result?.summary).toBe("Done");
  });

  it("setFailed stores error", async () => {
    const jobId = await store.create();
    await store.setFailed(jobId, "Something broke");
    const job = await store.get(jobId);
    expect(job?.status).toBe("failed");
    expect(job?.error).toBe("Something broke");
  });
});
