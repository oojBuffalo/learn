import { expect, test } from "@playwright/test";
import type { Page, Route } from "@playwright/test";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

test.describe.configure({ mode: "serial" });
const PKG = "learning-how-to-learn";
const LESSON = "active-recall";

test("a note saves once, keeps its editor and can be deleted", async ({ page, request }) => {
  await page.goto(`/lesson/${PKG}/${LESSON}`);
  await page.getByRole("link", { name: "Write a note", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/notes/new\\?packageId=${PKG}&lessonId=${LESSON}$`));
  await expect(page.getByLabel("Attach to")).toHaveValue(`${PKG}/${LESSON}`);
  const editor = page.getByLabel("Note", { exact: true });
  const save = page.getByRole("button", { name: "Save", exact: true });
  await expect(save).toBeDisabled();
  await editor.fill("x".repeat(100_001));
  await expect(save).toBeDisabled(); await expect(page.locator(".editor-count")).toHaveText("100,001 / 100,000");
  expect(await editor.evaluate((el) => (el as HTMLTextAreaElement).value.length)).toBe(100_001);
  await editor.fill("Area is $a^2$"); await expect(save).toBeEnabled();
  await editor.evaluate((el) => el.setAttribute("data-probe", "kept"));
  await page.getByLabel("Preview", { exact: true }).check();
  await expect(page.locator(".editor-preview .katex")).toBeVisible(); await expect(editor).toBeHidden();
  await page.getByLabel("Write", { exact: true }).check(); await expect(editor).toHaveAttribute("data-probe", "kept");
  let posts = 0; let releasePost!: () => void;
  const postHeld = new Promise<void>((resolve) => { releasePost = resolve; });
  await page.route("**/api/notes", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    posts += 1;
    if (posts === 1) return route.fulfill({ status: 500, body: "{}" });
    if (posts === 2) await postHeld;
    await route.continue();
  });
  let noteGets = 0;
  page.on("request", (r) => { if (r.method() === "GET" && /\/api\/notes\/\d+$/.test(new URL(r.url()).pathname)) noteGets += 1; });
  await save.click(); await expect(page.getByRole("alert")).toBeVisible(); await expect(editor).toHaveValue("Area is $a^2$");
  await save.evaluate((b: HTMLButtonElement) => { b.click(); b.click(); });
  await expect(page.getByRole("alert")).toHaveCount(0); releasePost();
  await expect(page).toHaveURL(/\/notes\/\d+$/); expect(posts).toBe(2); await expect(editor).toHaveAttribute("data-probe", "kept");
  let patches = 0; let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/notes/*", async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    patches += 1; if (patches === 1) await held; await route.continue();
  });
  await editor.click(); await page.keyboard.press("End"); await page.keyboard.type(" and more");
  const responded = page.waitForResponse((r) => r.request().method() === "PATCH");
  await save.evaluate((b: HTMLButtonElement) => { b.click(); b.click(); });
  await page.keyboard.type("!"); release(); await responded;
  await expect(page.getByRole("status")).toHaveText("Unsaved changes"); expect(patches).toBe(1);
  const id = page.url().match(/\d+$/)![0];
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).body, `study.draft.note.${id}`)).toBe("Area is $a^2$ and more!");
  await page.keyboard.press("Control+s");
  await expect(page.getByRole("status")).toHaveText("Saved"); await expect(editor).toBeFocused(); expect(patches).toBe(2); expect(noteGets).toBe(0);
  const first = page.url(); expect((await request.delete(`/api/notes/${id}`)).status()).toBe(204);
  await page.keyboard.type("?"); await page.keyboard.press("Control+s");
  await expect(page.getByRole("alert")).toHaveText("This note was deleted elsewhere — Save will create it again.");
  await expect(editor).toHaveValue("Area is $a^2$ and more!?"); expect(patches).toBe(3);
  await save.click(); await expect(page).not.toHaveURL(first); await expect(page).toHaveURL(/\/notes\/\d+$/);
  await expect(page.getByRole("alert")).toHaveCount(0); await expect(page.getByRole("status")).toHaveText("Saved");
  expect(posts).toBe(3); await expect(editor).toHaveAttribute("data-probe", "kept"); expect(noteGets).toBe(0);
  await page.goto(`/lesson/${PKG}/${LESSON}`);
  await page.getByRole("link", { name: "Your notes on this lesson", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/notes\\?packageId=${PKG}&lessonId=${LESSON}$`));
  const row = page.getByRole("link", { name: /Area is a\^2 and more/ }); await expect(row).toBeVisible(); await row.click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.locator(".confirm").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page).toHaveURL(/\/notes$/); await expect(page.getByText("No notes yet", { exact: true })).toBeVisible(); await expect(row).toHaveCount(0);
});

test("a draft survives leaving through the nav", async ({ page }) => {
  await page.goto("/notes/new"); await page.getByLabel("Note", { exact: true }).fill("Draft that must survive");
  const nav = page.getByRole("navigation", { name: "Main" });
  await nav.getByRole("link", { name: "Library", exact: true }).click(); await expect(page.getByRole("heading", { name: "Library", level: 1 })).toBeVisible();
  await nav.getByRole("link", { name: "Notes", exact: true }).click(); await page.getByRole("link", { name: "New note", exact: true }).click();
  await expect(page).toHaveURL(/\/notes\/new$/); await expect(nav.getByRole("link", { name: "Notes", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText(/Restore unsaved text from/)).toBeVisible(); await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.getByLabel("Note", { exact: true })).toHaveValue("Draft that must survive");
  let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/notes", async (route) => {
    if (route.request().method() === "POST") await held; await route.continue();
  });
  const created = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/notes");
  await page.getByLabel("Note", { exact: true }).fill("Late draft base"); await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByLabel("Note", { exact: true }).click(); await page.keyboard.press("End"); await page.keyboard.type(" tail");
  await nav.getByRole("link", { name: "Library", exact: true }).click(); await expect(page.getByRole("heading", { name: "Library", level: 1 })).toBeVisible();
  release(); await created;
  await expect.poll(() => page.evaluate(() => localStorage.getItem("study.draft.note.new"))).toBeNull();
  await page.goto("/notes"); await page.getByRole("link", { name: /Late draft base/ }).click();
  await expect(page.getByText(/Restore unsaved text from/)).toBeVisible(); await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.getByLabel("Note", { exact: true })).toHaveValue("Late draft base tail");
  await page.getByRole("button", { name: "Delete", exact: true }).click(); await page.locator(".confirm").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page).toHaveURL(/\/notes$/); await expect(page.getByText("No notes yet", { exact: true })).toBeVisible();
});

