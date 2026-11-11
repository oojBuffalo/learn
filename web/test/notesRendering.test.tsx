import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { expect, it } from "vitest";
import type { Explanation, Note } from "@study/shared";
import { NotesListView, ExplanationsListView } from "../src/pages/Notes.js";
import type { ListFilter } from "../src/listFilter.js";

const pkgs = [{ id: "p", title: "Alpha", lessons: [{ id: "l1", title: "One" }] }];
const note = (id: number, over: Partial<Note> = {}): Note => ({ id, body: "# Shopping\n\nmilk", target: null,
  orphaned: false, createdAt: "2026-10-01T10:00:00.000Z", updatedAt: "2026-10-01T10:00:00.000Z", ...over });
const removed = { packageId: "gone", lessonId: "x", packageTitle: null, lessonTitle: null };
const notes = [note(1), note(2, { body: "Package thoughts", target: { packageId: "p", lessonId: null, packageTitle: "Alpha", lessonTitle: null } }),
  note(3, { body: "Lesson thoughts", target: { packageId: "p", lessonId: "l1", packageTitle: "Alpha", lessonTitle: "One" } }),
  note(4, { body: "Removed one", target: removed, orphaned: true }), note(5, { body: "Removed two", target: removed, orphaned: true })];
const renderNotes = (filter: ListFilter = { kind: "all" }, values = notes, query = "") => renderToStaticMarkup(<MemoryRouter>
  <NotesListView notes={values} packages={pkgs} filter={filter} query={query} onFilterChange={() => {}} onQueryChange={() => {}} /></MemoryRouter>);
it("NotesListView hides removed-content notes behind a notice", () => {
  const html = renderNotes(); expect(html).toContain("Shopping"); expect(html).toContain("2 notes belong to content that’s no longer in your library.");
  expect(html).toContain('href="/notes?orphaned=1"'); expect(html).toContain("From removed content (2)"); expect(html).not.toContain("Removed: gone/x");
});
it("NotesListView labels each target", () => {
  const html = renderNotes(); for (const label of ["Standalone", "Alpha", "Alpha › One"]) expect(html).toContain(`<span class="lesson-row-sum">${label}</span>`);
});
it("NotesListView shows only removed-content notes in that view", () => {
  const html = renderNotes({ kind: "orphaned" }); expect(html).toContain("Removed: gone/x"); expect(html).not.toContain("Shopping"); expect(html).not.toContain("belong to content");
});
it("NotesListView has empty states", () => {
  expect(renderNotes({ kind: "all" }, [])).toContain("No notes yet");
  expect(renderNotes({ kind: "package", packageId: "zzz" })).toContain("Nothing here yet.");
});
it("NotesListView carries the filter into New note and offers the package's lessons", () => {
  const html = renderNotes({ kind: "package", packageId: "p", lessonId: "l1" });
  expect(html).toContain('href="/notes/new?packageId=p&amp;lessonId=l1"'); expect(html).toContain('aria-label="Lesson"'); expect(html).toContain(">Whole package<");
  const all = renderNotes(); for (const s of ['href="/notes/new"', 'href="/notes/3"', 'value="pkg:p"']) expect(all).toContain(s);
});
it("NotesListView searches, counts and shows 20 notes at a time", () => {
  const many = [...Array.from({ length: 25 }, (_, i) => note(10 + i, { body: `Résumé ${i + 1}` })), ...notes];
  const rows = (html: string) => html.match(/class="notes-row"/g)?.length ?? 0;
  const all = renderNotes({ kind: "all" }, many);
  expect(all).toMatch(/<input[^>]*type="search"[^>]*aria-label="Search notes"[^>]*value=""/); expect(all).toContain("Showing 20 of 28 notes");
  expect(rows(all)).toBe(20); expect(all).toContain('<button type="button" class="btn">Show more</button>');
  const searched = renderNotes({ kind: "all" }, many, "RESUME"); expect(searched).toContain('value="RESUME"');
  expect(searched).toContain("Showing 20 of 25 notes"); expect(searched).not.toContain("Shopping");
  const one = renderNotes({ kind: "all" }, many, "milk"); expect(one).toContain(">1 note<"); expect(rows(one)).toBe(1); expect(one).not.toContain("Show more");
  const none = renderNotes({ kind: "package", packageId: "p" }, many, " résumé "); expect(none).toContain("No notes match “résumé”."); expect(rows(none)).toBe(0);
  expect(none).not.toContain("Write one here");
  expect(renderNotes({ kind: "all" }, many, "removed two")).toContain('href="/notes?q=removed+two&amp;orphaned=1"');
});
const explanation = (id: number, over: Partial<Explanation> = {}): Explanation => ({ id, packageId: "p", lessonId: "l1", packageTitle: "Alpha", lessonTitle: "One",
  body: "Because retrieval…", confidence: 2, revisit: true, orphaned: false, createdAt: "2026-10-01T10:00:00.000Z", updatedAt: "2026-10-01T10:00:00.000Z", ...over });
const explanations = [explanation(1), explanation(2, { lessonId: "l2", lessonTitle: "Two", confidence: 4, revisit: false }),
  explanation(3, { packageId: "gone", lessonId: "x", packageTitle: null, lessonTitle: null, confidence: 1, revisit: false, orphaned: true })];
const renderExplanations = (filter: ListFilter = { kind: "all" }, revisitOnly = false, values = explanations) => renderToStaticMarkup(<MemoryRouter>
  <ExplanationsListView explanations={values} packages={pkgs} filter={filter} revisitOnly={revisitOnly} onFilterChange={() => {}} onRevisitChange={() => {}} onDismissed={() => {}} /></MemoryRouter>);
it("ExplanationsListView flags revisits and hides removed content", () => {
  const html = renderExplanations(); expect(html).toContain("One"); expect(html).toContain("Two"); expect(html.match(/>revisit</g)).toHaveLength(1);
  for (const s of ["conf-chip is-low", 'href="/notes/explain/1"', 'href="/notes/explain/new"', "Needs revisit",
    "1 explanation belongs to content that’s no longer in your library.", 'href="/notes?tab=explanations&amp;orphaned=1"']) expect(html).toContain(s);
  expect(html).not.toContain("gone/x"); expect(html.match(/<input[^>]*checkbox[^>]*>/)![0]).not.toContain("checked");
});
it("ExplanationsListView offers Dismiss only on revisit prompts", () => {
  const html = renderExplanations(); expect(html.match(/>Dismiss</g)).toHaveLength(1);
  expect(html).toContain('aria-label="Dismiss revisit prompt for One"'); expect(html).not.toContain("Dismiss revisit prompt for Two");
});
it("ExplanationsListView narrows to revisit prompts", () => {
  const html = renderExplanations({ kind: "all" }, true); expect(html).toContain("One"); expect(html).not.toContain("Two");
  expect(html.match(/<input[^>]*checkbox[^>]*>/)![0]).toContain('checked=""');
});
it("ExplanationsListView shows the removed-content view", () => {
  const html = renderExplanations({ kind: "orphaned" }); expect(html).toContain("gone/x"); expect(html).not.toContain(">One<");
});
it("ExplanationsListView empty state", () => { expect(renderExplanations({ kind: "all" }, false, [])).toContain("No explanations yet"); });
