import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPackageFolder } from "../src/packageFolder.js";

describe("readPackageFolder", () => {
  it("accepts the authored matching-and-recommendation package", () => {
    const { pkg, errors } = readPackageFolder("content/matching-and-recommendation");
    expect(errors).toEqual([]);
    expect(pkg?.lessons.length).toBeGreaterThan(0);
    expect(pkg?.items.length).toBeGreaterThan(0);
  });

  it("reports a missing manifest", () => {
    const dir = mkdtempSync(join(tmpdir(), "pkg-"));
    mkdirSync(join(dir, "lessons"));
    writeFileSync(join(dir, "lessons", "01-a.md"), "---\nid: a\ntitle: A\n---\n\nBody\n");
    const { pkg, errors } = readPackageFolder(dir);
    rmSync(dir, { recursive: true, force: true });
    expect(pkg).toBeNull();
    expect(errors).toContainEqual({
      file: "manifest.json",
      path: "",
      message: "missing manifest.json",
    });
  });

  it("reports an unreadable folder", () => {
    const { pkg, errors } = readPackageFolder("content/does-not-exist");
    expect(pkg).toBeNull();
    expect(errors.length).toBeGreaterThan(0);
  });
});