test("explain-back saves once and edits the rating", async ({ page }) => {
  await page.goto(`/lesson/${PKG}/${LESSON}`); await page.getByRole("link", { name: "Explain it back", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/notes/explain/new\\?packageId=${PKG}&lessonId=${LESSON}$`));
  await expect(page.getByLabel("Lesson", { exact: true })).toHaveValue(`${PKG}/${LESSON}`);
  await page.getByLabel("Your explanation").fill("Testing yourself beats rereading because retrieval strengthens memory.");
  const save = page.getByRole("button", { name: "Save", exact: true });
  await expect(save).toBeDisabled(); await expect(page.getByText("Rate your confidence to save.")).toBeVisible();
  await expect(save).toHaveAccessibleDescription("Rate your confidence to save.");
  await page.getByLabel("2 · Shaky", { exact: true }).check(); await expect(save).toHaveAccessibleDescription("");
  let posts = 0; let patches = 0;
  await page.route("**/api/explanations", async (route) => {
    if (route.request().method() === "POST") { posts += 1; await new Promise((resolve) => setTimeout(resolve, 300)); } await route.continue();
  });
  await page.route("**/api/explanations/*", (route) => { if (route.request().method() === "PATCH") patches += 1; return route.continue(); });
  await save.evaluate((b: HTMLButtonElement) => { b.click(); b.click(); });
  await expect(page).toHaveURL(/\/notes\/explain\/\d+$/); await expect(page.getByRole("status")).toContainText("come back on Home"); expect(posts).toBe(1);
  await page.getByLabel("3 · Getting there", { exact: true }).check(); await save.click();
  await expect(page.getByRole("status")).toHaveText("Saved. Rated 3 · Getting there."); expect(patches).toBe(1);
  await page.goto("/notes?tab=explanations");
  const row = page.getByRole("link", { name: /Testing yourself beats rereading/ }); await expect(row).toBeVisible();
  await page.getByLabel("Show", { exact: true }).selectOption(`pkg:${PKG}`);
  await expect(page).toHaveURL(new RegExp(`/notes\\?tab=explanations&packageId=${PKG}$`)); await expect(row).toBeVisible();
  await page.getByLabel("Needs revisit", { exact: true }).check();
  await expect(page).toHaveURL(new RegExp(`/notes\\?tab=explanations&revisit=1&packageId=${PKG}$`)); await expect(row).toHaveCount(0);
});

test("Home shows today’s plan and clears a revisit prompt", async ({ page, request }) => {
  const due = (await (await request.get("/api/review/due")).json()).cards.length;
  expect((await request.post("/api/explanations", { data: {
    packageId: PKG, lessonId: LESSON, body: "Recall beats rereading, I think.", confidence: 2,
  } })).status()).toBe(201);
  let gets = 0;
  await page.route("**/api/review/due", (route) => {
    if (route.request().method() === "GET") gets++;
    return route.continue();
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: "Home", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Library", exact: true })).not.toHaveAttribute("aria-current", "page");
  const cards = page.getByRole("region", { name: "Cards due" });
  if (due > 0) {
    await expect(cards.locator(".home-figure")).toHaveText(String(due));
    await expect(nav.locator(".due-badge")).toContainText(String(due));
  } else await expect(cards).toContainText("Nothing due");
  const before = gets;
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect.poll(() => gets).toBeGreaterThan(before);

  const revisit = page.getByRole("region", { name: "Revisit" });
  await expect(revisit).toContainText("Active Recall");
  await revisit.getByRole("listitem").filter({ hasText: "Active Recall" }).getByRole("link", { name: "Explain again" }).click();
  await expect(page).toHaveURL(/\/notes\/explain\/new\?packageId=learning-how-to-learn&lessonId=active-recall$/);
  await expect(nav.getByRole("link", { name: "Notes", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Home", exact: true })).not.toHaveAttribute("aria-current", "page");
  await page.getByLabel("Your explanation", { exact: true }).fill("Retrieval practice strengthens memory more than rereading.");
  await page.getByLabel("4 · Solid", { exact: true }).check();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Saved. Rated 4 · Solid.");
  await nav.getByRole("link", { name: "Home", exact: true }).click();
  await expect(revisit).toContainText("anything you rate 1 or 2 comes back here");
  await expect(revisit).not.toContainText("Active Recall");
  await page.setViewportSize({ width: 640, height: 740 });
  await page.goto("/library");
  await expect(nav.getByRole("link", { name: "Notes", exact: true })).toBeAttached();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(640);
});

test("Home recounts due cards after a failed count", async ({ page, request }) => {
  const due = (await (await request.get("/api/review/due")).json()).cards.length;
  expect(due).toBeGreaterThan(0);
  let fail = true; let gets = 0; let release!: () => void; let held = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/review/due", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    gets += 1;
    if (gets > 2) await held;
    return fail ? route.fulfill({ status: 500, json: { error: { code: "internal", message: "boom" } } }) : route.continue();
  });
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });
  const cards = page.getByRole("region", { name: "Cards due" });
  const retry = cards.getByRole("button", { name: "Try again", exact: true });
  await expect(cards).toContainText("Couldn’t count your cards.");
  await expect(nav.locator(".due-badge")).toHaveCount(0);
  await expect.poll(() => gets).toBe(2);
  // A recount that fails keeps the failure, and its button is disabled only while it runs.
  // Pressing it again meanwhile sends nothing, and keyboard focus stays on it throughout.
  await retry.focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => gets).toBe(3);
  await expect(retry).toBeDisabled();
  await expect(retry).toBeFocused();
  await expect(cards).toContainText("Couldn’t count your cards.");
  await page.keyboard.press("Enter");
  release();
  await expect(retry).toBeEnabled();
  await expect(retry).toBeFocused();
  await expect(cards).toContainText("Couldn’t count your cards.");
  await expect(nav.locator(".due-badge")).toHaveCount(0);
  expect(gets).toBe(3);
  // A recount that succeeds shows the number on Home and in the nav badge.
  fail = false; held = new Promise<void>((resolve) => { release = resolve; });
  await retry.click();
  await expect.poll(() => gets).toBe(4);
  await expect(retry).toBeDisabled();
  release();
  await expect(cards.locator(".home-figure")).toHaveText(String(due));
  await expect(nav.locator(".due-badge")).toContainText(String(due));
  await expect(retry).toHaveCount(0);
  expect(gets).toBe(4);
});

test("Home dismisses a revisit prompt until a new low rating", async ({ page, request }) => {
  const explain = async (confidence: number) => expect((await request.post("/api/explanations", { data: {
    packageId: PKG, lessonId: LESSON, body: "Recall, roughly.", confidence,
  } })).status()).toBe(201);
  await explain(2);
  let dismissals = 0;
  await page.route("**/api/explanations/*/dismiss", (route) => {
    dismissals += 1;
    return dismissals === 1 ? route.fulfill({ status: 500, json: { error: { code: "internal", message: "boom" } } }) : route.continue();
  });
  await page.goto("/");
  const revisit = page.getByRole("region", { name: "Revisit" });
  const dismiss = revisit.getByRole("button", { name: "Dismiss revisit prompt for Active Recall", exact: true });
  await expect(revisit).toContainText("Active Recall");
  await revisit.evaluate((el) => el.setAttribute("data-probe", "kept"));
  // A failed dismissal says so and keeps the prompt; Dismiss stays usable and a retry sends a new request.
  await dismiss.click();
  await expect(revisit.getByRole("alert")).toHaveText("Couldn’t dismiss it (boom).");
  await expect(dismiss).toBeEnabled();
  await dismiss.click();
  await expect(revisit).not.toContainText("Active Recall");
  await expect(revisit).toContainText("anything you rate 1 or 2 comes back here");
  await expect(revisit).toHaveAttribute("data-probe", "kept");
  expect(dismissals).toBe(2);
  await page.reload();
  await expect(revisit).toContainText("anything you rate 1 or 2 comes back here");
  await expect(revisit).not.toContainText("Active Recall");
  await explain(1);
  await page.reload();
  await expect(dismiss).toBeVisible();
  await explain(4);
});

test("Home’s Try again shows a dismissed prompt that came back elsewhere", async ({ page, request }) => {
  const created = await request.post("/api/explanations", { data: { packageId: PKG, lessonId: LESSON, body: "Recall, roughly.", confidence: 2 } });
  expect(created.status()).toBe(201);
  const id = (await created.json()).explanation.id as number;
  let libraryFails = true;
  await page.route("**/api/packages", (route) => libraryFails && route.request().method() === "GET"
    ? route.fulfill({ status: 500, json: { error: { code: "internal", message: "boom" } } }) : route.continue());
  await page.goto("/");
  const plan = page.getByRole("alert").filter({ hasText: "Some of today’s plan couldn’t be loaded." });
  const revisit = page.getByRole("region", { name: "Revisit" });
  const dismiss = revisit.getByRole("button", { name: "Dismiss revisit prompt for Active Recall", exact: true });
  await expect(plan).toBeVisible();
  await dismiss.click();
  await expect(revisit).not.toContainText("Active Recall");
  // Lowering the rating elsewhere clears the dismissal, so the reloaded plan shows the prompt again.
  expect((await request.patch(`/api/explanations/${id}`, { data: { confidence: 1 } })).status()).toBe(200);
  libraryFails = false;
  await plan.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(plan).toHaveCount(0);
  await expect(dismiss).toBeVisible();
  expect((await request.post("/api/explanations", { data: { packageId: PKG, lessonId: LESSON, body: "Recall, solidly.", confidence: 4 } })).status()).toBe(201);
});

test("Home keeps a prompt dismissed while Try again is still loading", async ({ page, request }) => {
  expect((await request.post("/api/explanations", { data: { packageId: PKG, lessonId: LESSON, body: "Recall, roughly.", confidence: 2 } })).status()).toBe(201);
  let libraryGets = 0; let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/packages", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    libraryGets += 1;
    if (libraryGets === 1) return route.fulfill({ status: 500, json: { error: { code: "internal", message: "boom" } } });
    await held;
    return route.continue();
  });
  await page.goto("/");
  const plan = page.getByRole("alert").filter({ hasText: "Some of today’s plan couldn’t be loaded." });
  const revisit = page.getByRole("region", { name: "Revisit" });
  const dismiss = revisit.getByRole("button", { name: "Dismiss revisit prompt for Active Recall", exact: true });
  await expect(plan).toBeVisible(); await expect(dismiss).toBeVisible();
  // The reload's prompts are answered before the dismissal, but its library request is still held.
  const prompts = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/explanations" && new URL(r.url()).search === "?revisit=1");
  await plan.getByRole("button", { name: "Try again", exact: true }).click();
  await prompts;
  await dismiss.click();
  await expect(revisit).not.toContainText("Active Recall");
  release();
  await expect(plan).toHaveCount(0);
  await expect(revisit).not.toContainText("Active Recall");
  expect(libraryGets).toBe(2);
  expect((await request.post("/api/explanations", { data: { packageId: PKG, lessonId: LESSON, body: "Recall, solidly.", confidence: 4 } })).status()).toBe(201);
});

test("the Explain-back list keeps a prompt dismissed while Try again is still loading", async ({ page, request }) => {
  expect((await request.post("/api/explanations", { data: { packageId: PKG, lessonId: LESSON, body: "Recall, roughly.", confidence: 2 } })).status()).toBe(201);
  let noteGets = 0; let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/notes", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    noteGets += 1;
    if (noteGets === 1) return route.fulfill({ status: 500, json: { error: { code: "internal", message: "boom" } } });
    await held;
    return route.continue();
  });
  await page.goto("/notes");
  await expect(page.getByRole("alert")).toContainText("Your notes couldn’t be loaded.");
  // The reload's explanations are answered before the dismissal, but its notes request is still held.
  const explanations = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/explanations" && r.request().method() === "GET");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await explanations;
  await page.getByRole("radio", { name: "Explain-back" }).click();
  const dismiss = page.getByRole("button", { name: "Dismiss revisit prompt for Active Recall", exact: true });
  await dismiss.click();
  await expect(dismiss).toHaveCount(0);
  release();
  await page.getByRole("radio", { name: "Notes" }).click();
  await expect(page.getByRole("link", { name: "New note", exact: true })).toBeVisible();
  await page.getByRole("radio", { name: "Explain-back" }).click();
  await expect(page.getByRole("link", { name: "Explain a lesson", exact: true })).toBeVisible();
  await expect(dismiss).toHaveCount(0);
  expect(noteGets).toBe(2);
  expect((await request.post("/api/explanations", { data: { packageId: PKG, lessonId: LESSON, body: "Recall, solidly.", confidence: 4 } })).status()).toBe(201);
});

for (const where of ["Home", "the Explain-back list"] as const) {
  test(`a late dismissal answer leaves a newer low rating on ${where}`, async ({ page, request }) => {
    const created = await request.post("/api/explanations", { data: { packageId: PKG, lessonId: LESSON, body: "Recall, roughly.", confidence: 2 } });
    expect(created.status()).toBe(201);
    const id = (await created.json()).explanation.id as number;
    // The first load fails one request, so the page offers Try again.
    let failing = true;
    await page.route(where === "Home" ? "**/api/packages" : "**/api/notes", (route) => failing && route.request().method() === "GET"
      ? route.fulfill({ status: 500, json: { error: { code: "internal", message: "boom" } } }) : route.continue());
    // The server dismisses at once, but its answer is held until the rating has been lowered and reloaded.
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route("**/api/explanations/*/dismiss", async (route) => { const response = await route.fetch(); await held; await route.fulfill({ response }); });
    await page.goto(where === "Home" ? "/" : "/notes?tab=explanations");
    const scope = where === "Home" ? page.getByRole("region", { name: "Revisit" }) : page.locator(".notes-list");
    const dismiss = scope.getByRole("button", { name: "Dismiss revisit prompt for Active Recall", exact: true });
    await dismiss.click();
    await expect.poll(async () => (await (await request.get(`/api/explanations/${id}`)).json()).explanation.revisit).toBe(false);
    expect((await request.patch(`/api/explanations/${id}`, { data: { confidence: 1 } })).status()).toBe(200);
    failing = false;
    if (where === "Home") await page.getByRole("alert").filter({ hasText: "Some of today’s plan" }).getByRole("button", { name: "Try again", exact: true }).click();
    else {
      await page.getByRole("radio", { name: "Notes" }).click();
      await page.getByRole("button", { name: "Try again", exact: true }).click();
      await expect(page.getByRole("link", { name: "New note", exact: true })).toBeVisible();
      await page.getByRole("radio", { name: "Explain-back" }).click();
    }
    await expect(scope).toContainText("1 · Lost");
    const answered = page.waitForResponse((r) => /\/api\/explanations\/\d+\/dismiss$/.test(new URL(r.url()).pathname));
    release();
    await answered;
    await expect(dismiss).toBeEnabled();
    await expect(scope).toContainText("1 · Lost");
    expect((await request.post("/api/explanations", { data: { packageId: PKG, lessonId: LESSON, body: "Recall, solidly.", confidence: 4 } })).status()).toBe(201);
  });
}

test("saving a dismissed explanation promises Home only when its prompt is back", async ({ page, request }) => {
  const created = await request.post("/api/explanations", { data: { packageId: PKG, lessonId: LESSON, body: "Recall, roughly.", confidence: 2 } });
  expect(created.status()).toBe(201);
  const id = (await created.json()).explanation.id as number;
  expect((await request.post(`/api/explanations/${id}/dismiss`)).status()).toBe(200);
  await page.goto(`/notes/explain/${id}`);
  const editor = page.getByLabel("Your explanation", { exact: true });
  const save = page.getByRole("button", { name: "Save", exact: true });
  await editor.fill("Recall, reworded.");
  await save.click();
  await expect(page.getByRole("status")).toHaveText("Saved. Rated 2 · Shaky.");
  await page.getByLabel("1 · Lost", { exact: true }).check();
  await save.click();
  await expect(page.getByRole("status")).toHaveText("Saved. Rated 1 · Lost — it’ll come back on Home until you explain it with more confidence.");
  expect((await request.post("/api/explanations", { data: { packageId: PKG, lessonId: LESSON, body: "Recall, solidly.", confidence: 4 } })).status()).toBe(201);
});

test("Download all notes saves a gzip archive named for today and is hidden with no notes", async ({ page, request }) => {
  const day = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const created = await request.post("/api/notes", { data: { body: "# Export me\n\nCafé ✓ 😀", target: null } });
  expect(created.status()).toBe(201);
  const id = ((await created.json()) as { note: { id: number } }).note.id;
  try {
    await page.goto("/notes");
    const before = day();
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download all notes", exact: true }).click();
    const file = await download;
    expect([`notes-${before}.tgz`, `notes-${day()}.tgz`]).toContain(file.suggestedFilename());
    const path = await file.path();
    if (path === null) throw new Error("notes download has no local path");
    const archive = readFileSync(path);
    expect([...archive.subarray(0, 2)]).toEqual([0x1f, 0x8b]);
    expect(gunzipSync(archive).includes(`notes/${id}-export-me.md`)).toBe(true);
  } finally {
    expect((await request.delete(`/api/notes/${id}`)).status()).toBe(204);
  }
  await page.route("**/api/notes", (route) => route.request().method() === "GET" ? route.fulfill({ json: { notes: [] } }) : route.continue());
  await page.goto("/notes");
  await expect(page.getByText("No notes yet", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Download all notes" })).toHaveCount(0);
});

test("Leftover progress clears progress, spares writing, and a re-import restores it", async ({ page, request }) => {
  let zip: Buffer | null = null;
  try {
    expect((await request.post("/api/notes", { data: { body: "Leftover note survives", target: { packageId: PKG, lessonId: LESSON } } })).status()).toBe(201);
    expect((await request.post("/api/explanations", { data: { packageId: PKG, lessonId: LESSON, body: "Leftover explanation", confidence: 2 } })).status()).toBe(201);
    expect((await request.post(`/api/lessons/${PKG}/${LESSON}/progress`, { data: { status: "in-progress" } })).status()).toBe(200);
    await page.goto("/library");
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Export", exact: true }).click();
    const path = await (await download).path();
    if (path === null) throw new Error("export download has no local path");
    zip = readFileSync(path);
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page.locator(".confirm").getByRole("button", { name: "Delete", exact: true }).click();
    const panel = page.locator(".leftover");
    await expect(panel).toContainText(PKG); await expect(panel).toContainText("package deleted");
    let purges = 0;
    await page.route("**/api/maintenance/orphans/purge", (route) => {
      if (route.request().method() !== "POST") return route.continue();
      purges++;
      if (purges === 1) return route.fulfill({ status: 409, json: { error: { code: "orphans_changed", message: "x" } } });
      return route.continue();
    });
    await panel.getByRole("button", { name: "Clear…", exact: true }).click();
    await expect(panel.getByLabel(/Also delete/)).not.toBeChecked();
    await panel.getByRole("button", { name: "Delete for good", exact: true }).click();
    await expect(panel.getByRole("alert")).toHaveText("That changed while you were looking — check the new counts and confirm again.");
    await expect(panel.getByRole("button", { name: "Delete for good", exact: true })).toBeEnabled();
    await panel.getByRole("button", { name: "Delete for good", exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
    await expect(panel.getByRole("status")).toHaveText(/^Removed \d+ records?\.$/);
    await expect(panel.getByRole("alert")).toHaveCount(0);
    expect(purges).toBe(2);
    await expect(panel.locator(".leftover-counts")).toHaveText(/^\d+ notes? · \d+ explanations?$/);
    await page.locator('input[type="file"]').setInputFiles({ name: `${PKG}.zip`, mimeType: "application/zip", buffer: zip });
    await expect(page.getByRole("heading", { name: "Learning How to Learn" })).toBeVisible();
    await expect(panel).toHaveCount(0);
    await page.goto(`/notes?packageId=${PKG}&lessonId=${LESSON}`);
    await expect(page.getByRole("link", { name: /Leftover note survives/ })).toBeVisible();
  } finally {
    if (zip !== null) {
      const listed = await (await request.get("/api/packages")).json();
      if (!listed.packages.some((p: { id: string }) => p.id === PKG)) {
        expect((await request.post("/api/packages/import", { data: zip })).status()).toBe(201);
      }
    }
  }
});

test("deleting a package another tab already deleted just refreshes the Library", async ({ page, request }) => {
  const exported = await request.get(`/api/packages/${PKG}/export`);
  expect(exported.status()).toBe(200);
  const zip = await exported.body();
  try {
    expect((await request.post("/api/notes", { data: { body: "Note on a twice-deleted package", target: { packageId: PKG, lessonId: LESSON } } })).status()).toBe(201);
    await page.goto("/library");
    const sheet = page.locator("article.sheet").filter({ has: page.locator(`a[href="/api/packages/${PKG}/export"]`) });
    await sheet.getByRole("button", { name: "Delete", exact: true }).click();
    expect((await request.delete(`/api/packages/${PKG}`)).status()).toBe(204);
    await sheet.locator(".confirm").getByRole("button", { name: "Delete", exact: true }).click();
    await expect(sheet).toHaveCount(0);
    await expect(page.locator(".leftover-row").filter({ hasText: PKG })).toContainText("package deleted");
    await expect(page.getByRole("alert")).toHaveCount(0);
  } finally {
    const listed = await (await request.get("/api/packages")).json();
    if (!listed.packages.some((p: { id: string }) => p.id === PKG)) {
      expect((await request.post("/api/packages/import", { data: zip })).status()).toBe(201);
    }
  }
});

test("a note deleted while its held save is pending keeps the text for New note", async ({ page, request }) => {
  const id = (await (await request.post("/api/notes", { data: { body: "Doomed note", target: null } })).json()).note.id;
  let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route(`**/api/notes/${id}`, async (route) => {
    if (route.request().method() === "PATCH") await held; await route.continue();
  });
  await page.goto(`/notes/${id}`);
  const editor = page.getByLabel("Note", { exact: true }); await expect(editor).toHaveValue("Doomed note");
  await editor.fill("Doomed note, rescued"); await page.getByRole("button", { name: "Save", exact: true }).click();
  await editor.click(); await page.keyboard.press("End"); await page.keyboard.type(" late");
  const nav = page.getByRole("navigation", { name: "Main" });
  await nav.getByRole("link", { name: "Library", exact: true }).click(); await expect(page.getByRole("heading", { name: "Library", level: 1 })).toBeVisible();
  expect((await request.delete(`/api/notes/${id}`)).status()).toBe(204);
  const answered = page.waitForResponse((r) => r.request().method() === "PATCH");
  release(); expect((await answered).status()).toBe(404);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("study.draft.note.new") ?? "null")?.body ?? null)).toBe("Doomed note, rescued late");
  expect(await page.evaluate((key) => localStorage.getItem(key), `study.draft.note.${id}`)).toBeNull();
  await nav.getByRole("link", { name: "Notes", exact: true }).click(); await page.getByRole("link", { name: "New note", exact: true }).click();
  await expect(page.getByText(/Restore unsaved text from/)).toBeVisible(); await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(editor).toHaveValue("Doomed note, rescued late");
});

test("an explanation removed while its held save is pending keeps the text for Explain a lesson", async ({ page, request }) => {
  const id = (await (await request.post("/api/explanations", { data: { packageId: PKG, lessonId: LESSON, body: "Removed explanation", confidence: 4 } })).json()).explanation.id;
  let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route(`**/api/explanations/${id}`, async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    await held; await route.fulfill({ status: 404, json: { error: { code: "not_found", message: "unknown explanation" } } });
  });
  await page.goto(`/notes/explain/${id}`);
  const editor = page.getByLabel("Your explanation", { exact: true }); await expect(editor).toHaveValue("Removed explanation");
  await editor.fill("Removed explanation, rescued"); await page.getByRole("button", { name: "Save", exact: true }).click();
  await editor.click(); await page.keyboard.press("End"); await page.keyboard.type(" late");
  const nav = page.getByRole("navigation", { name: "Main" });
  await nav.getByRole("link", { name: "Library", exact: true }).click(); await expect(page.getByRole("heading", { name: "Library", level: 1 })).toBeVisible();
  const answered = page.waitForResponse((r) => r.request().method() === "PATCH");
  release(); expect((await answered).status()).toBe(404);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("study.draft.explanation.new") ?? "null")?.body ?? null)).toBe("Removed explanation, rescued late");
  expect(await page.evaluate((key) => localStorage.getItem(key), `study.draft.explanation.${id}`)).toBeNull();
  await page.goto(`/notes/explain/new?packageId=${PKG}&lessonId=${LESSON}`);
  await expect(page.getByText(/Restore unsaved text from/)).toBeVisible(); await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(editor).toHaveValue("Removed explanation, rescued late");
});

test("an explanation removed elsewhere loads the library so it can be saved again", async ({ page, request }) => {
  const id = (await (await request.post("/api/explanations", { data: { packageId: PKG, lessonId: LESSON, body: "Purged explanation", confidence: 4 } })).json()).explanation.id;
  await page.route(`**/api/explanations/${id}`, (route) => route.request().method() === "PATCH"
    ? route.fulfill({ status: 404, json: { error: { code: "not_found", message: "unknown explanation" } } }) : route.continue());
  let failLibrary = false;
  await page.route("**/api/packages", (route) => {
    if (route.request().method() !== "GET" || !failLibrary) return route.continue();
    failLibrary = false; return route.fulfill({ status: 500, json: { error: { code: "internal", message: "boom" } } });
  });
  await page.goto(`/notes/explain/${id}`);
  const editor = page.getByLabel("Your explanation", { exact: true }); await expect(editor).toHaveValue("Purged explanation");
  await editor.fill("Purged explanation, kept"); failLibrary = true;
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Your library couldn’t be loaded, so there’s no lesson to pick.");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  const lesson = page.getByLabel("Lesson", { exact: true });
  await expect(lesson).toHaveValue(`${PKG}/${LESSON}`);
  await expect(lesson.locator("option", { hasText: "Spaced Repetition" })).toHaveCount(1);
  await expect(lesson.locator("option", { hasText: "no longer in your library" })).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveText("This explanation was removed elsewhere — Save will create it again.");
  await expect(editor).toHaveValue("Purged explanation, kept");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).not.toHaveURL(new RegExp(`/notes/explain/${id}$`)); await expect(page).toHaveURL(/\/notes\/explain\/\d+$/);
  await expect(page.getByRole("status")).toHaveText("Saved. Rated 4 · Solid."); await expect(page.getByRole("alert")).toHaveCount(0);
});

test("a held note save never replaces a newer editor’s draft of the same note", async ({ page, request }) => {
  const id = (await (await request.post("/api/notes", { data: { body: "Shared note", target: null } })).json()).note.id;
  const key = `study.draft.note.${id}`;
  // Counts every storage call on this note's draft key, so the test can wait for the late save to settle.
  await page.addInitScript((watched) => {
    const w = window as unknown as { touches: number }; w.touches = 0;
    const proto = Storage.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
    for (const name of ["getItem", "setItem", "removeItem"]) {
      const original = proto[name]!;
      proto[name] = function (this: Storage, ...args: unknown[]) { if (args[0] === watched) w.touches += 1; return original.apply(this, args); };
    }
  }, key);
  const touches = () => page.evaluate(() => (window as unknown as { touches: number }).touches);
  const draftBody = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "null")?.body ?? null, key);
  let patches = 0; let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route(`**/api/notes/${id}`, async (route) => {
    if (route.request().method() === "PATCH" && ++patches === 1) await held; await route.continue();
  });
  await page.goto(`/notes/${id}`);
  const editor = page.getByLabel("Note", { exact: true }); await expect(editor).toHaveValue("Shared note");
  await editor.fill("Shared note, first session"); await page.getByRole("button", { name: "Save", exact: true }).click();
  await editor.click(); await page.keyboard.press("End"); await page.keyboard.type(" late");
  const nav = page.getByRole("navigation", { name: "Main" });
  await nav.getByRole("link", { name: "Notes", exact: true }).click(); await page.getByRole("link", { name: /Shared note/ }).click();
  await expect(editor).toHaveValue("Shared note"); await expect(page.getByText(/Restore unsaved text from/)).toBeVisible();
  await editor.fill("Shared note, second session"); expect(await draftBody()).toBe("Shared note, second session");
  const before = await touches();
  const answered = page.waitForResponse((r) => r.request().method() === "PATCH");
  release(); expect((await answered).status()).toBe(200);
  await expect.poll(touches).toBeGreaterThan(before);
  expect(await draftBody()).toBe("Shared note, second session");
  await nav.getByRole("link", { name: "Library", exact: true }).click(); await expect(page.getByRole("heading", { name: "Library", level: 1 })).toBeVisible();
  await nav.getByRole("link", { name: "Notes", exact: true }).click(); await page.getByRole("link", { name: /Shared note/ }).click();
  await expect(page.getByText(/Restore unsaved text from/)).toBeVisible(); await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(editor).toHaveValue("Shared note, second session");
  expect((await request.delete(`/api/notes/${id}`)).status()).toBe(204);
});

test("a held note delete never clears a newer editor’s draft of the same note", async ({ page }) => {
  const id = (await (await page.request.post("/api/notes", { data: { body: "Doomed note", target: null } })).json()).note.id;
  const key = `study.draft.note.${id}`;
  await page.addInitScript((watched) => {
    const w = window as unknown as { touches: number }; w.touches = 0;
    const proto = Storage.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
    for (const name of ["getItem", "setItem", "removeItem"]) {
      const original = proto[name]!;
      proto[name] = function (this: Storage, ...args: unknown[]) { if (args[0] === watched) w.touches += 1; return original.apply(this, args); };
    }
  }, key);
  const touches = () => page.evaluate(() => (window as unknown as { touches: number }).touches);
  const draftBody = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "null")?.body ?? null, key);
  let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route(`**/api/notes/${id}`, async (route) => {
    if (route.request().method() === "DELETE") await held; await route.continue();
  });
  await page.goto(`/notes/${id}`);
  const editor = page.getByLabel("Note", { exact: true }); await expect(editor).toHaveValue("Doomed note");
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.locator(".confirm").getByRole("button", { name: "Delete", exact: true }).click();
  const nav = page.getByRole("navigation", { name: "Main" });
  await nav.getByRole("link", { name: "Notes", exact: true }).click(); await page.getByRole("link", { name: /Doomed note/ }).click();
  await expect(editor).toHaveValue("Doomed note");
  await editor.fill("Newer writing in a second editor"); expect(await draftBody()).toBe("Newer writing in a second editor");
  const before = await touches();
  const answered = page.waitForResponse((r) => r.request().method() === "DELETE");
  release(); expect((await answered).status()).toBe(204);
  await expect.poll(touches).toBeGreaterThan(before);
  expect(await draftBody()).toBe("Newer writing in a second editor");
  await expect(editor).toHaveValue("Newer writing in a second editor");
});

test("a held note delete in a mounted editor spares another tab’s newer draft", async ({ page }) => {
  const id = (await (await page.request.post("/api/notes", { data: { body: "Shared doomed note", target: null } })).json()).note.id;
  const key = `study.draft.note.${id}`;
  const draftBody = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "null")?.body ?? null, key);
  let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route(`**/api/notes/${id}`, async (route) => {
    if (route.request().method() === "DELETE") await held; await route.continue();
  });
  await page.goto(`/notes/${id}`);
  await expect(page.getByLabel("Note", { exact: true })).toHaveValue("Shared doomed note");
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.locator(".confirm").getByRole("button", { name: "Delete", exact: true }).click();
  const other = await page.context().newPage();
  await other.goto(`/notes/${id}`);
  const otherEditor = other.getByLabel("Note", { exact: true }); await expect(otherEditor).toHaveValue("Shared doomed note");
  await otherEditor.fill("Newer tab writing"); expect(await draftBody()).toBe("Newer tab writing");
  release();
  await expect(page).toHaveURL(/\/notes$/);
  expect(await draftBody()).toBe("Newer tab writing");
  await other.close();
});

test("a note delete clears an unanswered restore offer’s draft", async ({ page }) => {
  const id = (await (await page.request.post("/api/notes", { data: { body: "Saved body", target: null } })).json()).note.id;
  const key = `study.draft.note.${id}`;
  await page.goto("/notes");
  await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ body: "Older draft", at: new Date().toISOString() })), key);
  await page.goto(`/notes/${id}`);
  await expect(page.getByText(/Restore unsaved text from/)).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.locator(".confirm").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page).toHaveURL(/\/notes$/);
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBeNull();
});

test("a held first note save never removes a newer new note’s draft", async ({ page, request }) => {
  let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/notes", async (route) => {
    if (route.request().method() === "POST") await held; await route.continue();
  });
  const created = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/notes");
  const draftBody = (k: string) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null")?.body ?? null, k);
  await page.goto("/notes/new");
  const editor = page.getByLabel("Note", { exact: true });
  await editor.fill("First new note"); await page.getByRole("button", { name: "Save", exact: true }).click();
  await editor.click(); await page.keyboard.press("End"); await page.keyboard.type(" late");
  const nav = page.getByRole("navigation", { name: "Main" });
  await nav.getByRole("link", { name: "Notes", exact: true }).click(); await page.getByRole("link", { name: "New note", exact: true }).click();
  await expect(page.getByText(/Restore unsaved text from/)).toBeVisible();
  await editor.fill("Second new note"); expect(await draftBody("study.draft.note.new")).toBe("Second new note");
  release(); const id = (await (await created).json()).note.id;
  await expect.poll(() => draftBody(`study.draft.note.${id}`)).toBe("First new note late");
  expect(await draftBody("study.draft.note.new")).toBe("Second new note");
  await nav.getByRole("link", { name: "Library", exact: true }).click(); await expect(page.getByRole("heading", { name: "Library", level: 1 })).toBeVisible();
  await nav.getByRole("link", { name: "Notes", exact: true }).click(); await page.getByRole("link", { name: "New note", exact: true }).click();
  await expect(page.getByText(/Restore unsaved text from/)).toBeVisible(); await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(editor).toHaveValue("Second new note");
  expect((await request.delete(`/api/notes/${id}`)).status()).toBe(204);
});

test("a held first explanation save never removes a newer explanation’s draft", async ({ page }) => {
  let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/explanations", async (route) => {
    if (route.request().method() === "POST") await held; await route.continue();
  });
  const created = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/explanations");
  const draftBody = (k: string) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null")?.body ?? null, k);
  await page.goto(`/notes/explain/new?packageId=${PKG}&lessonId=${LESSON}`);
  const editor = page.getByLabel("Your explanation", { exact: true });
  await editor.fill("First explanation"); await page.getByLabel("4 · Solid", { exact: true }).check();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await editor.click(); await page.keyboard.press("End"); await page.keyboard.type(" late");
  const nav = page.getByRole("navigation", { name: "Main" });
  await nav.getByRole("link", { name: "Notes", exact: true }).click(); await page.getByRole("radio", { name: "Explain-back" }).click();
  await expect(page).toHaveURL(/\/notes\?tab=explanations$/); await page.getByRole("link", { name: "Explain a lesson", exact: true }).click();
  await expect(page.getByText(/Restore unsaved text from/)).toBeVisible();
  await editor.fill("Second explanation"); expect(await draftBody("study.draft.explanation.new")).toBe("Second explanation");
  release(); const id = (await (await created).json()).explanation.id;
  await expect.poll(() => draftBody(`study.draft.explanation.${id}`)).toBe("First explanation late");
  expect(await draftBody("study.draft.explanation.new")).toBe("Second explanation");
});

test("a held note save answered 404 never clears a newer editor’s draft of the same note", async ({ page, request }) => {
  const id = (await (await request.post("/api/notes", { data: { body: "Contested note", target: null } })).json()).note.id;
  const draftBody = (k: string) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null")?.body ?? null, k);
  let patches = 0; let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route(`**/api/notes/${id}`, async (route) => {
    if (route.request().method() === "PATCH" && ++patches === 1) await held; await route.continue();
  });
  await page.goto(`/notes/${id}`);
  const editor = page.getByLabel("Note", { exact: true }); await expect(editor).toHaveValue("Contested note");
  await editor.fill("Contested note, first session"); await page.getByRole("button", { name: "Save", exact: true }).click();
  await editor.click(); await page.keyboard.press("End"); await page.keyboard.type(" late");
  const nav = page.getByRole("navigation", { name: "Main" });
  await nav.getByRole("link", { name: "Notes", exact: true }).click(); await page.getByRole("link", { name: /Contested note/ }).click();
  await expect(editor).toHaveValue("Contested note"); await editor.fill("Contested note, second session");
  expect((await request.delete(`/api/notes/${id}`)).status()).toBe(204);
  const answered = page.waitForResponse((r) => r.request().method() === "PATCH");
  release(); expect((await answered).status()).toBe(404);
  await expect.poll(() => draftBody("study.draft.note.new")).toBe("Contested note, first session late");
  expect(await draftBody(`study.draft.note.${id}`)).toBe("Contested note, second session");
});

test("a held explanation save answered 404 never clears a newer editor’s draft of the same row", async ({ page, request }) => {
  const id = (await (await request.post("/api/explanations", { data: { packageId: PKG, lessonId: LESSON, body: "Contested explanation", confidence: 4 } })).json()).explanation.id;
  const draftBody = (k: string) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null")?.body ?? null, k);
  let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route(`**/api/explanations/${id}`, async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    await held; await route.fulfill({ status: 404, json: { error: { code: "not_found", message: "unknown explanation" } } });
  });
  await page.goto(`/notes/explain/${id}`);
  const editor = page.getByLabel("Your explanation", { exact: true }); await expect(editor).toHaveValue("Contested explanation");
  await editor.fill("Contested explanation, first session"); await page.getByRole("button", { name: "Save", exact: true }).click();
  await editor.click(); await page.keyboard.press("End"); await page.keyboard.type(" late");
  const nav = page.getByRole("navigation", { name: "Main" });
  await nav.getByRole("link", { name: "Notes", exact: true }).click(); await page.getByRole("radio", { name: "Explain-back" }).click();
  await page.getByRole("link", { name: /Contested explanation/ }).click();
  await expect(editor).toHaveValue("Contested explanation"); await editor.fill("Contested explanation, second session");
  const answered = page.waitForResponse((r) => r.request().method() === "PATCH");
  release(); expect((await answered).status()).toBe(404);
  await expect.poll(() => draftBody("study.draft.explanation.new")).toBe("Contested explanation, first session late");
  expect(await draftBody(`study.draft.explanation.${id}`)).toBe("Contested explanation, second session");
});

test("explain-back keeps its editor hidden while a failed library load is retried", async ({ page }) => {
  let gets = 0; let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/packages", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    gets += 1;
    if (gets === 1) return route.fulfill({ status: 500, json: { error: { code: "internal", message: "boom" } } });
    if (gets === 2) await held;
    return route.continue();
  });
  await page.goto(`/notes/explain/new?packageId=${PKG}&lessonId=${LESSON}`);
  await expect(page.getByRole("alert")).toHaveText("Your library couldn’t be loaded, so there’s no lesson to pick.");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect.poll(() => gets).toBe(2);
  await expect(page.locator("p.loading")).toHaveText("Loading…");
  await expect(page.getByLabel("Your explanation", { exact: true })).toHaveCount(0);
  release();
  await expect(page.getByLabel("Lesson", { exact: true })).toHaveValue(`${PKG}/${LESSON}`);
  await expect(page.getByLabel("Your explanation", { exact: true })).toHaveValue("");
});

for (const kind of ["note", "explanation"] as const) {
  test(`a mounted ${kind} recovery preserves an unrelated new draft until recreation`, async ({ page, request }) => {
    const explanation = kind === "explanation";
    const api = explanation ? "explanations" : "notes";
    const base = explanation ? "/notes/explain" : "/notes";
    const data = explanation ? { body: "Original writing", packageId: PKG, lessonId: LESSON, confidence: 4 } : { body: "Original writing", target: null };
    const id = (await (await request.post(`/api/${api}`, { data })).json())[kind].id;
    await page.goto(`${base}/${id}`);
    const editor = page.getByLabel(explanation ? "Your explanation" : "Note", { exact: true });
    await expect(editor).toHaveValue("Original writing");
    await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ body: "Unrelated new writing", at: new Date().toISOString() })), `study.draft.${kind}.new`);
    const draftBody = (key: string) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "null")?.body ?? null, key);
    await page.route(`**/api/${api}/${id}`, (route) => route.request().method() === "PATCH"
      ? route.fulfill({ status: 404, json: { error: { code: "not_found", message: explanation ? "unknown explanation" : "unknown note" } } }) : route.continue());
    await editor.fill("Recovered writing"); await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveText(explanation ? "This explanation was removed elsewhere — Save will create it again." : "This note was deleted elsewhere — Save will create it again.");
    expect(await draftBody(`study.draft.${kind}.new`)).toBe("Unrelated new writing");
    await editor.fill("Recovered writing, edited again");
    expect(await draftBody(`study.draft.${kind}.${id}`)).toBe("Recovered writing, edited again");
    expect(await draftBody(`study.draft.${kind}.new`)).toBe("Unrelated new writing");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page).not.toHaveURL(new RegExp(`${base}/${id}$`));
    await expect(page).toHaveURL(new RegExp(`${base}/\\d+$`));
    expect(await draftBody(`study.draft.${kind}.${id}`)).toBeNull();
    expect(await draftBody(`study.draft.${kind}.new`)).toBe("Unrelated new writing");
  });
}

for (const kind of ["note", "explanation"] as const) {
  test(`a successful ${kind} save dismisses an old restore offer and keeps newer typing`, async ({ page, request }) => {
    const explanation = kind === "explanation";
    const api = explanation ? "explanations" : "notes";
    const data = explanation ? { body: "Saved writing", packageId: PKG, lessonId: LESSON, confidence: 4 } : { body: "Saved writing", target: null };
    const id = (await (await request.post(`/api/${api}`, { data })).json())[kind].id;
    const key = `study.draft.${kind}.${id}`;
    await page.goto("/notes");
    await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ body: "Outdated draft", at: new Date().toISOString() })), key);
    await page.goto(explanation ? `/notes/explain/${id}` : `/notes/${id}`);
    await expect(page.getByRole("button", { name: "Restore", exact: true })).toBeVisible();
    const editor = page.getByLabel(explanation ? "Your explanation" : "Note", { exact: true });
    let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route(`**/api/${api}/${id}`, async (route) => {
      if (route.request().method() === "PATCH") await held; await route.continue();
    });
    await editor.fill("Replacement text"); await page.getByRole("button", { name: "Save", exact: true }).click();
    await editor.fill("Replacement text with newer typing");
    const answered = page.waitForResponse((r) => r.request().method() === "PATCH"); release();
    expect((await answered).status()).toBe(200);
    await expect(page.getByRole("button", { name: "Restore", exact: true })).toHaveCount(0);
    await expect(editor).toHaveValue("Replacement text with newer typing");
    await expect(page.getByRole("status")).toHaveText("Unsaved changes");
    expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).body, key)).toBe("Replacement text with newer typing");
  });
}

test("Leftover progress reports a failed first load and retries the report", async ({ page }) => {
  let gets = 0;
  await page.route("**/api/maintenance/orphans", (route) => {
    gets += 1;
    return gets === 1 ? route.fulfill({ status: 500, json: { error: { code: "internal", message: "report unavailable" } } })
      : route.fulfill({ json: { packages: [{ packageId: "removed-package", packageTitle: null, inLibrary: false,
        counts: { cardState: 1, reviewLog: 0, attempts: 0, lessonProgress: 0, notes: 0, explanations: 0 } }] } });
  });
  await page.goto("/library");
  const panel = page.locator(".leftover");
  await expect(panel.getByRole("heading", { name: "Leftover progress", exact: true })).toBeVisible();
  await expect(panel.getByRole("alert")).toHaveText("Leftover progress couldn’t be loaded (report unavailable).");
  await panel.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(panel.getByText("removed-package", { exact: true })).toBeVisible();
  await expect(panel.getByRole("alert")).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Try again", exact: true })).toHaveCount(0);
  expect(gets).toBe(2);
});

for (const kind of ["note", "explanation"] as const) {
  test(`a mounted ${kind} recovery uses a free new draft slot and restores after leaving`, async ({ page, request }) => {
    const explanation = kind === "explanation";
    const api = explanation ? "explanations" : "notes";
    const base = explanation ? "/notes/explain" : "/notes";
    const data = explanation ? { body: "Original writing", packageId: PKG, lessonId: LESSON, confidence: 4 } : { body: "Original writing", target: null };
    const id = (await (await request.post(`/api/${api}`, { data })).json())[kind].id;
    const draftBody = (key: string) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "null")?.body ?? null, key);
    await page.goto(`${base}/${id}`);
    const editor = page.getByLabel(explanation ? "Your explanation" : "Note", { exact: true });
    await expect(editor).toHaveValue("Original writing");
    expect(await draftBody(`study.draft.${kind}.new`)).toBeNull();
    await page.route(`**/api/${api}/${id}`, (route) => route.request().method() === "PATCH"
      ? route.fulfill({ status: 404, json: { error: { code: "not_found", message: explanation ? "unknown explanation" : "unknown note" } } }) : route.continue());
    await editor.fill("Recovered writing"); await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveText(explanation ? "This explanation was removed elsewhere — Save will create it again." : "This note was deleted elsewhere — Save will create it again.");
    expect(await draftBody(`study.draft.${kind}.new`)).toBe("Recovered writing");
    expect(await draftBody(`study.draft.${kind}.${id}`)).toBeNull();
    await editor.fill("Recovered writing, edited again");
    expect(await draftBody(`study.draft.${kind}.new`)).toBe("Recovered writing, edited again");
    expect(await draftBody(`study.draft.${kind}.${id}`)).toBeNull();
    const nav = page.getByRole("navigation", { name: "Main" });
    await nav.getByRole("link", { name: "Notes", exact: true }).click();
    if (explanation) await page.getByRole("radio", { name: "Explain-back" }).click();
    await page.getByRole("link", { name: explanation ? "Explain a lesson" : "New note", exact: true }).click();
    await expect(page.getByText(/Restore unsaved text from/)).toBeVisible();
    await page.getByRole("button", { name: "Restore", exact: true }).click();
    await expect(editor).toHaveValue("Recovered writing, edited again");
  });
}

test("Leftover progress keeps a pending cleanup result when report retry is clicked", async ({ page }) => {
  const counts = { cardState: 1, reviewLog: 0, attempts: 0, lessonProgress: 0, notes: 0, explanations: 0 };
  let reports = 0; let purges = 0; let purged = false;
  let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/maintenance/orphans", (route) => {
    reports += 1;
    if (reports > 1 && !purged) return route.fulfill({ status: 500, json: { error: { code: "internal", message: "report unavailable" } } });
    return route.fulfill({ json: { packages: purged ? [] : [{ packageId: "removed-package", packageTitle: null, inLibrary: false, counts }] } });
  });
  await page.route("**/api/maintenance/orphans/purge", async (route) => {
    purges += 1;
    if (purges === 1) return route.fulfill({ status: 409, json: { error: { code: "orphans_changed", message: "changed" } } });
    await held; purged = true; await route.fulfill({ json: { purged: counts } });
  });
  await page.goto("/library");
  const panel = page.locator(".leftover");
  await panel.getByRole("button", { name: "Clear…", exact: true }).click();
  const cleanup = panel.getByRole("button", { name: "Delete for good", exact: true });
  await cleanup.click();
  await expect(panel.getByRole("alert")).toHaveText("Leftover progress couldn’t be loaded (report unavailable).");
  await expect(cleanup).toBeEnabled(); await cleanup.click();
  await expect.poll(() => purges).toBe(2); await expect(cleanup).toBeDisabled();
  const retry = panel.getByRole("button", { name: "Try again", exact: true });
  const retryWasDisabled = await retry.isDisabled();
  const retried = retryWasDisabled ? null : page.waitForResponse((r) => new URL(r.url()).pathname === "/api/maintenance/orphans");
  await retry.evaluate((button: HTMLButtonElement) => button.click());
  if (retried) await retried;
  release();
  await expect(panel.getByRole("status")).toHaveText("Removed 1 record.");
  await expect(panel.locator(".leftover-row")).toHaveCount(0);
  await expect(panel.getByRole("alert")).toHaveCount(0);
  expect(retryWasDisabled).toBe(true); expect(reports).toBe(3);
});

for (const kind of ["note", "explanation"] as const) {
  test(`Discard on an old ${kind} restore offer clears it but keeps newer typing`, async ({ page }) => {
    const explanation = kind === "explanation";
    const key = `study.draft.${kind}.new`;
    const draftBody = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "null")?.body ?? null, key);
    const seed = () => page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ body: "Older draft", at: new Date().toISOString() })), key);
    const editor = page.getByLabel(explanation ? "Your explanation" : "Note", { exact: true });
    const offer = page.getByText(/Restore unsaved text from/);
    const open = async () => {
      const nav = page.getByRole("navigation", { name: "Main" });
      await nav.getByRole("link", { name: "Notes", exact: true }).click();
      if (explanation) await page.getByRole("radio", { name: "Explain-back" }).click();
      await page.getByRole("link", { name: explanation ? "Explain a lesson" : "New note", exact: true }).click();
    };
    await page.goto("/notes"); await seed(); await open();
    await expect(offer).toBeVisible();
    await page.getByRole("button", { name: "Discard", exact: true }).click();
    await expect(offer).toHaveCount(0);
    expect(await draftBody()).toBeNull();
    await seed(); await open();
    await expect(offer).toBeVisible();
    await editor.fill("Newer writing");
    await page.getByRole("button", { name: "Discard", exact: true }).click();
    await expect(offer).toHaveCount(0);
    await expect(editor).toHaveValue("Newer writing");
    expect(await draftBody()).toBe("Newer writing");
    await open();
    await expect(offer).toBeVisible();
    await page.getByRole("button", { name: "Restore", exact: true }).click();
    await expect(editor).toHaveValue("Newer writing");
  });
}

for (const kind of ["note", "explanation"] as const) {
  test(`Discard or a revert in one ${kind} tab spares another tab’s newer draft`, async ({ page }) => {
    const explanation = kind === "explanation";
    const api = explanation ? "explanations" : "notes";
    const data = explanation ? { body: "Saved writing", packageId: PKG, lessonId: LESSON, confidence: 4 } : { body: "Saved writing", target: null };
    const id = (await (await page.request.post(`/api/${api}`, { data })).json())[kind].id;
    const key = `study.draft.${kind}.${id}`;
    const url = explanation ? `/notes/explain/${id}` : `/notes/${id}`;
    const label = explanation ? "Your explanation" : "Note";
    const draftBody = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "null")?.body ?? null, key);
    await page.goto("/notes");
    await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ body: "Older draft", at: new Date().toISOString() })), key);
    await page.goto(url);
    await expect(page.getByText(/Restore unsaved text from/)).toBeVisible();
    const other = await page.context().newPage();
    await other.goto(url);
    const otherEditor = other.getByLabel(label, { exact: true }); await expect(otherEditor).toHaveValue("Saved writing");
    await otherEditor.fill("Newer tab writing"); expect(await draftBody()).toBe("Newer tab writing");
    await page.getByRole("button", { name: "Discard", exact: true }).click();
    await expect(page.getByText(/Restore unsaved text from/)).toHaveCount(0);
    expect(await draftBody()).toBe("Newer tab writing");
    const editor = page.getByLabel(label, { exact: true });
    await editor.fill("This tab’s own writing");
    await otherEditor.fill("Newer tab writing, again");
    await editor.fill("Saved writing");
    expect(await draftBody()).toBe("Newer tab writing, again");
    await other.close();
  });
}

test("Leftover progress reports a held cleanup that finishes after a Library refresh", async ({ page }) => {
  const counts = { cardState: 1, reviewLog: 0, attempts: 0, lessonProgress: 0, notes: 0, explanations: 0 };
  let reports = 0; let purged = false;
  let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/maintenance/orphans", (route) => {
    reports += 1;
    return route.fulfill({ json: { packages: purged ? [] : [{ packageId: "removed-package", packageTitle: null, inLibrary: false, counts }] } });
  });
  await page.route("**/api/maintenance/orphans/purge", async (route) => { await held; purged = true; await route.fulfill({ json: { purged: counts } }); });
  // An unrelated package delete refreshes the report; it is answered here so the package stays for later tests.
  await page.route(`**/api/packages/${PKG}`, (route) => route.request().method() === "DELETE" ? route.fulfill({ status: 204 }) : route.continue());
  await page.goto("/library");
  const panel = page.locator(".leftover");
  await panel.getByRole("button", { name: "Clear…", exact: true }).click();
  await panel.getByRole("button", { name: "Delete for good", exact: true }).click();
  const sheet = page.locator("article.sheet").filter({ has: page.locator(`a[href="/api/packages/${PKG}/export"]`) });
  await sheet.getByRole("button", { name: "Delete", exact: true }).click();
  await sheet.getByRole("button", { name: "Delete", exact: true }).click();
  await expect.poll(() => reports).toBe(2);
  await expect(panel.getByText("removed-package", { exact: true })).toBeVisible();
  release();
  await expect(panel.getByRole("status")).toHaveText("Removed 1 record.");
  await expect(panel.locator(".leftover-row")).toHaveCount(0);
  await expect(panel.getByRole("alert")).toHaveCount(0);
  expect(reports).toBe(3);
});

test("the notes list searches, shows 20 at a time and starts over when the search or filter changes", async ({ page, request }) => {
  const ids: number[] = [];
  try {
    for (let i = 1; i <= 45; i++) {
      const created = await request.post("/api/notes", { data: { body: `Résumé tip ${i}`, target: i <= 3 ? { packageId: PKG, lessonId: LESSON } : null } });
      expect(created.status()).toBe(201); ids.push((await created.json()).note.id);
    }
    await page.goto("/notes");
    const search = page.getByRole("searchbox", { name: "Search notes" }); const count = page.getByRole("status");
    const rows = page.locator(".notes-list > li"); const more = page.getByRole("button", { name: "Show more", exact: true });
    const show = page.getByLabel("Show", { exact: true });
    await search.fill("RESUME");
    await expect(page).toHaveURL(/\/notes\?q=RESUME$/); await expect(search).toBeFocused();
    await expect(count).toHaveText("Showing 20 of 45 notes"); await expect(rows).toHaveCount(20);
    await more.focus(); await page.keyboard.press("Enter");
    await expect(count).toHaveText("Showing 40 of 45 notes"); await expect(rows).toHaveCount(40); await expect(more).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(count).toHaveText("45 notes"); await expect(more).toHaveCount(0); await expect(rows.nth(40).getByRole("link")).toBeFocused();
    await show.selectOption("standalone");
    await expect(page).toHaveURL(/\/notes\?q=RESUME&standalone=1$/); await expect(search).toHaveValue("RESUME");
    await expect(count).toHaveText("Showing 20 of 42 notes");
    await show.selectOption("all"); await expect(count).toHaveText("Showing 20 of 45 notes"); await show.selectOption("standalone");
    await more.click(); await expect(count).toHaveText("Showing 40 of 42 notes");
    await search.fill("RESUME TIP"); await expect(count).toHaveText("Showing 20 of 42 notes");
    await search.fill("RESUME"); await expect(count).toHaveText("Showing 20 of 42 notes");
    await search.fill(""); await search.pressSequentially("résumé tip");
    await expect(search).toHaveValue("résumé tip"); await expect(count).toHaveText("Showing 20 of 42 notes");
    await show.selectOption(`pkg:${PKG}`);
    await expect(count).toHaveText("3 notes"); await expect(more).toHaveCount(0);
    await rows.first().getByRole("link").click(); await expect(page).toHaveURL(/\/notes\/\d+$/);
    await page.goBack();
    await expect(search).toHaveValue("résumé tip"); await expect(show).toHaveValue(`pkg:${PKG}`); await expect(count).toHaveText("3 notes");
    await page.goBack(); await page.goBack();
    await expect(page).toHaveURL(/\/notes\?q=RESUME$/); await expect(search).toHaveValue("RESUME"); await expect(show).toHaveValue("all");
    await expect(count).toHaveText("Showing 20 of 45 notes");
    await search.fill("active recall TIP");
    await expect(count).toHaveText("3 notes");
    await search.fill("tip 7 nowhere");
    await expect(count).toHaveText("No notes match “tip 7 nowhere”."); await expect(rows).toHaveCount(0);
  } finally {
    for (const id of ids) await request.delete(`/api/notes/${id}`);
  }
});

const writing = (kind: "note" | "explanation") => {
  const explanation = kind === "explanation";
  const base = explanation ? "/notes/explain" : "/notes";
  return {
    api: explanation ? "explanations" : "notes", base, label: explanation ? "Your explanation" : "Note",
    data: (body: string) => explanation ? { body, packageId: PKG, lessonId: LESSON, confidence: 4 } : { body, target: null },
    fresh: explanation ? `${base}/new?packageId=${PKG}&lessonId=${LESSON}` : `${base}/new`,
    gone: explanation ? "This explanation was removed elsewhere — Save will create it again." : "This note was deleted elsewhere — Save will create it again.",
  };
};
const storedBody = (page: Page, key: string) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "null")?.body ?? null, key);
// Counts every storage call on one draft key (or, with a trailing ".", every key it starts), so a test can wait for a
// late save that changes nothing to settle.
async function watchDraft(page: Page, key: string): Promise<() => Promise<number>> {
  await page.addInitScript((watched) => {
    const w = window as unknown as { touches: number }; w.touches = 0;
    const proto = Storage.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
    const hit = (k: unknown) => typeof k === "string" && (watched.endsWith(".") ? k.startsWith(watched) : k === watched);
    for (const name of ["getItem", "setItem", "removeItem"]) {
      const original = proto[name]!;
      proto[name] = function (this: Storage, ...args: unknown[]) { if (hit(args[0])) w.touches += 1; return original.apply(this, args); };
    }
  }, key);
  return () => page.evaluate(() => (window as unknown as { touches: number }).touches);
}

// Lets a test make this page's draft writes fail, as a full storage quota would, and counts every draft storage call.
async function fillableDrafts(page: Page): Promise<{ touches: () => Promise<number>; full: (on: boolean) => Promise<void> }> {
  await page.addInitScript(() => {
    const win = window as unknown as { draftsFull: boolean; touches: number }; win.draftsFull = false; win.touches = 0;
    const proto = Storage.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
    for (const name of ["getItem", "setItem", "removeItem"]) {
      const original = proto[name]!;
      proto[name] = function (this: Storage, ...args: unknown[]) {
        if (typeof args[0] === "string" && args[0].startsWith("study.draft.")) {
          win.touches += 1;
          if (name === "setItem" && win.draftsFull) throw new DOMException("full", "QuotaExceededError");
        }
        return original.apply(this, args);
      };
    }
  });
  return {
    touches: () => page.evaluate(() => (window as unknown as { touches: number }).touches),
    full: (on) => page.evaluate((value) => { (window as unknown as { draftsFull: boolean }).draftsFull = value; }, on),
  };
}

for (const kind of ["note", "explanation"] as const) {
  test(`a deleted ${kind}’s unsaved text waits under Kept drafts while another new draft holds the slot`, async ({ page, request }) => {
    const w = writing(kind);
    const create = async (body: string): Promise<number> => (await (await request.post(`/api/${w.api}`, { data: w.data(body) })).json())[kind].id;
    const first = await create("First kept writing"); const second = await create("Second kept writing");
    // Notes are deleted for real. Explanations have no delete, so every request for a removed one answers 404.
    const removed = new Set<number>();
    const remove = async (id: number) => { if (kind === "note") expect((await request.delete(`/api/notes/${id}`)).status()).toBe(204); else removed.add(id); };
    let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
    await page.context().route(`**/api/${w.api}/*`, async (route) => {
      const id = Number(new URL(route.request().url()).pathname.split("/").pop());
      if (route.request().method() === "PATCH" && id === first) await held;
      if (removed.has(id)) return route.fulfill({ status: 404, json: { error: { code: "not_found", message: `unknown ${kind}` } } });
      return route.continue();
    });
    const fresh = `study.draft.${kind}.new`;
    const other = await page.context().newPage();
    await other.goto(w.fresh); await other.getByLabel(w.label, { exact: true }).fill("Unrelated new writing");
    expect(await storedBody(other, fresh)).toBe("Unrelated new writing");

    const editor = page.getByLabel(w.label, { exact: true });
    const save = page.getByRole("button", { name: "Save", exact: true });
    const nav = page.getByRole("navigation", { name: "Main" });
    await page.goto(`${w.base}/${first}`); await expect(editor).toHaveValue("First kept writing");
    await editor.fill("First kept writing, edited"); await save.click();
    await editor.click(); await page.keyboard.press("End"); await page.keyboard.type(" late");
    await nav.getByRole("link", { name: "Library", exact: true }).click(); await expect(page.getByRole("heading", { name: "Library", level: 1 })).toBeVisible();
    await remove(first);
    const answered = page.waitForResponse((r) => r.request().method() === "PATCH");
    release(); expect((await answered).status()).toBe(404);

    await page.goto(`${w.base}/${second}`); await expect(editor).toHaveValue("Second kept writing");
    await remove(second);
    await editor.fill("Second kept writing, edited"); await save.click();
    await expect(page.getByRole("alert")).toHaveText(w.gone);
    await nav.getByRole("link", { name: "Notes", exact: true }).click();
    if (kind === "explanation") await page.getByRole("radio", { name: "Explain-back" }).click();
    const kept = page.getByRole("region", { name: "Kept drafts" });
    await expect(kept.locator(".kept-row")).toHaveCount(2);
    await expect(kept.locator(".kept-row").first()).toContainText("Second kept writing, edited");
    await expect(kept.locator(".kept-row").last()).toContainText("First kept writing, edited late");
    expect(await storedBody(page, fresh)).toBe("Unrelated new writing");

    await kept.locator(".kept-row").filter({ hasText: "First kept writing" }).getByRole("button", { name: "Restore", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${w.base}/new$`));
    await expect(editor).toHaveValue("First kept writing, edited late");
    await expect(page.getByText(/Restore unsaved text from/)).toHaveCount(0);
    await editor.click(); await page.keyboard.press("End"); await page.keyboard.type(", restored");
    expect(await storedBody(page, `study.draft.${kind}.${first}`)).toBe("First kept writing, edited late, restored");
    expect(await storedBody(page, fresh)).toBe("Unrelated new writing");
    if (kind === "explanation") {
      await page.getByLabel("Lesson", { exact: true }).selectOption(`${PKG}/${LESSON}`); await page.getByLabel("4 · Solid", { exact: true }).check();
    }
    await save.click();
    await expect(page).toHaveURL(new RegExp(`${w.base}/\\d+$`));
    await expect(page.getByRole("status")).toHaveText(kind === "explanation" ? "Saved. Rated 4 · Solid." : "Saved");
    expect(await storedBody(page, `study.draft.${kind}.${first}`)).toBeNull();
    expect(await storedBody(page, fresh)).toBe("Unrelated new writing");

    await nav.getByRole("link", { name: "Notes", exact: true }).click();
    if (kind === "explanation") await page.getByRole("radio", { name: "Explain-back" }).click();
    await expect(kept.locator(".kept-row")).toHaveCount(1);
    await kept.getByRole("button", { name: "Discard", exact: true }).click();
    await expect(kept).toHaveCount(0);
    expect(await storedBody(page, `study.draft.${kind}.${second}`)).toBeNull();
    await page.reload(); await expect(page.locator(".notes-list")).toBeVisible(); await expect(kept).toHaveCount(0);
    expect(await storedBody(page, fresh)).toBe("Unrelated new writing");
    await other.close();
  });
}

for (const kind of ["note", "explanation"] as const) {
  test(`a late ${kind} save never brings back text another tab discarded`, async ({ page, request }) => {
    const w = writing(kind);
    const id = (await (await request.post(`/api/${w.api}`, { data: w.data("Saved writing") })).json())[kind].id;
    const key = `study.draft.${kind}.${id}`;
    const touches = await watchDraft(page, key);
    let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route(`**/api/${w.api}/${id}`, async (route) => {
      if (route.request().method() === "PATCH") await held; await route.continue();
    });
    await page.goto(`${w.base}/${id}`);
    const editor = page.getByLabel(w.label, { exact: true }); await expect(editor).toHaveValue("Saved writing");
    await editor.fill("Saved writing, changed"); await page.getByRole("button", { name: "Save", exact: true }).click();
    await editor.click(); await page.keyboard.press("End"); await page.keyboard.type(" then discarded");
    const nav = page.getByRole("navigation", { name: "Main" });
    await nav.getByRole("link", { name: "Library", exact: true }).click(); await expect(page.getByRole("heading", { name: "Library", level: 1 })).toBeVisible();
    const other = await page.context().newPage();
    await other.goto(`${w.base}/${id}`);
    await expect(other.getByLabel(w.label, { exact: true })).toHaveValue("Saved writing");
    await expect(other.getByText(/Restore unsaved text from/)).toBeVisible();
    await other.getByRole("button", { name: "Discard", exact: true }).click();
    await expect(other.getByText(/Restore unsaved text from/)).toHaveCount(0);
    expect(await storedBody(other, key)).toBeNull();
    const before = await touches();
    const answered = page.waitForResponse((r) => r.request().method() === "PATCH");
    release(); expect((await answered).status()).toBe(200);
    await expect.poll(touches).toBeGreaterThan(before);
    expect(await storedBody(page, key)).toBeNull();
    await other.reload();
    await expect(other.getByLabel(w.label, { exact: true })).toHaveValue("Saved writing, changed");
    await expect(other.getByText(/Restore unsaved text from/)).toHaveCount(0);
    await other.close();
  });

  test(`a late first ${kind} save never brings back text another tab discarded`, async ({ page }) => {
    const w = writing(kind);
    const fresh = `study.draft.${kind}.new`;
    const touches = await watchDraft(page, "study.draft.");
    let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route(`**/api/${w.api}`, async (route) => {
      if (route.request().method() === "POST") await held; await route.continue();
    });
    const created = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === `/api/${w.api}`);
    await page.goto(w.fresh);
    const editor = page.getByLabel(w.label, { exact: true });
    await editor.fill("First writing");
    if (kind === "explanation") await page.getByLabel("4 · Solid", { exact: true }).check();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await editor.click(); await page.keyboard.press("End"); await page.keyboard.type(" then discarded");
    const nav = page.getByRole("navigation", { name: "Main" });
    await nav.getByRole("link", { name: "Library", exact: true }).click(); await expect(page.getByRole("heading", { name: "Library", level: 1 })).toBeVisible();
    const other = await page.context().newPage();
    await other.goto(w.fresh);
    await expect(other.getByText(/Restore unsaved text from/)).toBeVisible();
    await other.getByRole("button", { name: "Discard", exact: true }).click();
    await expect(other.getByText(/Restore unsaved text from/)).toHaveCount(0);
    expect(await storedBody(other, fresh)).toBeNull();
    const before = await touches();
    release(); const id = (await (await created).json())[kind].id;
    await expect.poll(touches).toBeGreaterThan(before);
    expect(await storedBody(page, `study.draft.${kind}.${id}`)).toBeNull();
    expect(await storedBody(page, fresh)).toBeNull();
    await other.goto(`${w.base}/${id}`);
    await expect(other.getByLabel(w.label, { exact: true })).toHaveValue("First writing");
    await expect(other.getByText(/Restore unsaved text from/)).toHaveCount(0);
    await other.close();
  });
}

for (const kind of ["note", "explanation"] as const) {
  test(`a late ${kind} save after a revert never brings back the same text discarded in another tab`, async ({ page, request }) => {
    const w = writing(kind);
    const id = (await (await request.post(`/api/${w.api}`, { data: w.data("Original") })).json())[kind].id;
    const key = `study.draft.${kind}.${id}`;
    const touches = await watchDraft(page, key);
    let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
    // The server saves the change at once; only its answer to this editor is held.
    await page.route(`**/api/${w.api}/${id}`, async (route) => {
      if (route.request().method() !== "PATCH") return route.continue();
      const response = await route.fetch(); await held; await route.fulfill({ response });
    });
    await page.goto(`${w.base}/${id}`);
    const editor = page.getByLabel(w.label, { exact: true }); await expect(editor).toHaveValue("Original");
    await editor.fill("Changed"); await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(async () => (await (await request.get(`/api/${w.api}/${id}`)).json())[kind].body).toBe("Changed");
    await editor.fill("Original"); expect(await storedBody(page, key)).toBeNull();
    const nav = page.getByRole("navigation", { name: "Main" });
    await nav.getByRole("link", { name: "Library", exact: true }).click(); await expect(page.getByRole("heading", { name: "Library", level: 1 })).toBeVisible();
    const other = await page.context().newPage();
    const otherEditor = other.getByLabel(w.label, { exact: true });
    await other.goto(`${w.base}/${id}`); await expect(otherEditor).toHaveValue("Changed");
    await otherEditor.fill("Original"); expect(await storedBody(other, key)).toBe("Original");
    await other.goto(`${w.base}/${id}`); await expect(other.getByText(/Restore unsaved text from/)).toBeVisible();
    await other.getByRole("button", { name: "Discard", exact: true }).click(); expect(await storedBody(other, key)).toBeNull();
    const before = await touches();
    const answered = page.waitForResponse((r) => r.request().method() === "PATCH");
    release(); expect((await answered).status()).toBe(200);
    await expect.poll(touches).toBeGreaterThan(before);
    expect(await storedBody(page, key)).toBeNull();
    await other.reload(); await expect(otherEditor).toHaveValue("Changed");
    await expect(other.getByText(/Restore unsaved text from/)).toHaveCount(0);
    await other.close();
  });
}

test("Kept drafts are checked again when Notes retries and when another tab keeps a draft", async ({ page, request }) => {
  const deleted = async (body: string): Promise<number> => {
    const id = (await (await request.post("/api/notes", { data: { body, target: null } })).json()).note.id;
    expect((await request.delete(`/api/notes/${id}`)).status()).toBe(204); return id;
  };
  const keep = (p: Page, id: number, body: string) => p.evaluate(([k, b]) => localStorage.setItem(k!, JSON.stringify({ body: b, at: new Date().toISOString() })), [`study.draft.note.${id}`, body]);
  const first = await deleted("First gone note"); const second = await deleted("Second gone note");
  await page.goto("/library"); await keep(page, first, "Kept through a failed check");
  let failing = true;
  const fail = (route: Route) => failing && route.request().method() === "GET"
    ? route.fulfill({ status: 500, json: { error: { code: "internal", message: "offline" } } }) : route.continue();
  await page.route("**/api/notes", fail); await page.route(`**/api/notes/${first}`, fail);
  await page.goto("/notes");
  const kept = page.getByRole("region", { name: "Kept drafts" });
  await expect(kept.getByRole("alert")).toHaveText("Some drafts couldn’t be checked (offline).");
  await expect(kept.locator(".kept-row").filter({ hasText: "Kept through a failed check" })).toHaveCount(0);
  failing = false; await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(kept.locator(".kept-row").filter({ hasText: "Kept through a failed check" })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  const other = await page.context().newPage(); await other.goto("/library");
  await keep(other, second, "Kept in another tab");
  await expect(kept.locator(".kept-row").filter({ hasText: "Kept in another tab" })).toBeVisible();
  await other.close();
});

test("Kept drafts lists text that a late save keeps after Notes opened", async ({ page, request }) => {
  const id = (await (await request.post("/api/notes", { data: { body: "Late gone note", target: null } })).json()).note.id;
  let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route(`**/api/notes/${id}`, async (route) => {
    if (route.request().method() === "PATCH") await held; await route.continue();
  });
  await page.goto("/library");
  await page.evaluate(() => localStorage.setItem("study.draft.note.new", JSON.stringify({ body: "Unrelated new writing", at: new Date().toISOString() })));
  await page.goto(`/notes/${id}`);
  const editor = page.getByLabel("Note", { exact: true }); await expect(editor).toHaveValue("Late gone note");
  await editor.fill("Late gone note, edited"); await page.getByRole("button", { name: "Save", exact: true }).click();
  const checked = page.waitForResponse((r) => r.request().method() === "GET" && new URL(r.url()).pathname === `/api/notes/${id}`);
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Notes", exact: true }).click();
  expect((await checked).status()).toBe(200);
  const kept = page.getByRole("region", { name: "Kept drafts" }); await expect(kept).toHaveCount(0);
  expect((await request.delete(`/api/notes/${id}`)).status()).toBe(204);
  const answered = page.waitForResponse((r) => r.request().method() === "PATCH");
  release(); expect((await answered).status()).toBe(404);
  await expect(kept.locator(".kept-row").filter({ hasText: "Late gone note, edited" })).toBeVisible();
  expect(await storedBody(page, "study.draft.note.new")).toBe("Unrelated new writing");
});

test("a Kept drafts check that finishes after a Discard keeps the draft gone", async ({ page, request }) => {
  const id = (await (await request.post("/api/notes", { data: { body: "Checked late", target: null } })).json()).note.id;
  expect((await request.delete(`/api/notes/${id}`)).status()).toBe(204);
  const key = `study.draft.note.${id}`;
  const touches = await watchDraft(page, key);
  await page.goto("/library");
  await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ body: "Discarded during a check", at: new Date().toISOString() })), key);
  let gets = 0; let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route(`**/api/notes/${id}`, async (route) => {
    if (route.request().method() === "GET" && ++gets === 2) await held; await route.continue();
  });
  await page.goto("/notes");
  const kept = page.getByRole("region", { name: "Kept drafts" });
  await expect(kept.locator(".kept-row").filter({ hasText: "Discarded during a check" })).toBeVisible();
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect.poll(() => gets).toBe(2);
  await kept.getByRole("button", { name: "Discard", exact: true }).click(); await expect(kept).toHaveCount(0);
  expect(await storedBody(page, key)).toBeNull();
  const before = await touches();
  const answered = page.waitForResponse((r) => r.request().method() === "GET" && new URL(r.url()).pathname === `/api/notes/${id}`);
  release(); expect((await answered).status()).toBe(404);
  await expect.poll(touches).toBeGreaterThan(before);
  await expect(kept).toHaveCount(0);
});

test("Kept drafts lists text that another tab keeps under a deleted note while Notes stays open", async ({ page, request }) => {
  const id = (await (await request.post("/api/notes", { data: { body: "Shared gone note", target: null } })).json()).note.id;
  const other = await page.context().newPage();
  let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
  await other.route(`**/api/notes/${id}`, async (route) => {
    if (route.request().method() === "PATCH") await held; await route.continue();
  });
  await other.goto("/library");
  await other.evaluate(() => localStorage.setItem("study.draft.note.new", JSON.stringify({ body: "Unrelated new writing", at: new Date().toISOString() })));
  await other.goto(`/notes/${id}`);
  const editor = other.getByLabel("Note", { exact: true }); await expect(editor).toHaveValue("Shared gone note");
  await editor.fill("Shared gone note, edited"); await other.getByRole("button", { name: "Save", exact: true }).click();
  const checked = page.waitForResponse((r) => r.request().method() === "GET" && new URL(r.url()).pathname === `/api/notes/${id}`);
  await page.goto("/notes"); expect((await checked).status()).toBe(200);
  const kept = page.getByRole("region", { name: "Kept drafts" }); await expect(kept).toHaveCount(0);
  expect((await request.delete(`/api/notes/${id}`)).status()).toBe(204);
  const answered = other.waitForResponse((r) => r.request().method() === "PATCH");
  release(); expect((await answered).status()).toBe(404);
  await expect(other.getByRole("alert")).toHaveText("This note was deleted elsewhere — Save will create it again.");
  await expect(kept.locator(".kept-row").filter({ hasText: "Shared gone note, edited" })).toBeVisible();
  await other.close();
});

test("a late note save after a revert never brings back the same text deleted with the note in another tab", async ({ page, request }) => {
  const id = (await (await request.post("/api/notes", { data: { body: "Original", target: null } })).json()).note.id;
  const key = `study.draft.note.${id}`;
  const touches = await watchDraft(page, key);
  let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route(`**/api/notes/${id}`, async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    const response = await route.fetch(); await held; await route.fulfill({ response });
  });
  await page.goto(`/notes/${id}`);
  const editor = page.getByLabel("Note", { exact: true }); await expect(editor).toHaveValue("Original");
  await editor.fill("Changed"); await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(async () => (await (await request.get(`/api/notes/${id}`)).json()).note.body).toBe("Changed");
  await editor.fill("Original"); expect(await storedBody(page, key)).toBeNull();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Library", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Library", level: 1 })).toBeVisible();
  const other = await page.context().newPage();
  const otherEditor = other.getByLabel("Note", { exact: true });
  await other.goto(`/notes/${id}`); await expect(otherEditor).toHaveValue("Changed");
  await otherEditor.fill("Original"); expect(await storedBody(other, key)).toBe("Original");
  await other.getByRole("button", { name: "Delete", exact: true }).click();
  await other.locator(".confirm").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(other).toHaveURL(/\/notes$/); expect(await storedBody(other, key)).toBeNull();
  const before = await touches();
  const answered = page.waitForResponse((r) => r.request().method() === "PATCH");
  release(); expect((await answered).status()).toBe(200);
  await expect.poll(touches).toBeGreaterThan(before);
  expect(await storedBody(page, key)).toBeNull();
  await other.reload(); await expect(other.getByRole("region", { name: "Kept drafts" })).toHaveCount(0);
  await other.close();
});

test("a late note save keeps newer text that another tab restored and saved before the late save overwrote it", async ({ page, request }) => {
  const id = (await (await request.post("/api/notes", { data: { body: "Saved", target: null } })).json()).note.id;
  const key = `study.draft.note.${id}`;
  const touches = await watchDraft(page, key);
  let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
  // This editor's save reaches the server only after the other tab's save.
  await page.route(`**/api/notes/${id}`, async (route) => {
    if (route.request().method() === "PATCH") await held; await route.continue();
  });
  await page.goto(`/notes/${id}`);
  const editor = page.getByLabel("Note", { exact: true }); await expect(editor).toHaveValue("Saved");
  await editor.fill("Sent text"); await page.getByRole("button", { name: "Save", exact: true }).click();
  await editor.click(); await page.keyboard.press("End"); await page.keyboard.type(" and newer text");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Library", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Library", level: 1 })).toBeVisible();
  const other = await page.context().newPage();
  const otherEditor = other.getByLabel("Note", { exact: true });
  await other.goto(`/notes/${id}`); await expect(otherEditor).toHaveValue("Saved");
  await other.getByRole("button", { name: "Restore", exact: true }).click(); await expect(otherEditor).toHaveValue("Sent text and newer text");
  await other.getByRole("button", { name: "Save", exact: true }).click(); await expect(other.getByRole("status")).toHaveText("Saved");
  expect(await storedBody(other, key)).toBeNull();
  const before = await touches();
  const answered = page.waitForResponse((r) => r.request().method() === "PATCH");
  release(); expect((await answered).status()).toBe(200);
  await expect.poll(touches).toBeGreaterThan(before);
  expect((await (await request.get(`/api/notes/${id}`)).json()).note.body).toBe("Sent text");
  expect(await storedBody(page, key)).toBe("Sent text and newer text");
  await other.reload(); await expect(otherEditor).toHaveValue("Sent text");
  await other.getByRole("button", { name: "Restore", exact: true }).click(); await expect(otherEditor).toHaveValue("Sent text and newer text");
  await other.close();
});

test("a late 404 never brings back text another tab moved to the new-note draft and discarded there", async ({ page, request }) => {
  const id = (await (await request.post("/api/notes", { data: { body: "Moved note", target: null } })).json()).note.id;
  const fresh = "study.draft.note.new";
  const touches = await watchDraft(page, fresh);
  let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route(`**/api/notes/${id}`, async (route) => {
    if (route.request().method() === "PATCH") await held; await route.continue();
  });
  await page.goto(`/notes/${id}`);
  const editor = page.getByLabel("Note", { exact: true }); await expect(editor).toHaveValue("Moved note");
  await editor.fill("Moved note, edited"); await page.getByRole("button", { name: "Save", exact: true }).click();
  await editor.click(); await page.keyboard.press("End"); await page.keyboard.type(" late");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Library", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Library", level: 1 })).toBeVisible();
  const other = await page.context().newPage();
  const otherEditor = other.getByLabel("Note", { exact: true });
  await other.goto(`/notes/${id}`); await other.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(otherEditor).toHaveValue("Moved note, edited late");
  expect((await request.delete(`/api/notes/${id}`)).status()).toBe(204);
  await other.getByRole("button", { name: "Save", exact: true }).click();
  await expect(other.getByRole("alert")).toHaveText("This note was deleted elsewhere — Save will create it again.");
  expect(await storedBody(other, fresh)).toBe("Moved note, edited late");
  await other.goto("/notes/new"); await other.getByRole("button", { name: "Discard", exact: true }).click();
  expect(await storedBody(other, fresh)).toBeNull();
  const before = await touches();
  const answered = page.waitForResponse((r) => r.request().method() === "PATCH");
  release(); expect((await answered).status()).toBe(404);
  await expect.poll(touches).toBeGreaterThan(before);
  expect(await storedBody(page, fresh)).toBeNull(); expect(await storedBody(page, `study.draft.note.${id}`)).toBeNull();
  await other.close();
});

test("a late first save keeps the stored draft when its newer text can’t be stored", async ({ page }) => {
  const fresh = "study.draft.note.new";
  const { touches, full } = await fillableDrafts(page);
  let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/notes", async (route) => {
    if (route.request().method() === "POST") await held; await route.continue();
  });
  const created = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/notes");
  await page.goto("/notes/new");
  const editor = page.getByLabel("Note", { exact: true });
  await editor.fill("First"); await page.getByRole("button", { name: "Save", exact: true }).click();
  await editor.click(); await page.keyboard.press("End"); await page.keyboard.type(" stored");
  expect(await storedBody(page, fresh)).toBe("First stored");
  await full(true);
  await page.keyboard.type(" unstored");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Library", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Library", level: 1 })).toBeVisible();
  const before = await touches();
  release(); const id = (await (await created).json()).note.id;
  await expect.poll(touches).toBeGreaterThan(before + 1);
  expect(await storedBody(page, `study.draft.note.${id}`)).toBeNull();
  expect(await storedBody(page, fresh)).toBe("First stored");
});

for (const kind of ["note", "explanation"] as const) {
  test(`a late ${kind} 404 never brings back text discarded from the new draft after other text took the slot`, async ({ page, request }) => {
    const w = writing(kind);
    const id = (await (await request.post(`/api/${w.api}`, { data: w.data("Moved writing") })).json())[kind].id;
    const fresh = `study.draft.${kind}.new`; const key = `study.draft.${kind}.${id}`;
    const touches = await watchDraft(page, fresh);
    // Notes are deleted for real. Explanations have no delete, so every request for the removed one answers 404.
    let removed = false;
    await page.context().route(`**/api/${w.api}/${id}`, (route) => removed
      ? route.fulfill({ status: 404, json: { error: { code: "not_found", message: `unknown ${kind}` } } }) : route.continue());
    let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route(`**/api/${w.api}/${id}`, async (route) => {
      if (route.request().method() === "PATCH") await held; await route.fallback();
    });
    await page.goto(`${w.base}/${id}`);
    const editor = page.getByLabel(w.label, { exact: true }); await expect(editor).toHaveValue("Moved writing");
    await editor.fill("Moved writing, edited"); await page.getByRole("button", { name: "Save", exact: true }).click();
    await editor.click(); await page.keyboard.press("End"); await page.keyboard.type(" late");
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Library", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Library", level: 1 })).toBeVisible();
    const other = await page.context().newPage();
    const otherEditor = other.getByLabel(w.label, { exact: true });
    await other.goto(`${w.base}/${id}`); await other.getByRole("button", { name: "Restore", exact: true }).click();
    await expect(otherEditor).toHaveValue("Moved writing, edited late");
    if (kind === "note") expect((await request.delete(`/api/notes/${id}`)).status()).toBe(204); else removed = true;
    await other.getByRole("button", { name: "Save", exact: true }).click();
    await expect(other.getByRole("alert")).toHaveText(w.gone);
    expect(await storedBody(other, fresh)).toBe("Moved writing, edited late"); expect(await storedBody(other, key)).toBeNull();
    await other.goto(w.fresh); await other.getByRole("button", { name: "Discard", exact: true }).click();
    await otherEditor.fill("Unrelated new writing"); expect(await storedBody(other, fresh)).toBe("Unrelated new writing");
    const before = await touches();
    const answered = page.waitForResponse((r) => r.request().method() === "PATCH");
    release(); expect((await answered).status()).toBe(404);
    await expect.poll(touches).toBeGreaterThan(before);
    expect(await storedBody(page, key)).toBeNull(); expect(await storedBody(page, fresh)).toBe("Unrelated new writing");
    await other.close();
  });
}

for (const kind of ["note", "explanation"] as const) {
  test(`a late successful ${kind} save never brings back text another tab moved to the new draft and discarded`, async ({ page, request }) => {
    const w = writing(kind);
    const id = (await (await request.post(`/api/${w.api}`, { data: w.data("Saved writing") })).json())[kind].id;
    const fresh = `study.draft.${kind}.new`; const key = `study.draft.${kind}.${id}`;
    const touches = await watchDraft(page, key);
    let removed = false;
    await page.context().route(`**/api/${w.api}/${id}`, (route) => removed
      ? route.fulfill({ status: 404, json: { error: { code: "not_found", message: `unknown ${kind}` } } }) : route.continue());
    let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
    // The server saves this editor's change at once; only its answer is held.
    await page.route(`**/api/${w.api}/${id}`, async (route) => {
      if (route.request().method() !== "PATCH") return route.fallback();
      const response = await route.fetch(); await held; await route.fulfill({ response });
    });
    await page.goto(`${w.base}/${id}`);
    const editor = page.getByLabel(w.label, { exact: true }); await expect(editor).toHaveValue("Saved writing");
    await editor.fill("Saved writing, changed"); await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(async () => (await (await request.get(`/api/${w.api}/${id}`)).json())[kind].body).toBe("Saved writing, changed");
    await editor.click(); await page.keyboard.press("End"); await page.keyboard.type(" late");
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Library", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Library", level: 1 })).toBeVisible();
    const other = await page.context().newPage();
    const otherEditor = other.getByLabel(w.label, { exact: true });
    await other.goto(`${w.base}/${id}`); await other.getByRole("button", { name: "Restore", exact: true }).click();
    await expect(otherEditor).toHaveValue("Saved writing, changed late");
    if (kind === "note") expect((await request.delete(`/api/notes/${id}`)).status()).toBe(204); else removed = true;
    await other.getByRole("button", { name: "Save", exact: true }).click();
    await expect(other.getByRole("alert")).toHaveText(w.gone);
    expect(await storedBody(other, fresh)).toBe("Saved writing, changed late"); expect(await storedBody(other, key)).toBeNull();
    await other.goto(w.fresh); await other.getByRole("button", { name: "Discard", exact: true }).click();
    expect(await storedBody(other, fresh)).toBeNull();
    const before = await touches();
    const answered = page.waitForResponse((r) => r.request().method() === "PATCH");
    release(); expect((await answered).status()).toBe(200);
    await expect.poll(touches).toBeGreaterThan(before);
    expect(await storedBody(page, key)).toBeNull(); expect(await storedBody(page, fresh)).toBeNull();
    await other.close();
  });
}

for (const kind of ["note", "explanation"] as const) {
  test(`a late first ${kind} save keeps its text when the same words are discarded from an unrelated kept draft`, async ({ page }) => {
    const w = writing(kind); const fresh = `study.draft.${kind}.new`;
    const touches = await watchDraft(page, fresh);
    let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route(`**/api/${w.api}`, async (route) => {
      if (route.request().method() === "POST") await held; await route.continue();
    });
    const created = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === `/api/${w.api}`);
    await page.goto(w.fresh);
    const editor = page.getByLabel(w.label, { exact: true });
    await editor.fill("Shared words");
    if (kind === "explanation") await page.getByLabel("4 · Solid", { exact: true }).check();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await editor.click(); await page.keyboard.press("End"); await page.keyboard.type(" and more");
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Library", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Library", level: 1 })).toBeVisible();
    // A different, deleted row's draft holds the same words; discarding it says nothing about this editor's text.
    const other = await page.context().newPage(); await other.goto("/library");
    await other.evaluate((k) => localStorage.setItem(k, JSON.stringify({ body: "Shared words and more", at: new Date().toISOString(), origin: "unrelated" })), `study.draft.${kind}.999999`);
    await other.goto(kind === "note" ? "/notes" : "/notes?tab=explanations");
    const kept = other.getByRole("region", { name: "Kept drafts" });
    await expect(kept.locator(".kept-row").filter({ hasText: "Shared words and more" })).toBeVisible();
    await kept.getByRole("button", { name: "Discard", exact: true }).click(); await expect(kept).toHaveCount(0);
    const before = await touches();
    release(); const id = (await (await created).json())[kind].id;
    await expect.poll(touches).toBeGreaterThan(before);
    expect(await storedBody(page, `study.draft.${kind}.${id}`)).toBe("Shared words and more");
    expect(await storedBody(page, fresh)).toBeNull();
    await other.close();
  });

  test(`a late first ${kind} save keeps its old draft when another tab already edits the new ${kind}`, async ({ page }) => {
    const w = writing(kind); const fresh = `study.draft.${kind}.new`;
    const touches = await watchDraft(page, "study.draft.");
    let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
    let noteCreated!: (id: number) => void; const createdId = new Promise<number>((resolve) => { noteCreated = resolve; });
    // The server creates the row at once; only its answer to this editor is held.
    await page.route(`**/api/${w.api}`, async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const response = await route.fetch(); noteCreated((await response.json())[kind].id); await held; await route.fulfill({ response });
    });
    await page.goto(w.fresh);
    const editor = page.getByLabel(w.label, { exact: true });
    await editor.fill("First writing");
    if (kind === "explanation") await page.getByLabel("4 · Solid", { exact: true }).check();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const id = await createdId;
    await editor.click(); await page.keyboard.press("End"); await page.keyboard.type(" and more");
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Library", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Library", level: 1 })).toBeVisible();
    const other = await page.context().newPage();
    const otherEditor = other.getByLabel(w.label, { exact: true });
    await other.goto(`${w.base}/${id}`); await expect(otherEditor).toHaveValue("First writing");
    await otherEditor.fill("Other tab writing"); expect(await storedBody(other, `study.draft.${kind}.${id}`)).toBe("Other tab writing");
    const before = await touches();
    const answered = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === `/api/${w.api}`);
    release(); expect((await answered).status()).toBe(201);
    await expect.poll(touches).toBeGreaterThan(before);
    expect(await storedBody(page, fresh)).toBe("First writing and more");
    expect(await storedBody(page, `study.draft.${kind}.${id}`)).toBe("Other tab writing");
    await other.close();
  });
}

for (const kind of ["note", "explanation"] as const) {
  test(`a late first ${kind} save keeps newer text when another tab discards the older stored revision`, async ({ page }) => {
    const w = writing(kind); const fresh = `study.draft.${kind}.new`;
    const { touches, full } = await fillableDrafts(page);
    let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route(`**/api/${w.api}`, async (route) => {
      if (route.request().method() === "POST") await held; await route.continue();
    });
    const created = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === `/api/${w.api}`);
    await page.goto(w.fresh);
    const editor = page.getByLabel(w.label, { exact: true });
    await editor.fill("Stored text");
    if (kind === "explanation") await page.getByLabel("4 · Solid", { exact: true }).check();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await full(true);
    await editor.click(); await page.keyboard.press("End"); await page.keyboard.type(" and newer text");
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Library", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Library", level: 1 })).toBeVisible();
    expect(await storedBody(page, fresh)).toBe("Stored text");
    const other = await page.context().newPage();
    await other.goto(w.fresh); await other.getByRole("button", { name: "Discard", exact: true }).click();
    expect(await storedBody(other, fresh)).toBeNull();
    await full(false);
    const before = await touches();
    release(); const id = (await (await created).json())[kind].id;
    await expect.poll(touches).toBeGreaterThan(before);
    expect(await storedBody(page, `study.draft.${kind}.${id}`)).toBe("Stored text and newer text");
    await other.close();
  });

  test(`a late first ${kind} save keeps text typed again after another tab discarded it`, async ({ page }) => {
    const w = writing(kind); const fresh = `study.draft.${kind}.new`;
    const touches = await watchDraft(page, "study.draft.");
    let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route(`**/api/${w.api}`, async (route) => {
      if (route.request().method() === "POST") await held; await route.continue();
    });
    const created = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === `/api/${w.api}`);
    await page.goto(w.fresh);
    const editor = page.getByLabel(w.label, { exact: true });
    await editor.fill("Base");
    if (kind === "explanation") await page.getByLabel("4 · Solid", { exact: true }).check();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await editor.click(); await page.keyboard.press("End"); await page.keyboard.type(" more");
    const other = await page.context().newPage();
    await other.goto(w.fresh); await other.getByRole("button", { name: "Discard", exact: true }).click();
    expect(await storedBody(other, fresh)).toBeNull();
    // Typed again on purpose after the Discard: newer than it, so it is kept.
    await editor.fill("Base"); await editor.click(); await page.keyboard.press("End"); await page.keyboard.type(" more");
    expect(await storedBody(page, fresh)).toBe("Base more");
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Library", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Library", level: 1 })).toBeVisible();
    const before = await touches();
    release(); const id = (await (await created).json())[kind].id;
    await expect.poll(touches).toBeGreaterThan(before);
    expect(await storedBody(page, `study.draft.${kind}.${id}`)).toBe("Base more");
    expect(await storedBody(page, fresh)).toBeNull();
    await other.close();
  });
}

for (const kind of ["note", "explanation"] as const) {
  test(`a mounted ${kind} recovery that can’t store its text in the new draft clears the old one once saved`, async ({ page, request }) => {
    const w = writing(kind);
    const id = (await (await request.post(`/api/${w.api}`, { data: w.data("Recovered writing") })).json())[kind].id;
    const { full } = await fillableDrafts(page);
    await page.route(`**/api/${w.api}/${id}`, (route) => route.request().method() === "PATCH"
      ? route.fulfill({ status: 404, json: { error: { code: "not_found", message: `unknown ${kind}` } } }) : route.continue());
    await page.goto(`${w.base}/${id}`);
    const editor = page.getByLabel(w.label, { exact: true }); await expect(editor).toHaveValue("Recovered writing");
    await editor.fill("Recovered writing, edited"); expect(await storedBody(page, `study.draft.${kind}.${id}`)).toBe("Recovered writing, edited");
    await full(true); await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveText(w.gone);
    expect(await storedBody(page, `study.draft.${kind}.new`)).toBeNull();
    await full(false); await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${w.base}/\\d+$`)); await expect(page).not.toHaveURL(new RegExp(`${w.base}/${id}$`));
    expect(await storedBody(page, `study.draft.${kind}.${id}`)).toBeNull();
    expect(await storedBody(page, `study.draft.${kind}.new`)).toBeNull();
  });

  test(`a first ${kind} save that can’t store newer text under the new row clears its old draft after the next save`, async ({ page }) => {
    const w = writing(kind); const fresh = `study.draft.${kind}.new`;
    const { full } = await fillableDrafts(page);
    let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route(`**/api/${w.api}`, async (route) => {
      if (route.request().method() === "POST") await held; await route.continue();
    });
    const created = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === `/api/${w.api}`);
    await page.goto(w.fresh);
    const editor = page.getByLabel(w.label, { exact: true });
    await editor.fill("First");
    if (kind === "explanation") await page.getByLabel("4 · Solid", { exact: true }).check();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await full(true); await editor.click(); await page.keyboard.press("End"); await page.keyboard.type(" more");
    release(); await created; await expect(page).toHaveURL(new RegExp(`${w.base}/\\d+$`));
    await expect(page.getByRole("status")).toHaveText("Unsaved changes");
    expect(await storedBody(page, fresh)).toBe("First");
    await full(false); await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText(kind === "explanation" ? "Saved. Rated 4 · Solid." : "Saved");
    expect(await storedBody(page, fresh)).toBeNull();
  });
}

