import { describe, it, expect } from "vitest";
import { emptyIssuesMessage } from "./empty-issues-message.js";

describe("emptyIssuesMessage", () => {
  it("is unqualified when both filters are all", () => {
    expect(emptyIssuesMessage("all", "all")).toBe("No issues.");
  });

  it("includes only the severity word when owner is all", () => {
    expect(emptyIssuesMessage("warning", "all")).toBe("No warning issues.");
  });

  it("includes only the owner label when severity is all", () => {
    expect(emptyIssuesMessage("all", "figma-fix")).toBe("No Figma-Fix issues.");
  });

  it("includes the owner label before the severity word when both are set", () => {
    expect(emptyIssuesMessage("warning", "by-design")).toBe("No by-design warning issues.");
    expect(emptyIssuesMessage("error", "manual-dev")).toBe("No Manual-Dev error issues.");
  });

  it("uses the OWNER_FILTERS label for the 'other' bucket", () => {
    expect(emptyIssuesMessage("all", "other")).toBe("No Other issues.");
  });
});
