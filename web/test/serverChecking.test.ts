import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.tsx?$/.test(path) ? [path] : [];
  });
}

it("web/src never names a shared checker or scorer", () => {
  const files = sourceFiles(fileURLToPath(new URL("../src/", import.meta.url)));
  expect(files.some((f) => f.endsWith("api.ts"))).toBe(true);
  const banned = /\b(checkAnswer|scoreQuiz|scoreGame|checkGameMove)\b/;
  expect(files.filter((f) => banned.test(readFileSync(f, "utf8")))).toEqual([]);
});