for (const [kind, ending] of [["note", "revert"], ["explanation", "revert"], ["note", "delete"]] as const) {
  test(`a first ${kind} save that can’t store newer text under the new row clears its old draft on a ${ending}`, async ({ page }) => {
    const w = writing(kind); const fresh = `study.draft.${kind}.new`;
    const { full } = await fillableDrafts(page);
    let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route(`**/api/${w.api}`, async (route) => {
      if (route.request().method() === "POST") await held; await route.continue();
    });
    const created = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === `/api/${w.api}`);
    await page.goto(w.fresh);
    const editor = page.getByLabel(w.label, { exact: true });
    await editor.fill("First");
    if (kind === "explanation") await page.getByLabel("4 · Solid", { exact: true }).check();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await editor.click(); await page.keyboard.press("End"); await page.keyboard.type(" more");
    expect(await storedBody(page, fresh)).toBe("First more");
    await full(true); release(); await created; await expect(page).toHaveURL(new RegExp(`${w.base}/\\d+$`));
    await expect(page.getByRole("status")).toHaveText("Unsaved changes");
    expect(await storedBody(page, fresh)).toBe("First more");
    await full(false);
    if (ending === "revert") {
      await editor.fill("First");
      await expect(page.getByRole("status")).toHaveText(kind === "explanation" ? "Saved. Rated 4 · Solid." : "Saved");
    } else {
      await page.getByRole("button", { name: "Delete", exact: true }).click();
      await page.locator(".confirm").getByRole("button", { name: "Delete", exact: true }).click();
      await expect(page).toHaveURL(/\/notes$/);
    }
    expect(await storedBody(page, fresh)).toBeNull();
  });
}

