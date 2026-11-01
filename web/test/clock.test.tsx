import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import Clock from "../src/components/Clock.js";

it("Clock counts down with a limit and up without one", () => {
  const down = renderToStaticMarkup(<Clock elapsedMs={1500} limitSeconds={60} />);
  expect(down).toContain('role="timer"'); expect(down).toContain('aria-label="Time left"'); expect(down).toContain(">0:59<");
  const up = renderToStaticMarkup(<Clock elapsedMs={61_000} limitSeconds={null} />);
  expect(up).toContain('aria-label="Time taken"'); expect(up).toContain(">1:01<");
});
