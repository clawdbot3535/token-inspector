// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import TokenSourceBadge from "./TokenSourceBadge.vue";
import type { TokenCommit } from "../git-import.js";

const source = (commit: TokenCommit | null) => ({
  ref: { host: "github" as const, owner: "o", repo: "token-export", branch: "main", dir: "tokens" },
  commit,
});

describe("TokenSourceBadge", () => {
  it("renders nothing when there is no source (drag-dropped)", () => {
    const w = mount(TokenSourceBadge, { props: { source: null } });
    expect(w.find('[data-testid="token-source"]').exists()).toBe(false);
  });

  it("shows repo@branch + short sha when a commit is present", () => {
    const w = mount(TokenSourceBadge, {
      props: { source: source({ sha: "a1b2c3d4567890", date: "2026-06-29T10:00:00Z", message: "update" }) },
    });
    const el = w.find('[data-testid="token-source"]');
    expect(el.exists()).toBe(true);
    expect(el.text()).toContain("token-export@main");
    expect(el.text()).toContain("a1b2c3d"); // 7-char short sha, not the full one
    expect(el.text()).not.toContain("a1b2c3d4567890");
  });

  it("shows just repo@branch when the commit could not be fetched", () => {
    const w = mount(TokenSourceBadge, { props: { source: source(null) } });
    expect(w.find('[data-testid="token-source"]').text()).toBe("token-export@main");
  });
});