test("a late first note save never brings back text discarded before many more discards", async ({ page }) => {
  const fresh = "study.draft.note.new";
  const touches = await watchDraft(page, "study.draft.");
  let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/notes", async (route) => {
    if (route.request().method() === "POST") await held; await route.continue();
  });
  const created = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/notes");
  await page.goto("/notes/new");
  const editor = page.getByLabel("Note", { exact: true });
  await editor.fill("Pending text"); await page.getByRole("button", { name: "Save", exact: true }).click();
  await editor.click(); await page.keyboard.press("End"); await page.keyboard.type(" late");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Library", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Library", level: 1 })).toBeVisible();
  const other = await page.context().newPage();
  await other.goto("/notes/new"); await other.getByRole("button", { name: "Discard", exact: true }).click();
  for (let i = 0; i < 21; i++) {
    await other.evaluate((n) => localStorage.setItem("study.draft.note.new", JSON.stringify({ body: `Filler ${n}`, at: new Date().toISOString() })), i);
    await other.goto("/notes/new"); await other.getByRole("button", { name: "Discard", exact: true }).click();
  }
  expect(await storedBody(other, fresh)).toBeNull();
  const before = await touches();
  release(); const id = (await (await created).json()).note.id;
  await expect.poll(touches).toBeGreaterThan(before);
  expect(await storedBody(page, `study.draft.note.${id}`)).toBeNull();
  await other.close();
});

