import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

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
