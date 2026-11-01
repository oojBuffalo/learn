import { expect, test } from "@playwright/test";

test("sample package: lesson → exercise → flashcard review", async ({ page }) => {
  // A failed first load says so and can be retried, rather than loading forever.
  await page.route("**/api/packages", (route) => route.fulfill({ status: 500, body: "{}" }), { times: 1 });
  await page.goto("/library");
  await expect(page.getByRole("alert")).toContainText("couldn’t be loaded");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Learning How to Learn" })).toBeVisible();

  await page.getByRole("link", { name: "Spaced Repetition" }).click();
  await expect(page.getByRole("heading", { name: "The forgetting curve" })).toBeVisible();

  // math renders in the body, and the TeX source survives for screen readers.
  // Assert on locators, never on text: KaTeX's hidden MathML twin duplicates the
  // visible math *and* carries the raw source, so text matchers double-match.
  await expect(page.locator(".prose .katex").first()).toBeVisible();
  await expect(page.locator(".katex-display")).toHaveCount(1);
  await expect(page.locator('.katex-display annotation[encoding="application/x-tex"]')).toContainText(
    "R = e^{-t/S}",
  );
  // and in an option label, which goes through the inline renderer
  await expect(page.locator(".opt .katex").first()).toBeVisible();

  // inline exercise: answer the embedded multiple-choice correctly
  // The first check fails; then two clicks in one tick, before React re-renders,
  // must still send just one more attempt, and its success clears the old error.
  let attempts = 0;
  await page.route("**/api/attempts", async (route) => {
    attempts += 1;
    if (attempts === 1) return route.fulfill({ status: 500, body: "{}" });
    await new Promise((r) => setTimeout(r, 300));
    await route.continue();
  });
  await page.getByLabel(/just before you would forget/i).check();
  // A failed save says so and can be retried. Marking the lesson complete
  // re-renders the page; the pick must survive it.
  let completions = 0;
  await page.route("**/api/lessons/**/progress", (route) =>
    route.request().postDataJSON().status === "completed" && ++completions === 1
      ? route.fulfill({ status: 500, body: "{}" })
      : route.continue(),
  );
  await page.getByRole("button", { name: "Mark lesson complete" }).click();
  await expect(page.locator(".finish").getByRole("alert")).toContainText("wasn’t saved");
  await page.getByRole("button", { name: "Mark lesson complete" }).click();
  await expect(page.getByRole("button", { name: "✓ Lesson completed" })).toBeVisible();
  await expect(page.locator(".finish").getByRole("alert")).toHaveCount(0);
  await expect(page.getByLabel(/just before you would forget/i)).toBeChecked();
  await page.getByRole("button", { name: "Check" }).first().click();
  await expect(page.locator(".work").first().getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "Check" }).first().evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect(page.getByText("✓ Correct")).toBeVisible();
  await expect(page.locator(".work").first().getByRole("alert")).toHaveCount(0);
  expect(attempts).toBe(2);

  // review flow
  await page.getByRole("link", { name: "Study" }).click();
  // A double grade while the first request is still out must not skip the next card.
  let grades = 0;
  await page.route("**/api/review/grade", async (route) => {
    grades += 1;
    await new Promise((r) => setTimeout(r, 300));
    await route.continue();
  });
  await page.getByRole("button", { name: "Reveal" }).click();
  await page.keyboard.press("3");
  await page.keyboard.press("3");
  await page.getByRole("button", { name: "Reveal" }).click();
  await page.getByRole("button", { name: "Good", exact: true }).click();
  await page.getByRole("button", { name: "Reveal" }).click();
  await page.getByRole("button", { name: "Good", exact: true }).click();
  await page.getByRole("button", { name: "Reveal" }).click();
  await page.getByRole("button", { name: "Good", exact: true }).click();
  await expect(page.getByText(/All caught up — 4 reviewed/)).toBeVisible();
  expect(grades).toBe(4);

  // export produces a real zip
  await page.goto("/library");
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export" }).click();
  expect((await download).suggestedFilename()).toBe("learning-how-to-learn.zip");
});

// e2e/smoke.spec.ts — test 2. Uses active-recall, never Spaced Repetition, and never completes a lesson.
test("reopening an unfinished lesson moves its last-opened time", async ({ page, request }) => {
  const PKG = "learning-how-to-learn", LESSON = "active-recall";
  const opened = async () => ((await (await request.get("/api/packages")).json()).packages
    .find((p: { id: string }) => p.id === PKG).lessons
    .find((l: { id: string }) => l.id === LESSON));
  expect((await request.post(`/api/lessons/${PKG}/${LESSON}/progress`, { data: { status: "in-progress" } })).status()).toBe(200);
  const before = (await opened()).updatedAt as string;
  expect(before).toBeTruthy();
  const write = page.waitForResponse((r) => r.url().endsWith(`/api/lessons/${PKG}/${LESSON}/progress`)
    && r.request().method() === "POST" && r.request().postDataJSON().status === "in-progress", { timeout: 5_000 });
  await page.goto(`/lesson/${PKG}/${LESSON}`);
  expect((await write).status()).toBe(200);
  const after = await opened();
  expect(after.status).toBe("in-progress");
  expect(after.updatedAt > before).toBe(true);
});
