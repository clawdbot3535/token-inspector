// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

const { embedProject, openProject } = vi.hoisted(() => ({
  embedProject: vi.fn().mockResolvedValue({}),
  openProject: vi.fn(),
}));
vi.mock("@stackblitz/sdk", () => ({ default: { embedProject, openProject } }));

import { stackblitzSubstrate } from "./stackblitz-substrate.js";

describe("stackblitzSubstrate", () => {
  beforeEach(() => { embedProject.mockClear(); openProject.mockClear(); });

  it("embeds a node project in preview-only mode into the given element", async () => {
    const el = document.createElement("div");
    await stackblitzSubstrate.embed(el, { "package.json": "{}" }, { title: "Kit" });
    expect(embedProject).toHaveBeenCalledTimes(1);
    const [target, project, options] = embedProject.mock.calls[0]!;
    expect(target).toBe(el);
    expect(project.template).toBe("node");
    expect(project.title).toBe("Kit");
    expect(project.files).toEqual({ "package.json": "{}" });
    expect(options.view).toBe("preview");
    expect(options.hideExplorer).toBe(true);
    expect(options.hideNavigation).toBe(true);
  });

  it("opens the project in a new window via openExternal", () => {
    stackblitzSubstrate.openExternal({ "package.json": "{}" }, { title: "Kit" });
    expect(openProject).toHaveBeenCalledTimes(1);
    const [project, options] = openProject.mock.calls[0]!;
    expect(project.template).toBe("node");
    expect(options).toEqual({ newWindow: true });
  });
});
