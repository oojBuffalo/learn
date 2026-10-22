import { describe, expect, it } from "vitest";
import { FORMAT_VERSION } from "../src/index.js";

describe("workspace", () => {
  it("exposes the format version", () => {
    expect(FORMAT_VERSION).toBe("1.0.0");
  });
});
