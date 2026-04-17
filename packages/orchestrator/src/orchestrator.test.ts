import { describe, it, expect } from "vitest";
import { decompose } from "./decompose.js";

describe("decompose", () => {
  it("uses short-query variants for few words (no meaningless suffixes)", () => {
    const out = decompose("agentic AI");
    expect(out).toHaveLength(3);
    expect(out[0]).toBe("agentic AI");
    expect(out[1]).toContain("overview");
    expect(out[2]).toContain("context");
  });

  it("uses broader variants for longer queries", () => {
    const out = decompose("state of agentic AI in enterprise adoption", 4);
    expect(out).toHaveLength(3);
    expect(out[0]).toBe("state of agentic AI in enterprise adoption");
    expect(out[1]).toContain("recent developments");
    expect(out[2]).toContain("comparison");
  });

  it("respects max parameter", () => {
    expect(decompose("x", 2)).toHaveLength(2);
    expect(decompose("x", 1)).toHaveLength(1);
  });
});
