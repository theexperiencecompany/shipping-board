import { describe, expect, it } from "vite-plus/test";
import { laneOf } from "./config";
import { zonedClock } from "./time";

describe("laneOf", () => {
  it("maps lint jobs", () => {
    expect(laneOf("lint-node")).toBe("lint");
    expect(laneOf("repo-policy")).toBe("lint");
    expect(laneOf("python-audit")).toBe("lint");
  });

  it("maps build jobs", () => {
    expect(laneOf("ts-build-test")).toBe("build");
    expect(laneOf("docker-image")).toBe("build");
  });

  it("maps browsers and scans before tests", () => {
    expect(laneOf("test-python-engines")).toBe("e2e");
    expect(laneOf("obscura-bin")).toBe("e2e");
    expect(laneOf("scan")).toBe("e2e");
  });

  it("maps test jobs", () => {
    expect(laneOf("test-python (unit-a)")).toBe("test");
    expect(laneOf("mutation (shard 1/6)")).toBe("test");
  });

  it("ignores control plane jobs", () => {
    expect(laneOf("select-runner")).toBe(null);
    expect(laneOf("detect")).toBe(null);
    expect(laneOf("quality-gate")).toBe(null);
  });
});

describe("timezone", () => {
  const at = new Date("2026-11-12T20:30:00Z");

  it("renders the clock in the configured zone", () => {
    expect(zonedClock("Asia/Kolkata", at)).toBe("02:00");
    expect(zonedClock("UTC", at)).toBe("20:30");
  });
});
