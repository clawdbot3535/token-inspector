import { describe, it, expect } from "vitest";
import { projectToState, PREVIEW_STATES } from "./project-to-state.js";

describe("projectToState", () => {
  it("default keeps the base look and drops every state-prefixed class", () => {
    expect(
      projectToState("bg-[#A] hover:bg-[#B] active:bg-[#C]", "default"),
    ).toBe("bg-[#A]");
  });

  it("promotes the chosen state's classes after the base so they win", () => {
    expect(
      projectToState("bg-[#A] hover:bg-[#B] active:bg-[#C]", "hover"),
    ).toBe("bg-[#A] bg-[#B]");
  });

  it("drops the other states when projecting one", () => {
    expect(projectToState("hover:bg-[#B] active:bg-[#C]", "active")).toBe(
      "bg-[#C]",
    );
  });

  it("leaves non-state prefixes (responsive, dark) untouched on the base", () => {
    expect(
      projectToState("md:px-2 dark:bg-black hover:bg-[#B]", "default"),
    ).toBe("md:px-2 dark:bg-black");
    expect(
      projectToState("md:px-2 dark:bg-black hover:bg-[#B]", "hover"),
    ).toBe("md:px-2 dark:bg-black bg-[#B]");
  });

  it("preserves arbitrary values that contain their own brackets/vars", () => {
    expect(
      projectToState("text-[#000] disabled:text-[var(--d)]", "disabled"),
    ).toBe("text-[#000] text-[var(--d)]");
  });

  it("returns an empty string for empty input", () => {
    expect(projectToState("", "default")).toBe("");
  });

  it("promotes checked: classes on the checked state and drops them on default", () => {
    expect(projectToState("bg-[#A] checked:bg-[#B]", "checked")).toContain("bg-[#B]");
    const def = projectToState("bg-[#A] checked:bg-[#B]", "default");
    expect(def).not.toContain("bg-[#B]");
    expect(def).not.toContain("checked:");
  });

  it("exposes the canonical state list", () => {
    expect(PREVIEW_STATES).toEqual([
      "default",
      "hover",
      "active",
      "disabled",
      "focus",
    ]);
  });

  it("promotes data-[state=checked]: classes under the matching state and drops them otherwise", () => {
    expect(projectToState("bg-[#A] data-[state=checked]:bg-[#B]", "checked")).toBe("bg-[#A] bg-[#B]");
    const hov = projectToState("bg-[#A] data-[state=checked]:bg-[#B]", "hover");
    expect(hov).toBe("bg-[#A]");
    // existing pseudo-prefix behavior still works alongside
    expect(projectToState("bg-[#A] hover:bg-[#C]", "hover")).toBe("bg-[#A] bg-[#C]");
  });

  it("promotes data-[state=open]: classes under the open state and drops them otherwise", () => {
    expect(projectToState("text-[#A] data-[state=open]:text-[#B]", "open")).toBe("text-[#A] text-[#B]");
    expect(projectToState("text-[#A] data-[state=open]:text-[#B]", "default")).toBe("text-[#A]");
  });
});
