import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

test("ordering keeps focus on the moved step and Try again keeps the order", async ({ page }) => {
  await page.goto("/lesson/learning-how-to-learn/active-recall");
  const work = page.locator(".work", { has: page.locator(".order-row") });
  const rows = work.locator(".order-row");
  const down0 = rows.nth(0).getByRole("button").nth(1);
  const name0 = (await down0.locator("svg").getAttribute("aria-label"))!;            // Move “…” down
  await down0.click();
  await expect(page.getByRole("button", { name: name0, exact: true })).toBeFocused();
  const down2 = rows.nth(2).getByRole("button").nth(1);
  const up2 = (await down2.locator("svg").getAttribute("aria-label"))!.replace(/ down$/, " up");
  await down2.click();                                   // the step lands last, so its down button is disabled
  await expect(page.getByRole("button", { name: up2, exact: true })).toBeFocused();
  const order = await work.locator(".order-text").allTextContents();
  await work.getByRole("button", { name: "Check", exact: true }).click();   // exact: a step reads "Check and correct"
  await work.getByRole("button", { name: "Try again" }).click();
  await expect(work.locator(".order-text")).toHaveText(order);   // the draft survives the retry
});
test("a lesson short answer checks on Enter", async ({ page }) => {
  await page.goto("/lesson/learning-how-to-learn/active-recall");
  const work = page.locator(".work", { has: page.getByLabel("Your answer") });   // sa-recall, under Practice
  await work.getByLabel("Your answer").fill("recall");
  await work.getByLabel("Your answer").press("Enter");                           // ActivityView.tsx:366
  await expect(work.getByText("✓ Correct")).toBeVisible();
});

