import { expect, test } from "@playwright/test";

test("sample package: lesson → exercise → flashcard review", async ({ page }) => {
  await page.goto("/");
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
  await page.getByLabel(/just before you would forget/i).check();
  await page.getByRole("button", { name: "Check" }).first().click();
  await expect(page.getByText("✓ Correct")).toBeVisible();

  await page.getByRole("button", { name: "Mark lesson complete" }).click();
  await expect(page.getByRole("button", { name: "✓ Lesson completed" })).toBeVisible();

  // review flow
  await page.getByRole("link", { name: "Study" }).click();
  await page.getByRole("button", { name: "Reveal" }).click();
  await page.getByRole("button", { name: "Good", exact: true }).click();
  await page.getByRole("button", { name: "Reveal" }).click();
  await page.getByRole("button", { name: "Good", exact: true }).click();
  await page.getByRole("button", { name: "Reveal" }).click();
  await page.getByRole("button", { name: "Good", exact: true }).click();
  await page.getByRole("button", { name: "Reveal" }).click();
  await page.getByRole("button", { name: "Good", exact: true }).click();
  await expect(page.getByText(/All caught up — 4 reviewed/)).toBeVisible();

  // export produces a real zip
  await page.goto("/");
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export" }).click();
  expect((await download).suggestedFilename()).toBe("learning-how-to-learn.zip");
});
