import { renderToStaticMarkup as render } from "react-dom/server";
import { expect, it } from "vitest";
import Markdown from "../src/components/Markdown.js";
import Icon from "../src/components/Icon.js";
import MarkdownEditor from "../src/components/MarkdownEditor.js";
import ConfidencePicker, { ConfidenceChip } from "../src/components/ConfidencePicker.js";
import TargetSelect, { encodeTarget, decodeTarget } from "../src/components/TargetSelect.js";

const pkgs = [{ id: "p", title: "Alpha", lessons: [{ id: "l1", title: "One" }] }, { id: "q", title: "Beta", lessons: [] }];
it("Markdown rewrites package assets only when a packageId is given", () => {
  expect(render(<Markdown>{"![x](assets/x.png)"}</Markdown>)).toContain('src="assets/x.png"');
  expect(render(<Markdown packageId="p">{"![x](assets/x.png)"}</Markdown>)).toContain('src="/api/packages/p/assets/x.png"');
});
it("Markdown strips javascript: links in user text", () => expect(render(<Markdown>{"[a](javascript:alert(1))"}</Markdown>)).not.toContain("javascript:"));
it("Markdown renders broken TeX as an error instead of throwing", () => expect(render(<Markdown>{"$\\frac{$"}</Markdown>)).toContain("katex-error"));
it("Icon has home and note", () => {
  expect(render(<Icon name="home" />)).toContain("M4 10.5 12 4"); expect(render(<Icon name="note" />)).toContain("M6 3.5h8.5");
});
it("MarkdownEditor ties its label to the textarea, starts on Write and has no length cap", () => {
  const html = render(<MarkdownEditor label="Note" value="Hi" onChange={() => {}} />);
  const id = html.match(/<label for="([^"]+)"/)![1]; expect(html).toMatch(new RegExp(`<textarea[^>]*id="${id}"`));
  expect(html).not.toContain("maxlength"); expect(html).not.toMatch(/<textarea[^>]*hidden/); expect(html).not.toContain("editor-preview");
  expect(html).toContain("Write</label>"); expect(html).toContain("Preview</label>");
  expect(html).toContain("Markdown and $math$ work — write \\$ for a dollar sign.");
});
it("MarkdownEditor gives two editors distinct mode groups", () => {
  const html = render(<><MarkdownEditor label="One" value="" onChange={() => {}} /><MarkdownEditor label="Two" value="" onChange={() => {}} /></>);
  const names = [...html.matchAll(/type="radio" name="([^"]+)"/g)].map((m) => m[1]); expect(names).toHaveLength(4); expect(new Set(names).size).toBe(2);
});
it("MarkdownEditor shows the count only above 90% of the cap", () => {
  expect(render(<MarkdownEditor label="Note" value={"x".repeat(90_000)} onChange={() => {}} />)).not.toContain("editor-count");
  expect(render(<MarkdownEditor label="Note" value={"x".repeat(90_001)} onChange={() => {}} />)).toContain("90,001 / 100,000");
});
it("ConfidencePicker renders a legend and five unchecked radios", () => {
  const html = render(<ConfidencePicker value={null} onChange={() => {}} />);
  expect(html).toContain("<legend>How well could you explain it?</legend>"); expect(html.match(/type="radio"/g)).toHaveLength(5);
  for (const t of ["1 · Lost", "2 · Shaky", "3 · Getting there", "4 · Solid", "5 · Could teach it"]) expect(html).toContain(t);
  expect(html).not.toContain("checked");
});
it("ConfidencePicker checks the given value and keeps groups apart", () => {
  const html = render(<ConfidencePicker value={2} onChange={() => {}} />);
  const on = html.match(/<input[^>]*checked=""[^>]*>/g)!; expect(on).toHaveLength(1); expect(on[0]).toContain('value="2"');
  const both = render(<><ConfidencePicker value={2} onChange={() => {}} /><ConfidencePicker value={null} onChange={() => {}} /></>);
  expect(new Set([...both.matchAll(/type="radio" name="([^"]+)"/g)].map((m) => m[1])).size).toBe(2);
});
it("ConfidenceChip marks low and high", () => {
  expect(render(<ConfidenceChip confidence={2} />)).toContain("conf-chip is-low"); expect(render(<ConfidenceChip confidence={2} />)).toContain("2 · Shaky");
  expect(render(<ConfidenceChip confidence={3} />)).not.toMatch(/is-low|is-high/); expect(render(<ConfidenceChip confidence={4} />)).toContain("conf-chip is-high");
});
it("TargetSelect groups lessons by package and selects the value", () => {
  const html = render(<TargetSelect label="Attach to" packages={pkgs} value={{ packageId: "p", lessonId: "l1" }} onChange={() => {}} />);
  expect(html).toContain('<optgroup label="Alpha">'); expect(html).toContain('value="">Standalone</option>'); expect(html).toContain('value="p/">Whole package</option>');
  expect(html).toMatch(/<option[^>]*value="p\/l1"[^>]*selected=""[^>]*>One<\/option>/);
  const id = html.match(/<label for="([^"]+)"/)![1]; expect(html).toContain(`id="${id}"`);
});
it("TargetSelect lessonsOnly drops Standalone and Whole package", () => {
  const html = render(<TargetSelect label="Lesson" packages={pkgs} value={null} lessonsOnly onChange={() => {}} />);
  expect(html).not.toMatch(/Standalone|Whole package/); expect(html).toMatch(/<option[^>]*disabled=""[^>]*>Pick a lesson…<\/option>/);
});
it("TargetSelect keeps a target that is no longer in the library", () => {
  const html = render(<TargetSelect label="Attach to" packages={pkgs} value={{ packageId: "gone", lessonId: "x" }} onChange={() => {}} />);
  expect(html).toMatch(/<option[^>]*selected=""[^>]*>gone\/x \(no longer in your library\)<\/option>/);
  expect(render(<TargetSelect label="Attach to" packages={pkgs} value={{ packageId: "gone", lessonId: null }} onChange={() => {}} />)).toContain("gone (no longer in your library)");
});
it("TargetSelect currentOnly offers only Standalone and the given target", () => {
  const one = pkgs.slice(0, 1);
  const html = render(<TargetSelect label="Attach to" packages={one} value={{ packageId: "p", lessonId: "l1" }} onChange={() => {}} currentOnly />);
  expect(html.match(/<option/g)).toHaveLength(2); expect(html).not.toMatch(/<optgroup|Whole package|no longer in your library/);
  expect(html).toMatch(/<option[^>]*value="p\/l1"[^>]*selected=""[^>]*>Alpha › One<\/option>/);
  const blank = render(<TargetSelect label="Attach to" packages={one} value={null} onChange={() => {}} currentOnly />);
  expect(blank).toMatch(/<option[^>]*value=""[^>]*selected=""[^>]*>Standalone<\/option>/); expect(blank).toContain('value="p/l1"');
  expect(render(<TargetSelect label="Attach to" packages={[{ id: "p", title: "p", lessons: [] }]} value={{ packageId: "p", lessonId: null }} onChange={() => {}} currentOnly />)).toMatch(/<option[^>]*value="p\/"[^>]*selected=""[^>]*>p<\/option>/);
});
it("encodeTarget and decodeTarget round-trip", () => {
  expect(encodeTarget(null)).toBe(""); expect(encodeTarget({ packageId: "p", lessonId: null })).toBe("p/"); expect(encodeTarget({ packageId: "p", lessonId: "l1" })).toBe("p/l1");
  for (const t of [null, { packageId: "p", lessonId: null }, { packageId: "p", lessonId: "l1" }]) expect(decodeTarget(encodeTarget(t))).toEqual(t);
  expect(decodeTarget("nonsense")).toBeNull();
});
