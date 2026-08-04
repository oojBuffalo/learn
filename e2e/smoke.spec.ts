import { expect, test } from "@playwright/test";

test("sample package: lesson → exercise → flashcard review", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Learning How to Learn" })).toBeVisible();

  await page.getByRole("link", { name: "Spaced Repetition" }).click();
  await expect(page.getByRole("heading", { name: "The forgetting curve" })).toBeVisible();

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
