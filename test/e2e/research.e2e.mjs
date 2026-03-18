#!/usr/bin/env node
/**
 * E2E test: POST /research → poll GET /research/:jobId until completed or failed.
 *
 * Usage:
 *   node test/e2e/research.e2e.mjs
 *   API_BASE_URL=https://localhost:3000 node test/e2e/research.e2e.mjs
 *   API_KEY=your-key node test/e2e/research.e2e.mjs
 *
 * Requires the API to be running (pnpm dev).
 */

const BASE_URL = process.env.API_BASE_URL ?? "http://localhost:3000";
const API_KEY = process.env.API_KEY ?? "";
const POLL_INTERVAL_MS = 2_000;
const QUICK_TIMEOUT_MS = 90_000; // quick depth ~10–30s, allow margin

const headers = {
  "Content-Type": "application/json",
  ...(API_KEY && { "x-api-key": API_KEY }),
};

async function main() {
  console.log("E2E Research test");
  console.log("  BASE_URL:", BASE_URL);
  console.log("  depth: quick");
  console.log("");

  const query = "State of agentic AI in 2026";

  // 1. POST /research
  let res = await fetch(`${BASE_URL}/research`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, depth: "quick" }),
  });

  if (res.status !== 202) {
    const text = await res.text();
    console.error("POST /research failed:", res.status, text);
    process.exit(1);
  }

  const { jobId, status } = await res.json();
  if (!jobId) {
    console.error("Missing jobId in response");
    process.exit(1);
  }
  console.log("Job created:", jobId, status);

  // 2. Poll GET /research/:jobId
  const deadline = Date.now() + QUICK_TIMEOUT_MS;
  let lastStatus = "pending";

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    res = await fetch(`${BASE_URL}/research/${jobId}`, { headers });
    if (!res.ok) {
      console.error("GET /research/:jobId failed:", res.status, await res.text());
      process.exit(1);
    }

    const job = await res.json();
    lastStatus = job.status;

    if (job.status === "completed") {
      console.log("\nStatus: completed");
      const r = job.result;
      if (r) {
        console.log("Summary length:", r.summary?.length ?? 0, "chars");
        console.log("Sources count:", r.sources?.length ?? 0);
        console.log("Confidence:", r.confidenceScore ?? "—");
      }
      process.exit(0);
    }

    if (job.status === "failed") {
      console.error("\nStatus: failed");
      console.error("Error:", job.error ?? "unknown");
      process.exit(1);
    }

    process.stdout.write(".");
  }

  console.error("\nTimeout waiting for job (last status:", lastStatus + ")");
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