for (const kind of ["note", "explanation"] as const) {
  test(`an unedited restored kept ${kind} draft is removed once a later save stores its text`, async ({ page, request }) => {
    const w = writing(kind);
    const id = (await (await request.post(`/api/${w.api}`, { data: w.data("Gone writing") })).json())[kind].id;
    if (kind === "note") expect((await request.delete(`/api/notes/${id}`)).status()).toBe(204);
    else await page.route(`**/api/explanations/${id}`, (route) => route.fulfill({ status: 404, json: { error: { code: "not_found", message: "unknown explanation" } } }));
    const key = `study.draft.${kind}.${id}`;
    const { full } = await fillableDrafts(page);
    await page.goto("/library");
    await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ body: "Kept text", at: new Date().toISOString(), origin: "old-tab" })), key);
    let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route(`**/api/${w.api}`, async (route) => {
      if (route.request().method() === "POST") await held; await route.continue();
    });
    const created = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === `/api/${w.api}`);
    await page.goto(kind === "note" ? "/notes" : "/notes?tab=explanations");
    await page.getByRole("region", { name: "Kept drafts" }).getByRole("button", { name: "Restore", exact: true }).click();
    const editor = page.getByLabel(w.label, { exact: true }); await expect(editor).toHaveValue("Kept text");
    if (kind === "explanation") {
      await page.getByLabel("Lesson", { exact: true }).selectOption(`${PKG}/${LESSON}`); await page.getByLabel("4 · Solid", { exact: true }).check();
    }
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await full(true); await editor.click(); await page.keyboard.press("End"); await page.keyboard.type(" more");
    release(); await created; await expect(page).toHaveURL(new RegExp(`${w.base}/\\d+$`));
    await expect(page.getByRole("status")).toHaveText("Unsaved changes");
    expect(await storedBody(page, key)).toBe("Kept text");
    await full(false); await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText(kind === "explanation" ? "Saved. Rated 4 · Solid." : "Saved");
    expect(await storedBody(page, key)).toBeNull();
  });
}

