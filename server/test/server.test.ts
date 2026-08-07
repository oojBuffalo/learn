import { describe, expect, it } from "vitest";
import { studyServerOptions } from "../src/index.js";

describe("study server startup", () => {
  it("listens only on the IPv4 loopback interface", () => {
    const fetch = () => new Response();

    expect(studyServerOptions(fetch)).toMatchObject({
      fetch,
      hostname: "127.0.0.1",
      port: 4321,
    });
  });
});
