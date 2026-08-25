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

  // Exact counts, not just emptiness: a regression that silently drops a unit,
  // a lesson or an item has to fail here rather than pass as "still non-empty".
  it("accepts the authored web-app-reference package with its full contents", () => {
    const { pkg, errors } = readPackageFolder("content/web-app-reference");
    expect(errors).toEqual([]);
    expect(pkg?.lessons.length).toBe(57);
    expect(pkg?.items.length).toBe(498);
    expect(pkg?.quizzes.length).toBe(12);
    expect(pkg?.games.length).toBe(24);
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

  it("reports a directory that does not exist", () => {
    const { pkg, errors } = readPackageFolder("content/does-not-exist");
    expect(pkg).toBeNull();
    expect(errors).toEqual([
      { file: "(folder)", path: "", message: "package directory does not exist" },
    ]);
  });

  it("reports a path that is not a directory", () => {
    const { pkg, errors } = readPackageFolder("content/README.md");
    expect(pkg).toBeNull();
    expect(errors).toEqual([
      { file: "(folder)", path: "", message: "package path is not a directory" },
    ]);
  });
});
