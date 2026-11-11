import { describe, expect, it } from "vite-plus/test";
import { duration, timeAgo } from "./time";

const now = new Date("2026-11-12T12:00:00Z").getTime();

describe("timeAgo", () => {
  it("handles the last minute", () => {
    expect(timeAgo("2026-11-12T11:59:40Z", now)).toBe("just now");
  });

  it("reads minutes, hours and days", () => {
    expect(timeAgo("2026-11-12T11:54:00Z", now)).toBe("6m ago");
    expect(timeAgo("2026-11-12T05:00:00Z", now)).toBe("7h ago");
    expect(timeAgo("2026-11-10T12:00:00Z", now)).toBe("2d ago");
  });

  it("reads one day without a plural", () => {
    expect(timeAgo("2026-11-11T12:00:00Z", now)).toBe("1d ago");
  });
});

describe("duration", () => {
  it("floors under a minute", () => {
    expect(duration(0)).toBe("<1m");
  });

  it("reads minutes", () => {
    expect(duration(45)).toBe("45m");
  });

  it("reads hours and remainder", () => {
    expect(duration(60)).toBe("1h");
    expect(duration(90)).toBe("1h 30m");
  });
});
