// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import GitLoader from "./GitLoader.vue";

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

describe("GitLoader", () => {
  it("emits error (and no fetch) for an unrecognised URL", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const wrapper = mount(GitLoader);
    await wrapper.find("input").setValue("https://example.com/nope");
    await wrapper.find('[data-testid="repo-load"]').trigger("click");
    expect(wrapper.emitted("error")?.[0]).toEqual(["Unrecognised GitHub/GitLab URL."]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("emits the fetched files and persists the URL on success", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.startsWith("https://api.github.com/")) {
        return new Response(JSON.stringify([
          { type: "file", name: "color.tokens.json", download_url: "https://raw/color" },
        ]), { status: 200 });
      }
      return new Response('{"a":1}', { status: 200 });
    }));
    const wrapper = mount(GitLoader);
    await wrapper.find("input").setValue("https://github.com/acme/tokens");
    await wrapper.find('[data-testid="repo-load"]').trigger("click");
    await vi.waitFor(() => { expect(wrapper.emitted("files")).toBeTruthy(); });
    const files = wrapper.emitted("files")![0]![0] as File[];
    expect(files).toHaveLength(1);
    expect(files[0]!.name).toBe("color.tokens.json");
    expect(localStorage.getItem("figma-tokens-repo-url")).toBe("https://github.com/acme/tokens");
  });

  it("emits error when the fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 404 })));
    const wrapper = mount(GitLoader);
    await wrapper.find("input").setValue("https://github.com/acme/tokens");
    await wrapper.find('[data-testid="repo-load"]').trigger("click");
    await vi.waitFor(() => { expect(wrapper.emitted("error")).toBeTruthy(); });
  });
});
