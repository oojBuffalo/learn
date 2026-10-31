import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { HomeView } from "../src/pages/Home.js";
import { LeftoverProgressView } from "../src/components/LeftoverProgress.js";
import LessonCompanion from "../src/components/LessonCompanion.js";
import type { Explanation, OrphanGroup } from "@study/shared";
import type { PackageSummary } from "../src/api.js";

const render = (node: React.ReactNode) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);
const today = new Date(2026, 9, 22);
const packages: PackageSummary[] = [{ id: "p", title: "Package", version: "1", lessonCount: 7,
  lessons: Array.from({ length: 7 }, (_, i) => ({ id: `l${i + 1}`, title: `Lesson ${i + 1}`, status: "in-progress" })), quizzes: [], games: [] }];
const revisit: Explanation[] = Array.from({ length: 7 }, (_, i) => ({
  id: i + 1, packageId: "p", lessonId: `l${i + 1}`, packageTitle: "Package", lessonTitle: `Lesson ${i + 1}`,
  body: "Recall", confidence: 2, revisit: true, orphaned: false, createdAt: "2026-10-22T12:00:00Z", updatedAt: "2026-10-22T12:00:00Z",
}));
const home = (over: Partial<React.ComponentProps<typeof HomeView>> = {}) => render(<HomeView
  today={today} due={0} dueLoading={false} packages={[]} revisit={[]} failed={false} onRetry={() => {}} {...over} />);

it("HomeView points an empty library at the Library", () => {
  expect(home()).toContain("Your library is empty");
  expect(home()).toContain('href="/library"');
});
it("HomeView explains empty due and revisit states", () => {
  const out = home();
  expect(out).toContain("Nothing due — cards come back as their intervals expire.");
  expect(out).toContain("Explain a lesson in your own words — anything you rate 1 or 2 comes back here.");
  expect(out).toContain('href="/notes/explain/new"');
  expect(out).not.toContain("Start review");
});
it("HomeView limits reading and revisit rows and links the overflow", () => {
  const out = home({ due: 4, packages, revisit });
  expect(out).toContain('<h1 class="page-title">Today</h1>');
  expect(out).toContain('<p class="home-figure">4</p>');
  expect(out).toContain("cards waiting");
  expect(out.match(/class="lesson-row"/g)).toHaveLength(5);
  expect(out).toContain("+2 more in the Library");
  expect(out.match(/>Explain again</g)).toHaveLength(5);
  expect(out).toContain('href="/notes?tab=explanations&amp;revisit=1"');
  expect(home({ due: 1 })).toContain("card waiting");
});
it("HomeView links each revisit to explaining again and rereading", () => {
  const out = home({ revisit: [revisit[0]!] });
  expect(out).toContain('href="/notes/explain/new?packageId=p&amp;lessonId=l1"');
  expect(out).toContain('href="/lesson/p/l1"');
  expect(out).toContain("2 · Shaky");
});
it("HomeView preserves independently loaded sections after a failure", () => {
  const out = home({ due: null, packages: null, revisit: [], failed: true });
  expect(out).toContain('role="alert"');
  expect(out).toContain("Some of today’s plan couldn’t be loaded.");
  expect(out).toContain(">Try again<");
  expect(out).toContain("Couldn’t count your cards.");
  expect(out).toContain("Couldn’t load your lessons.");
  expect(out).toContain("Explain a lesson in your own words");
});
it("HomeView distinguishes the initial due load from a failed count", () => {
  const out = home({ due: null, dueLoading: true });
  expect(out).toContain("Loading…");
  expect(out).not.toContain("Couldn’t count your cards.");
});

const group: OrphanGroup = { packageId: "gone", packageTitle: null, inLibrary: false,
  counts: { cardState: 3, reviewLog: 12, attempts: 2, lessonProgress: 1, notes: 2, explanations: 1 } };
const leftover = (over: Partial<React.ComponentProps<typeof LeftoverProgressView>> = {}) => render(<LeftoverProgressView
  groups={[group]} confirming={null} includeWriting={false} pending={false} error={null} status={null}
  onAsk={() => {}} onCancel={() => {}} onToggleWriting={() => {}} onPurge={() => {}} {...over} />);
const checkbox = (out: string) => out.match(/<input[^>]*checkbox[^>]*>/)?.[0];
const purgeButton = (out: string) => out.match(/<button[^>]*>Delete for good<\/button>/)![0];
it("LeftoverProgressView hides an empty panel but preserves the purge result", () => {
  expect(leftover({ groups: [] })).toBe("");
  expect(leftover({ groups: [], status: "Removed 3 records." })).toContain("Removed 3 records.");
});
it("LeftoverProgressView lists counts and retained-writing links", () => {
  const out = leftover();
  expect(out).toContain("Leftover progress");
  expect(out).toContain("package deleted");
  expect(out).toContain("3 card schedules · 12 reviews · 2 results · 1 lesson mark · 2 notes · 1 explanation");
  expect(out).toContain('href="/notes?orphaned=1&amp;packageId=gone"');
  expect(out).toContain('href="/notes?tab=explanations&amp;orphaned=1&amp;packageId=gone"');
  expect(checkbox(out)).toBeUndefined();
  expect(leftover({ groups: [{ ...group, inLibrary: true, packageTitle: "Alpha" }] })).toContain("some lessons or cards were removed by an import");
});
it("LeftoverProgressView spares writing until explicitly ticked", () => {
  const out = leftover({ confirming: "gone" });
  expect(out).toContain("Delete 18 records for good? Re-importing won’t bring them back.");
  expect(out).toContain("Also delete 2 notes and 1 explanation");
  expect(checkbox(out)).not.toContain("checked");
  expect(purgeButton(out)).not.toContain("disabled");
  const opted = leftover({ confirming: "gone", includeWriting: true });
  expect(opted).toContain("Delete 21 records for good?");
  expect(checkbox(opted)).toContain('checked=""');
});
it("LeftoverProgressView omits writing controls when there is no writing", () => {
  expect(checkbox(leftover({ confirming: "gone", groups: [{ ...group, counts: { ...group.counts, notes: 0, explanations: 0 } }] }))).toBeUndefined();
});
it("LeftoverProgressView disables empty or in-flight purges", () => {
  expect(purgeButton(leftover({ confirming: "gone", pending: true }))).toContain('disabled=""');
  expect(purgeButton(leftover({ confirming: "gone", groups: [{ ...group, counts: { ...group.counts, cardState: 0, reviewLog: 0, attempts: 0, lessonProgress: 0 } }] }))).toContain('disabled=""');
});
it("LeftoverProgressView announces errors and results", () => {
  expect(leftover({ error: "x" })).toContain('role="alert"');
  expect(leftover({ status: "Removed 3 records." })).toContain('role="status"');
});
it("LessonCompanion links to explain-back and lesson notes", () => {
  const out = render(<LessonCompanion packageId="p" lessonId="l" />);
  expect(out).toContain('aria-label="After this lesson"');
  expect(out).toContain('href="/notes/explain/new?packageId=p&amp;lessonId=l"');
  expect(out).toContain('href="/notes/new?packageId=p&amp;lessonId=l"');
  expect(out).toContain('href="/notes?packageId=p&amp;lessonId=l"');
});