test("a late 404 never brings back a deleted note’s text that the deleting tab never edited", async ({ page, request }) => {
  const id = (await (await request.post("/api/notes", { data: { body: "Original", target: null } })).json()).note.id;
  const fresh = "study.draft.note.new"; const key = `study.draft.note.${id}`;
  const touches = await watchDraft(page, "study.draft.");
  let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route(`**/api/notes/${id}`, async (route) => {
    if (route.request().method() === "PATCH") await held; await route.continue();
  });
  await page.goto(`/notes/${id}`);
  const editor = page.getByLabel("Note", { exact: true }); await expect(editor).toHaveValue("Original");
  await editor.fill("Changed"); await page.getByRole("button", { name: "Save", exact: true }).click();
  await editor.fill("Original"); expect(await storedBody(page, key)).toBeNull();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Library", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Library", level: 1 })).toBeVisible();
  const other = await page.context().newPage();
  await other.goto(`/notes/${id}`); await expect(other.getByLabel("Note", { exact: true })).toHaveValue("Original");
  await other.getByRole("button", { name: "Delete", exact: true }).click();
  await other.locator(".confirm").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(other).toHaveURL(/\/notes$/);
  const before = await touches();
  const answered = page.waitForResponse((r) => r.request().method() === "PATCH");
  release(); expect((await answered).status()).toBe(404);
  await expect.poll(touches).toBeGreaterThan(before);
  expect(await storedBody(page, fresh)).toBeNull(); expect(await storedBody(page, key)).toBeNull();
  await other.close();
});

