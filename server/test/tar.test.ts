import { execFileSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { expect, it } from "vitest";
import { buildTar } from "../src/tar.js";
import type { TarEntry } from "../src/tar.js";
import { extractTgz } from "./helpers.js";

const AT = new Date("2026-10-01T10:00:00.000Z");
const LATER = new Date("2026-10-02T11:30:45.000Z");
const seconds = (d: Date) => d.getTime() / 1000;
const file = (name: string, text: string, mtime = AT): TarEntry => ({ type: "file", name, mtime, data: Buffer.from(text, "utf8") });
const unicode = "Größe ≠ size — 日本語 😀🧠\n".repeat(40);
const long = `notes/${"n".repeat(91)}.md`;
const ENTRIES: TarEntry[] = [
  { type: "directory", name: "notes/", mtime: LATER },
  file("notes/empty.md", ""),
  file("notes/block.md", "b".repeat(512)),
  file("notes/over.md", "o".repeat(513), LATER),
  file("notes/unicode.md", unicode),
  file(long, "100-byte name"),
];
const field = (header: Buffer, start: number, length: number) => header.subarray(start, start + length).toString("latin1");

it("writes ustar headers that the system tar lists, with byte sizes", () => {
  expect(Buffer.byteLength(long)).toBe(100);
  expect(Buffer.byteLength(unicode)).toBeGreaterThan(unicode.length);
  const lines = execFileSync("tar", ["-tvzf", "-"], { input: gzipSync(buildTar(ENTRIES)) }).toString("utf8").trimEnd().split(/\r?\n/);
  expect(lines).toHaveLength(ENTRIES.length);
  ENTRIES.forEach((entry, i) => {
    const line = lines[i]!;
    const size = entry.type === "file" ? entry.data.length : 0;
    expect(line.startsWith(entry.type === "file" ? "-rw-r--r-- " : "drwxr-xr-x ")).toBe(true);
    expect(line.endsWith(` ${entry.name}`)).toBe(true);
    expect(line).toMatch(new RegExp(` ${size} `));
  });
});

it("round-trips bytes and mtimes through tar -xzf", () => {
  const extracted = extractTgz(gzipSync(buildTar(ENTRIES)));
  expect([...extracted.keys()]).toEqual(["notes", ...ENTRIES.slice(1).map((e) => e.name).sort()]);
  expect(extracted.get("notes")).toMatchObject({ dir: true, mtime: seconds(LATER) });
  for (const entry of ENTRIES) {
    if (entry.type !== "file") continue;
    const got = extracted.get(entry.name)!;
    expect(got.data.equals(Buffer.from(entry.data))).toBe(true);
    expect(got.mtime).toBe(seconds(entry.mtime));
  }
});

it("fills each header field, pads to 512 bytes and ends with two zero blocks", () => {
  const tar = buildTar([file("notes/a.md", "héllo")]);
  expect(tar.length).toBe(512 + 512 + 1024);
  const header = tar.subarray(0, 512);
  expect(field(header, 0, 100)).toBe("notes/a.md".padEnd(100, "\0"));
  expect(field(header, 100, 8)).toBe("0000644\0");
  expect(field(header, 108, 8)).toBe("0000000\0");
  expect(field(header, 116, 8)).toBe("0000000\0");
  expect(field(header, 124, 12)).toBe("00000000006\0");
  expect(field(header, 136, 12)).toBe(`${seconds(AT).toString(8).padStart(11, "0")}\0`);
  expect(field(header, 156, 1)).toBe("0");
  expect(field(header, 257, 6)).toBe("ustar\0");
  expect(field(header, 263, 2)).toBe("00");
  const spaced = Buffer.from(header); spaced.fill(" ", 148, 156);
  const sum = spaced.reduce((total, byte) => total + byte, 0);
  expect(field(header, 148, 8)).toBe(`${sum.toString(8).padStart(6, "0")}\0 `);
  expect(tar.subarray(512, 518).equals(Buffer.from("héllo"))).toBe(true);
  expect(tar.subarray(518).every((byte) => byte === 0)).toBe(true);
  expect(buildTar([])).toEqual(Buffer.alloc(1024));
});

it("refuses a name over 100 bytes, an empty name and an mtime outside the octal field", () => {
  expect(() => buildTar([file(`${long}x`, "")])).toThrow(RangeError);
  expect(() => buildTar([file(`notes/${"é".repeat(46)}.md`, "")])).toThrow(RangeError);
  expect(() => buildTar([file("", "")])).toThrow(RangeError);
  for (const mtime of [new Date(Number.NaN), new Date(-1000), new Date(8 ** 11 * 1000)]) {
    expect(() => buildTar([file("notes/a.md", "", mtime)])).toThrow(RangeError);
  }
});
