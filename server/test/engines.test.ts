import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { expect, it } from "vitest";

const read = (url: URL | string) => JSON.parse(readFileSync(url, "utf8"));
const majors = (range: string) => range.split("||").map((p) => p.trim().split(".")[0]);

it("better-sqlite3 declares support for every Node major in root engines", () => {
  const root = read(new URL("../../package.json", import.meta.url));
  const pkgPath = createRequire(import.meta.url).resolve("better-sqlite3/package.json");
  const supported = majors(read(pkgPath).engines.node);
  for (const major of majors(root.engines.node)) expect(supported).toContain(major);
});