test("Discard records the discarded text before it removes the draft, on an offer and under Kept drafts", async ({ page, request }) => {
  // A save settling in another tab between the two steps then already sees the record.
  await page.addInitScript(() => {
    const w = window as unknown as { ops: string[] }; w.ops = [];
    const proto = Storage.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
    for (const name of ["setItem", "removeItem"]) {
      const original = proto[name]!;
      proto[name] = function (this: Storage, ...args: unknown[]) {
        const key = String(args[0]);
        if (key.startsWith("study.draft.discarded.")) w.ops.push("record"); else if (name === "removeItem" && key.startsWith("study.draft.")) w.ops.push(`remove ${key}`);
        return original.apply(this, args);
      };
    }
  });
  const ops = () => page.evaluate(() => { const w = window as unknown as { ops: string[] }; const list = w.ops; w.ops = []; return list; });
  await page.goto("/library");
  await page.evaluate(() => localStorage.setItem("study.draft.note.new", JSON.stringify({ body: "Offered text", at: new Date().toISOString() })));
  await page.goto("/notes/new"); await ops();
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  expect(await ops()).toEqual(["record", "remove study.draft.note.new"]);
  const id = (await (await request.post("/api/notes", { data: { body: "Gone", target: null } })).json()).note.id;
  expect((await request.delete(`/api/notes/${id}`)).status()).toBe(204);
  await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ body: "Kept text", at: new Date().toISOString() })), `study.draft.note.${id}`);
  await page.goto("/notes");
  const kept = page.getByRole("region", { name: "Kept drafts" });
  await expect(kept.locator(".kept-row").filter({ hasText: "Kept text" })).toBeVisible(); await ops();
  await kept.getByRole("button", { name: "Discard", exact: true }).click(); await expect(kept).toHaveCount(0);
  expect(await ops()).toEqual(["record", `remove study.draft.note.${id}`]);
});

