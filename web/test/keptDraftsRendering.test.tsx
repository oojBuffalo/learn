import { renderToStaticMarkup as render } from "react-dom/server";
import { expect, it } from "vitest";
import { KeptDraftsView } from "../src/components/KeptDrafts.js";

const drafts = [{ id: 9, body: "# Kept title\n\nmore", at: "2026-10-22T10:00:00.000Z" }, { id: 4, body: "Second", at: "2026-10-21T10:00:00.000Z" }];
it("KeptDraftsView renders nothing without kept drafts", () => {
  expect(render(<KeptDraftsView kind="note" drafts={[]} onRestore={() => {}} onDiscard={() => {}} />)).toBe("");
});
it("KeptDraftsView names its region and offers Restore and Discard for each draft", () => {
  const html = render(<KeptDraftsView kind="note" drafts={drafts} onRestore={() => {}} onDiscard={() => {}} />);
  const id = html.match(/<section[^>]*aria-labelledby="([^"]+)"/)![1]; expect(html).toContain(`<h2 id="${id}">Kept drafts</h2>`);
  expect(html).toContain("Unsaved text from notes that were deleted. Restore it as a new note, or discard it.");
  expect(html).toContain('<p class="kept-title">Kept title</p>'); expect(html).toContain('<p class="kept-title">Second</p>');
  expect(html).toContain(`Unsaved since ${new Date(drafts[0]!.at).toLocaleString()}`);
  expect(html.match(/>Restore</g)).toHaveLength(2); expect(html.match(/>Discard</g)).toHaveLength(2);
  expect(render(<KeptDraftsView kind="explanation" drafts={drafts} onRestore={() => {}} onDiscard={() => {}} />))
    .toContain("Unsaved text from explanations that were removed. Restore it as a new explanation, or discard it.");
});
