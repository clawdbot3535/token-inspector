// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

const { openProject } = vi.hoisted(() => ({ openProject: vi.fn() }));
vi.mock("@stackblitz/sdk", () => ({ default: { openProject } }));

import { stackblitzSubstrate } from "./stackblitz-substrate.js";

describe("stackblitzSubstrate", () => {
  beforeEach(() => openProject.mockClear());

  it("opens a node project in a new window via openExternal", () => {
    stackblitzSubstrate.openExternal({ "package.json": "{}" }, { title: "Kit" });
    expect(openProject).toHaveBeenCalledTimes(1);
    const [project, options] = openProject.mock.calls[0]!;
    expect(project.template).toBe("node");
    expect(project.title).toBe("Kit");
    expect(project.files).toEqual({ "package.json": "{}" });
    expect(options).toEqual({ newWindow: true });
  });
});
