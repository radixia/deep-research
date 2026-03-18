import { describe, it, expect } from "vitest";
import { decompose } from "./decompose";

describe("decompose", () => {
  it("returns query plus three templated sub-queries by default", () => {
    const out = decompose("agentic AI");
    expect(out).toHaveLength(4);
    expect(out[0]).toBe("agentic AI");
    expect(out[1]).toContain("latest news 2026");
    expect(out[2]).toContain("comparison analysis");
    expect(out[3]).toContain("best practices");
  });

  it("respects max parameter", () => {
    expect(decompose("x", 2)).toHaveLength(2);
    expect(decompose("x", 1)).toHaveLength(1);
  });
});
