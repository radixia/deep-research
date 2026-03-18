import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TavilyClient } from "./index";

describe("TavilyClient", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              results: [
                {
                  url: "https://example.com",
                  title: "Example",
                  content: "Snippet text",
                  score: 0.9,
                },
              ],
            }),
        } as Response)
      )
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns ToolResult with citations on success", async () => {
    const client = new TavilyClient("test-key");
    const result = await client.run("test query");
    expect(result.tool).toBe("tavily");
    expect(result.success).toBe(true);
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0].url).toBe("https://example.com");
    expect(result.citations[0].sourceTool).toBe("tavily");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("returns success: false on API error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false } as Response))
    );
    const client = new TavilyClient("test-key");
    const result = await client.run("test");
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.citations).toHaveLength(0);
  });
});