for (const kind of ["note", "explanation"] as const) {
  test(`reverting a first ${kind} save drops its set-aside draft even while another tab holds the new row’s draft`, async ({ page }) => {
    const w = writing(kind); const fresh = `study.draft.${kind}.new`;
    let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
    let rowCreated!: (id: number) => void; const createdId = new Promise<number>((resolve) => { rowCreated = resolve; });
    await page.route(`**/api/${w.api}`, async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const response = await route.fetch(); rowCreated((await response.json())[kind].id); await held; await route.fulfill({ response });
    });
    await page.goto(w.fresh);
    const editor = page.getByLabel(w.label, { exact: true });
    await editor.fill("Sent");
    if (kind === "explanation") await page.getByLabel("4 · Solid", { exact: true }).check();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const id = await createdId;
    await editor.click(); await page.keyboard.press("End"); await page.keyboard.type(" tail");
    const other = await page.context().newPage();
    const otherEditor = other.getByLabel(w.label, { exact: true });
    await other.goto(`${w.base}/${id}`); await expect(otherEditor).toHaveValue("Sent");
    await otherEditor.fill("Other tab writing");
    release(); await expect(page).toHaveURL(new RegExp(`${w.base}/${id}$`));
    await expect(page.getByRole("status")).toHaveText("Unsaved changes");
    expect(await storedBody(page, fresh)).toBe("Sent tail");
    await editor.fill("Sent");
    await expect(page.getByRole("status")).toHaveText(kind === "explanation" ? "Saved. Rated 4 · Solid." : "Saved");
    expect(await storedBody(page, fresh)).toBeNull();
    expect(await storedBody(page, `study.draft.${kind}.${id}`)).toBe("Other tab writing");
    await other.close();
  });
}
