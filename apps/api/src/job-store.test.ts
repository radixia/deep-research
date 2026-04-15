import { describe, it, expect } from "vitest";
import {
  createJob,
  getJob,
  setJobRunning,
  setJobCompleted,
  setJobFailed,
} from "./job-store.js";

describe("job-store", () => {
  it("createJob returns a UUID and getJob returns the job", () => {
    const jobId = createJob();
    expect(jobId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    const job = getJob(jobId);
    expect(job).toBeDefined();
    expect(job?.status).toBe("pending");
    expect(job?.createdAt).toBeInstanceOf(Date);
  });

  it("setJobCompleted stores result", () => {
    const jobId = createJob();
    setJobRunning(jobId);
    setJobCompleted(jobId, {
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
    const job = getJob(jobId);
    expect(job?.status).toBe("completed");
    expect(job?.result?.summary).toBe("Done");
  });

  it("setJobFailed stores error", () => {
    const jobId = createJob();
    setJobFailed(jobId, "Something broke");
    const job = getJob(jobId);
    expect(job?.status).toBe("failed");
    expect(job?.error).toBe("Something broke");
  });
});
