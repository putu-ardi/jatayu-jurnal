import { describe, expect, it } from "vitest";
import { summarizeReadiness, withinTimeout } from "./health";

describe("summarizeReadiness", () => {
  it("returns ready only when every dependency is up", () => {
    expect(summarizeReadiness({ database: "up", redis: "up" })).toEqual({
      status: "ready",
      checks: { database: "up", redis: "up" },
    });
  });

  it("returns not_ready when a dependency is down", () => {
    expect(summarizeReadiness({ database: "up", redis: "down" }).status).toBe(
      "not_ready",
    );
  });
});

describe("withinTimeout", () => {
  it("returns a completed operation", async () => {
    await expect(withinTimeout(Promise.resolve("ok"), 50)).resolves.toBe("ok");
  });

  it("rejects a slow operation", async () => {
    await expect(withinTimeout(new Promise(() => undefined), 5)).rejects.toThrow(
      "Operation timed out.",
    );
  });
});
