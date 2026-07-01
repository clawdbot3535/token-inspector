// @vitest-environment node
import { describe, it, expect } from "vitest";
import { relativeTime } from "./relative-time.js";

const NOW = Date.parse("2026-07-01T12:00:00Z");

describe("relativeTime", () => {
  it("formats compact relative times against a fixed now", () => {
    expect(relativeTime("2026-07-01T11:59:30Z", NOW)).toBe("just now");
    expect(relativeTime("2026-07-01T11:30:00Z", NOW)).toBe("30m ago");
    expect(relativeTime("2026-07-01T09:00:00Z", NOW)).toBe("3h ago");
    expect(relativeTime("2026-06-29T12:00:00Z", NOW)).toBe("2d ago");
    expect(relativeTime("2026-06-17T12:00:00Z", NOW)).toBe("2w ago");
    expect(relativeTime("2026-05-01T12:00:00Z", NOW)).toBe("2mo ago");
  });

  it("returns '' for an unparseable date", () => {
    expect(relativeTime("not-a-date", NOW)).toBe("");
  });
});