test("play entry points: failed list loads, Library count links, list filters and a phone-width nav", async ({ page }) => {
  await page.route("**/api/packages", (route) => route.fulfill({ status: 500, body: "{}" }), { times: 1 });
  await page.goto("/quizzes");
  await expect(page.getByRole("alert")).toContainText("Your quizzes couldn’t be loaded.");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Quizzes", exact: true })).toBeVisible();
  await page.goto("/");
  await page.getByRole("link", { name: "Quizzes · 1", exact: true }).click();
  await expect(page).toHaveURL(/\/quizzes\?package=learning-how-to-learn$/);
  await expect(page.getByRole("heading", { name: "Quizzes", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "All packages" }).click();
  await expect(page).toHaveURL(/\/quizzes$/);
  await page.route("**/api/packages", (route) => route.fulfill({ status: 500, body: "{}" }), { times: 1 });
  await page.getByRole("link", { name: "Games", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Your games couldn’t be loaded.");
  await page.getByRole("button", { name: "Try again" }).click();
  for (const t of ["Match the techniques", "Quick fire", "Put it in order"]) await expect(page.getByRole("link", { name: t })).toBeVisible();
  await expect(page.getByRole("link", { name: "Quick fire" })).toContainText("Timed round · 1:00 limit");
  await page.getByRole("link", { name: "Quick fire" }).click();
  await expect(page.getByRole("link", { name: "Games", exact: true })).toHaveAttribute("aria-current", "page");
  await page.setViewportSize({ width: 375, height: 740 });
  await page.goto("/");
  await expect(page.locator(".nav .nav-label").first()).toHaveCSS("clip-path", "inset(50%)");
  await expect(page.getByRole("link", { name: "Quizzes", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Games · 3", exact: true })).toBeVisible();   // the sheet foot, all four controls, is laid out
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
test("play lists: a package filter shows only that package’s quizzes and games", async ({ page }) => {
  type Row = { id: string; title: string };
  type Listed = { id: string; title: string; quizzes: Row[]; games: Row[] };
  const listed = (await (await page.request.get("/api/packages")).json()) as { packages: Listed[] };
  const sample = listed.packages.find((p) => p.id === "learning-how-to-learn")!;
  const copy = (rows: Row[]) => rows.map((row) => ({ ...row, id: `${row.id}-b`, title: `${row.title} B` }));
  const other = { ...sample, id: "other-package", title: "Other package", quizzes: copy(sample.quizzes), games: copy(sample.games) };
  // A second package gives the filter something to leave out.
  await page.route("**/api/packages", (route) => route.fulfill({ json: { packages: [sample, other] } }));
  const titles = page.locator(".lesson-row-title");
  const names = (p: Listed, list: "quizzes" | "games") => p[list].map((row) => row.title);
  for (const list of ["quizzes", "games"] as const) {
    await page.goto(`/${list}?package=other-package`);
    await expect(titles).toHaveText(names(other, list));
    await page.goto(`/${list}?package=learning-how-to-learn`);
    await expect(titles).toHaveText(names(sample, list));
    await page.getByRole("link", { name: "All packages" }).click();
    await expect(page).toHaveURL(new RegExp(`/${list}$`));
    await expect(titles).toHaveText([...names(sample, list), ...names(other, list)]);
  }
});

/** Runs logged so far for one sample quiz or game, read from the API so that other tests' runs do not matter. */
async function runs(page: Page, kind: "quiz" | "game", refId: string): Promise<number> {
  const res = await page.request.get(`/api/attempts?packageId=learning-how-to-learn&kind=${kind}&refId=${refId}&limit=200`);
  return ((await res.json()) as { attempts: unknown[] }).attempts.length;
}
/** History rows expected after `added` new runs: the Quiz and Game pages load at most 20 (`limit: 20`). */
const historyRows = (before: number, added: number) => Math.min(before + added, 20);

test("quiz: a failed submit locks the answers and one retry logs one run", async ({ page }) => {
  const before = await runs(page, "quiz", "quiz-basics");
  await page.goto("/");
  await page.getByRole("link", { name: "Quizzes · 1", exact: true }).click();
  await page.getByRole("link", { name: "Study techniques check" }).click();
  await page.getByRole("button", { name: "Start quiz" }).click();
  await page.getByLabel(/just before you would forget/i).check();
  await page.getByLabel("Blank 1").fill("Again"); await page.getByLabel("Blank 2").fill("further");
  await page.getByLabel("Your answer").fill("recall"); await page.getByLabel("Your answer").press("Enter");  // in a quiz, Enter submits nothing
  await expect(page.getByText("3 of 4 answered")).toBeVisible(); await expect(page.locator(".result")).toHaveCount(0);  // the ordering stays untouched
  let posts = 0;
  await page.route("**/api/attempts", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    if (++posts === 1) return route.fulfill({ status: 500, body: "{}" });
    await new Promise((r) => setTimeout(r, 300)); await route.continue();
  });
  await page.getByRole("button", { name: "Submit quiz" }).click();
  await expect(page.getByText("1 unanswered will score 0.")).toBeVisible();
  await page.getByRole("button", { name: "Submit anyway" }).click();
  await expect(page.getByRole("alert")).toContainText("weren’t submitted");
  await expect(page.getByLabel("Your answer")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Submit quiz" })).toHaveCount(0);   // a frozen run offers only Submit again
  await page.getByRole("button", { name: "Submit again" }).evaluate((b: HTMLButtonElement) => { b.click(); b.click(); });
  await expect(page.getByRole("heading", { name: /^75% · Passed · 3 of 4 correct/ })).toBeFocused();
  await expect(page.getByRole("alert")).toHaveCount(0); await expect(page.locator(".history li")).toHaveCount(historyRows(before, 1));
  expect(posts).toBe(2);
  await page.getByRole("button", { name: "Retake quiz" }).click();
  await expect(page.getByText("0 of 4 answered")).toBeVisible(); await expect(page.locator(".result")).toHaveCount(0);
  await expect(page.getByLabel("Your answer")).toBeEnabled(); await expect(page.getByLabel("Your answer")).toHaveValue("");
});
test("quiz: expiry submits once, without the unanswered prompt", async ({ page }) => {
  await page.clock.install();
  // The sample quiz has no time limit, so give one to the client. The server still scores its own copy.
  await page.route("**/api/quizzes/learning-how-to-learn/quiz-basics", async (route) => {
    const response = await route.fetch(); const body = await response.json();
    await route.fulfill({ response, json: { ...body, quiz: { ...body.quiz, timeLimitSeconds: 60 } } });
  });
  let posts = 0;
  await page.route("**/api/attempts", (r) => { if (r.request().method() === "POST") posts += 1; return r.continue(); });
  await page.goto("/quizzes/learning-how-to-learn/quiz-basics");
  await expect(page.getByText("4 questions · 1:00 limit · pass 75%")).toBeVisible();
  await page.getByRole("button", { name: "Start quiz" }).click();
  await expect(page.getByRole("timer", { name: "Time left" })).toBeVisible();
  await page.clock.fastForward("01:01");
  await expect(page.getByRole("heading", { name: /^0% · Not passed \(needs 75%\) · 0 of 4 correct · 1:00/ })).toBeFocused();
  await expect(page.getByText(/unanswered will score 0/)).toHaveCount(0);
  await expect(page.getByLabel("Your answer")).toBeDisabled(); expect(posts).toBe(1);
});
test("quiz: expiry during an in-flight submit logs one run", async ({ page }) => {
  await page.clock.install();
  const before = await runs(page, "quiz", "quiz-basics");
  await page.route("**/api/quizzes/learning-how-to-learn/quiz-basics", async (route) => {
    const response = await route.fetch(); const body = await response.json();
    await route.fulfill({ response, json: { ...body, quiz: { ...body.quiz, timeLimitSeconds: 60 } } });
  });
  let posts = 0; let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route("**/api/attempts", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    posts += 1; await held; await route.continue();
  });
  await page.goto("/quizzes/learning-how-to-learn/quiz-basics");
  await page.getByRole("button", { name: "Start quiz" }).click();
  await page.getByLabel(/just before you would forget/i).check();
  await page.getByRole("button", { name: "Submit quiz" }).click();
  await page.getByRole("button", { name: "Submit anyway" }).click();   // this submit is still in flight at the limit
  await expect(page.getByLabel("Your answer")).toBeDisabled();
  await page.clock.fastForward("01:01");
  release();
  // 0:0x, not 1:00: the manual payload was sent, and expiry froze no second one
  await expect(page.getByRole("heading", { name: /^25% · Not passed \(needs 75%\) · 1 of 4 correct · 0:0\d$/ })).toBeFocused();
  await expect(page.locator(".history li")).toHaveCount(historyRows(before, 1)); expect(posts).toBe(1);
});
test("quiz: a submit held across expiry is sent once and resent unchanged", async ({ page }) => {
  await page.clock.install();
  const before = await runs(page, "quiz", "quiz-basics");
  await page.route("**/api/quizzes/learning-how-to-learn/quiz-basics", async (route) => {
    const response = await route.fetch(); const body = await response.json();
    await route.fulfill({ response, json: { ...body, quiz: { ...body.quiz, timeLimitSeconds: 60 } } });
  });
  const bodies: unknown[] = []; let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route("**/api/attempts", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    bodies.push(route.request().postDataJSON());
    if (bodies.length === 1) { await held; return route.fulfill({ status: 500, body: "{}" }); }
    await route.continue();
  });
  await page.goto("/quizzes/learning-how-to-learn/quiz-basics");
  await page.getByRole("button", { name: "Start quiz" }).click();
  await page.getByLabel("Your answer").fill("recall");
  await page.getByRole("button", { name: "Submit quiz" }).evaluate((b: HTMLButtonElement) => { b.click(); b.click(); });
  await expect(page.getByText("3 unanswered will score 0.")).toBeVisible();
  await page.getByRole("button", { name: "Submit anyway" }).evaluate((b: HTMLButtonElement) => { b.click(); b.click(); });
  await expect(page.getByRole("timer", { name: "Time left" })).toHaveCount(0);   // the payload is frozen
  await page.clock.fastForward("01:01");                                         // expiry while POST #1 is held
  release();
  await expect(page.getByRole("alert")).toContainText("weren’t submitted");
  expect(bodies).toHaveLength(1);
  await page.getByRole("button", { name: "Submit again" }).click();
  // no "Time’s up": the resend still carries the manual time, not the limit
  await expect(page.getByRole("heading", { name: /^\d+% · Not passed \(needs 75%\) · [01] of 4 correct · 0:\d\d$/ })).toBeFocused();
  expect(bodies).toHaveLength(2); expect(bodies[1]).toEqual(bodies[0]);
  expect((bodies[0] as { elapsedSeconds: number }).elapsedSeconds).toBeLessThan(60);
  await expect(page.locator(".history li")).toHaveCount(historyRows(before, 1));
});
test("quiz: leaving a run asks first, and abandoning it in the app logs nothing", async ({ page }) => {
  let posts = 0;
  await page.route("**/api/attempts", (r) => { if (r.request().method() === "POST") posts += 1; return r.continue(); });
  await page.goto("/quizzes/learning-how-to-learn/quiz-basics");
  await page.getByRole("button", { name: "Start quiz" }).click();
  await page.getByLabel(/just before you would forget/i).check();       // a real click: Chromium asks only after a user gesture
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Games" }).click();
  await expect(page.getByRole("heading", { name: "Games", exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("button", { name: "Start quiz" })).toBeVisible();   // the abandoned run is gone
  expect(posts).toBe(0);
  await page.getByRole("button", { name: "Start quiz" }).click();
  await page.getByLabel(/just before you would forget/i).check();
  const [dialog] = await Promise.all([page.waitForEvent("dialog"), page.close({ runBeforeUnload: true })]);
  expect(dialog.type()).toBe("beforeunload");
  await dialog.dismiss();                                                 // stay on the page
  await page.getByRole("button", { name: "Submit quiz" }).click();
  await page.getByRole("button", { name: "Submit anyway" }).click();
  await expect(page.getByRole("heading", { name: /^25% · Not passed/ })).toBeFocused();
  const dialogs: string[] = [];
  page.on("dialog", (d) => { dialogs.push(d.type()); void d.accept(); });
  await page.close({ runBeforeUnload: true });
  await expect.poll(() => page.isClosed()).toBe(true);
  expect(dialogs).toEqual([]); expect(posts).toBe(1);                     // a submitted run no longer asks
});
test("quiz: a missing or changed quiz says so and offers no retry", async ({ page }) => {
  await page.goto("/quizzes/learning-how-to-learn/ghost");
  await expect(page.getByText("This quiz isn’t in your library any more.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to the library" })).toBeVisible();
  await page.route("**/api/attempts", (route) => route.request().method() !== "POST" ? route.continue()
    : route.fulfill({ status: 422, json: { error: { code: "not_checkable", message: "x" } } }));
  // The history GET carries a query string, which the glob above does not match; a regex does.
  await page.route(/\/api\/attempts\?/, (route) => route.fulfill({ status: 500, body: "{}" }), { times: 1 });
  await page.route("**/api/quizzes/learning-how-to-learn/quiz-basics", async (route) => {
    const response = await route.fetch(); const body = await response.json();
    await route.fulfill({ response, json: { ...body, quiz: { ...body.quiz, items: [...body.quiz.items, "toString"] } } });
  });
  await page.goto("/quizzes/learning-how-to-learn/quiz-basics");
  await expect(page.getByText("History couldn’t be loaded.")).toBeVisible();      // the quiz itself still loads and starts
  await page.getByRole("button", { name: "Start quiz" }).click();
  await expect(page.locator(".work")).toHaveCount(4); // A missing prototype-named item is skipped like any other missing item.
  await page.getByRole("button", { name: "Submit quiz" }).click();
  await page.getByRole("button", { name: "Submit anyway" }).click();
  await expect(page.getByText("This quiz changed since you started it — reload to start again.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit again" })).toHaveCount(0);   // a 422 would fail on every resend
  await expect(page.getByLabel("Your answer")).toBeDisabled();
  const dialogs: string[] = [];
  page.on("dialog", (d) => { dialogs.push(d.type()); void d.accept(); });
  await page.close({ runBeforeUnload: true });
  await expect.poll(() => page.isClosed()).toBe(true);
  expect(dialogs).toEqual([]);                                             // a stale run can be reloaded without a prompt
});
test("quiz: a page load’s late history answer never replaces the history refreshed after a run", async ({ page }) => {
  const before = await runs(page, "quiz", "quiz-basics");
  // An older empty history, then an older failure, each arriving after the post-run refresh.
  const lateAnswers = [{ json: { attempts: [] } }, { status: 500, body: "{}" }];
  for (const [k, answer] of lateAnswers.entries()) {
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    // The history GET carries a query string, which a "**/api/attempts" glob does not match; a regex does.
    await page.route(/\/api\/attempts\?/, async (route) => { await held; await route.fulfill(answer); }, { times: 1 });
    await page.goto("/quizzes/learning-how-to-learn/quiz-basics");
    await page.getByRole("button", { name: "Start quiz" }).click();
    await page.getByRole("button", { name: "Submit quiz" }).click();
    await page.getByRole("button", { name: "Submit anyway" }).click();
    await expect(page.getByRole("heading", { name: /^0% · Not passed/ })).toBeFocused();
    await expect(page.locator(".history li")).toHaveCount(historyRows(before, k + 1));
    const late = page.waitForResponse(/\/api\/attempts\?/);
    release(); await late;
    await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0))));
    await expect(page.locator(".history li")).toHaveCount(historyRows(before, k + 1));
    await expect(page.getByText(/No attempts yet\.|History couldn’t be loaded\./)).toHaveCount(0);
  }
});

test("timed round: expiry submits once and drops a late check, even after Play again", async ({ page }) => {
  await page.clock.install();
  const before = await runs(page, "game", "game-speed");
  await page.goto("/");
  await page.getByRole("link", { name: "Games · 3", exact: true }).click();
  await page.getByRole("link", { name: "Quick fire" }).click();
  let posts = 0; let checks = 0; const bodies: any[] = [];
  let held: Promise<void> | null = null;
  /** Holds the next check request until the returned function is called. */
  const holdNextCheck = () => { let release!: () => void; held = new Promise<void>((r) => (release = r)); return release; };
  /** Lets the page act on a response that has already arrived: one frame, then one task (time still flows under clock.install). */
  const settle = () => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0))));
  await page.route("**/api/attempts", (r) => {
    if (r.request().method() !== "POST") return r.continue();
    bodies.push(r.request().postDataJSON());
    if (++posts === 1) return r.fulfill({ status: 500, body: "{}" });
    return r.continue();
  });
  await page.route("**/api/games/**/check", async (route) => {
    checks += 1; const wait = held; held = null;
    if (wait) await wait;
    await route.continue();
  });
  const check = page.getByRole("button", { name: "Check", exact: true });
  const option = page.locator(".opt input").first();
  const timesUp = page.getByRole("heading", { name: "0% · 0 of 2 correct · 1:00 · Time’s up" });
  // Round 1: a check is in flight at expiry, and the first save fails.
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByRole("timer", { name: "Time left" })).toBeVisible();
  const release1 = holdNextCheck();
  await option.check(); await check.click();
  await page.clock.fastForward("01:01");
  await expect(page.getByRole("alert")).toContainText("Your score wasn’t saved");
  let late = page.waitForResponse("**/api/games/**/check");
  release1(); await late; await settle();
  await expect(page.locator(".verdict")).toHaveCount(0);                     // the late result shows no verdict
  await expect(option).toBeDisabled();                                       // and the ended board stays locked
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(timesUp).toBeFocused();
  expect(bodies[1].play.answers).toEqual([]); expect(bodies[1]).toEqual(bodies[0]);  // Try again resends the frozen payload, without the late answer
  // Round 2: a check is still in flight when the round expires and Play again starts round 3.
  await page.getByRole("button", { name: "Play again" }).click();
  const release2 = holdNextCheck();
  await option.check(); await check.click();
  await page.clock.fastForward("01:01");
  await expect(timesUp).toBeFocused();
  await page.getByRole("button", { name: "Play again" }).click();
  // Round 3: Play again unlocked the new board, and round 2's late result lands while round 3's own check is out.
  const release3 = holdNextCheck();
  await option.check(); await expect(check).toBeEnabled(); await check.click();
  await expect(option).toBeDisabled();                                       // round 3's check is in flight
  late = page.waitForResponse("**/api/games/**/check");
  release2(); await late; await settle();
  await expect(option).toBeDisabled(); await expect(check).toHaveCount(0);   // the late finally did not unlock round 3's board
  await expect(page.locator(".verdict")).toHaveCount(0);                     // nor show a verdict on it
  release3();
  await expect(page.locator(".result .verdict")).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await option.check(); await check.click();
  await expect(page.locator(".result .verdict")).toBeVisible();
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page.getByRole("heading", { name: /^\d+% · [012] of 2 correct · \d+:\d\d$/ })).toBeFocused();
  await expect(page.getByText("This game changed since you started")).toHaveCount(0);
  await expect(page.locator(".history li")).toHaveCount(historyRows(before, 3));
  expect(posts).toBe(4); expect(checks).toBe(4);
});
test("order it: a retried check clears the error, a double click sends one check, and the score is logged", async ({ page }) => {
  const before = await runs(page, "game", "game-order");
  await page.goto("/");
  await page.getByRole("link", { name: "Games · 3", exact: true }).click();
  await page.getByRole("link", { name: "Put it in order" }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByText("Question 1 of 1 · Put these in order")).toBeVisible();
  let checks = 0;
  await page.route("**/api/games/**/check", async (route) => {
    if (++checks === 1) return route.fulfill({ status: 500, body: "{}" });
    await new Promise((r) => setTimeout(r, 300)); await route.continue();
  });
  // exact: the step "Check and correct" puts "Check" in two Move buttons' names
  const check = page.getByRole("button", { name: "Check", exact: true });
  await check.click();
  await expect(page.getByRole("alert")).toContainText("That move wasn’t checked");
  await check.evaluate((b: HTMLButtonElement) => { b.click(); b.click(); });
  await expect(page.locator(".result .verdict")).toBeVisible(); expect(checks).toBe(2);
  await expect(page.getByRole("alert")).toHaveCount(0);                     // the retry cleared the old error
  await expect(page.getByRole("button", { name: "Finish" })).toBeFocused();
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page.getByRole("heading", { name: /^\d+% · [01] of 1 correct · \d+:\d\d$/ })).toBeFocused();
  await expect(page.locator(".history li")).toHaveCount(historyRows(before, 1));
});
test("order it: a missing or changed game says so, locks the board and records nothing", async ({ page }) => {
  await page.goto("/games/learning-how-to-learn/ghost");
  await expect(page.getByText("This game isn’t in your library any more.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to the library" })).toBeVisible();
  await page.route("**/api/games/**/check", (route) =>
    route.fulfill({ status: 422, json: { error: { code: "not_checkable", message: "x" } } }));
  // The history GET carries a query string, which a "**/api/attempts" glob does not match; a regex does.
  await page.route(/\/api\/attempts\?/, (route) => route.fulfill({ status: 500, body: "{}" }), { times: 1 });
  let posts = 0;
  await page.route("**/api/attempts", (r) => { if (r.request().method() === "POST") posts += 1; return r.continue(); });
  await page.goto("/games/learning-how-to-learn/game-order");
  await expect(page.getByText("History couldn’t be loaded.")).toBeVisible();      // the game itself still loads and plays
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByRole("timer", { name: "Time taken" })).toBeVisible();
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect(page.getByText("This game changed since you started — reload to play again.")).toBeVisible();
  await expect(page.getByText("That move wasn’t checked")).toHaveCount(0);   // not the retryable error
  await expect(page.locator(".result .verdict")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Check", exact: true })).toHaveCount(0);   // a stale board takes no more moves
  await expect(page.getByRole("timer")).toHaveCount(0);                                     // and its clock has stopped
  expect(posts).toBe(0);                                                                    // a stale play is never saved
});
test("matching: one miss on three pairs scores 75%", async ({ page }) => {
  const before = await runs(page, "game", "game-match");
  await page.goto("/");
  await page.getByRole("link", { name: "Games · 3", exact: true }).click();
  await page.getByRole("link", { name: "Match the techniques" }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  let checks = 0;
  await page.route("**/api/games/**/check", async (route) => { checks += 1; await new Promise((r) => setTimeout(r, 300)); await route.continue(); });
  const tile = (name: string) => page.getByRole("button", { name, exact: true });
  const firstOpenTerm = page.getByRole("group", { name: "Terms" }).getByRole("button", { disabled: false }).first();
  await tile("Spaced repetition").click();
  await tile("Test yourself before checking").evaluate((b: HTMLButtonElement) => { b.click(); b.click(); });
  await expect(page.getByText("0 of 3 matched · 1 miss")).toBeVisible(); expect(checks).toBe(1);
  await expect(firstOpenTerm).toBeFocused();                 // focus goes back to the first unmatched term
  await tile("Spaced repetition").click(); await tile("Grow the gap between reviews").click();
  await expect(page.getByText("1 of 3 matched · 1 miss")).toBeVisible(); await expect(firstOpenTerm).toBeFocused();
  for (const [l, r] of [["Active recall", "Test yourself before checking"], ["Interleaving", "Mix topics within one session"]]) {
    await tile(l).click(); await tile(r).click();          // a click waits while the board is disabled
  }
  await expect(page.getByRole("heading", { name: /^75% · 3 of 3 matched · 1 miss · \d+:\d\d$/ })).toBeFocused();
  await expect(page.locator(".history li")).toHaveCount(historyRows(before, 1)); expect(checks).toBe(4);
});
