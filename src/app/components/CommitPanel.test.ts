// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import CommitPanel from "./CommitPanel.vue";

function graph() {
  const global = { button: { bg: { $value: "#FFFFFF", $type: "color" } } };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}
function mountPanel() {
  return mount(CommitPanel, { props: { graph: graph(), completeness: [] } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
  localStorage.clear();
});

describe("CommitPanel", () => {
  it("shows an inline error (no confirm box) when URL or PAT is missing", async () => {
    const wrapper = mountPanel();
    await wrapper.find('[data-testid="commit-button"]').trigger("click");
    expect(wrapper.find('[data-testid="commit-confirm"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("Unrecognised GitHub/GitLab URL.");
  });

  it("opens the confirm box with URL + PAT set, without any network call", async () => {
    const fetchSpy = vi.fn(async () => { throw new Error("no network in confirm step"); });
    vi.stubGlobal("fetch", fetchSpy);
    const wrapper = mountPanel();
    await wrapper.find('[data-testid="export-url"]').setValue("https://github.com/acme/nuxt-app/tree/main/app");
    await wrapper.find('[data-testid="export-pat"]').setValue("ghp_DUMMY");
    await wrapper.find('[data-testid="commit-button"]').trigger("click");
    expect(wrapper.find('[data-testid="commit-confirm"]').exists()).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    // Cancel hides the box.
    const cancel = wrapper.findAll('[data-testid="commit-confirm"] button').find((b) => b.text() === "Cancel")!;
    await cancel.trigger("click");
    expect(wrapper.find('[data-testid="commit-confirm"]').exists()).toBe(false);
  });

  it("persists the PAT to sessionStorage only", async () => {
    const wrapper = mountPanel();
    await wrapper.find('[data-testid="export-pat"]').setValue("ghp_SECRET");
    expect(sessionStorage.getItem("git-export-pat")).toBe("ghp_SECRET");
    expect(Object.keys(localStorage).some((k) => (localStorage.getItem(k) ?? "").includes("ghp_SECRET"))).toBe(false);
  });
});
