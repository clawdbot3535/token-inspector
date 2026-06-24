// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { ACCEPTED_STORAGE_KEY, loadAcceptedIds, saveAcceptedIds } from "./accepted-storage.js";

afterEach(() => {
  localStorage.removeItem(ACCEPTED_STORAGE_KEY);
});

describe("accepted-storage", () => {
  it("returns an empty set when the key is absent", () => {
    expect(loadAcceptedIds()).toEqual(new Set());
  });

  it("round-trips a saved set", () => {
    saveAcceptedIds(new Set(["issue-a", "issue-b"]));
    expect(loadAcceptedIds()).toEqual(new Set(["issue-a", "issue-b"]));
  });

  it("returns an empty set when the stored value is malformed JSON", () => {
    localStorage.setItem(ACCEPTED_STORAGE_KEY, "{not json");
    expect(loadAcceptedIds()).toEqual(new Set());
  });

  it("returns an empty set when the stored value is not an array", () => {
    localStorage.setItem(ACCEPTED_STORAGE_KEY, "5");
    expect(loadAcceptedIds()).toEqual(new Set());
  });

  it("drops non-string entries from a stored array", () => {
    localStorage.setItem(ACCEPTED_STORAGE_KEY, JSON.stringify(["ok", 42, null, "fine"]));
    expect(loadAcceptedIds()).toEqual(new Set(["ok", "fine"]));
  });
});
