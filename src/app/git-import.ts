// Load Figma *.tokens.json from a public GitHub/GitLab repo directory.
// Token-less (public repos only): lists the directory via the host REST API,
// then fetches each token file raw and returns browser File objects for the
// existing loadSources() pipeline. Writes/commits (PAT) are a separate cycle.

export interface GitRef {
  host: "github" | "gitlab";
  owner: string;
  repo: string;
  branch: string;
  dir: string;
}

/** Parse a GitHub/GitLab web URL into a GitRef, or null if unrecognised.
 * Supports `host/owner/repo`, github `…/tree/<branch>/<dir>`, gitlab
 * `…/-/tree/<branch>/<dir>`. Branch defaults to `main`, dir to "". (Nested
 * GitLab subgroups and non-github/gitlab hosts are out of scope.) */
export function parseGitUrl(url: string): GitRef | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "");
  const parts = u.pathname.split("/").filter((p) => p.length > 0);
  if (parts.length < 2) return null;
  const owner = parts[0]!;
  const repo = parts[1]!.replace(/\.git$/, "");

  if (host === "github.com") {
    if (parts.length >= 4 && parts[2] === "tree") {
      return { host: "github", owner, repo, branch: parts[3]!, dir: parts.slice(4).join("/") };
    }
    return { host: "github", owner, repo, branch: "main", dir: "" };
  }
  if (host === "gitlab.com") {
    const dash = parts.indexOf("-");
    if (dash >= 2 && parts[dash + 1] === "tree" && parts.length > dash + 2) {
      return { host: "gitlab", owner, repo, branch: parts[dash + 2]!, dir: parts.slice(dash + 3).join("/") };
    }
    return { host: "gitlab", owner, repo, branch: "main", dir: "" };
  }
  return null;
}

interface Entry { name: string; rawUrl: string; }

function isTokenFile(name: string): boolean {
  return name.endsWith(".tokens.json") || name === "figma-mapping.json";
}

async function listGitHub(ref: GitRef): Promise<Entry[]> {
  const dirPath = ref.dir.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  const url = `https://api.github.com/repos/${ref.owner}/${ref.repo}/contents/${dirPath}?ref=${encodeURIComponent(ref.branch)}`;
  const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
  if (!res.ok) {
    throw new Error(`GitHub: ${ref.owner}/${ref.repo} not found or rate-limited (status ${res.status}).`);
  }
  const data: unknown = await res.json();
  if (!Array.isArray(data)) throw new Error(`GitHub: "${ref.dir || "/"}" is not a directory.`);
  return data
    .filter((d): d is { type: string; name: string; download_url: string } =>
      typeof d === "object" && d !== null && (d as { type?: unknown }).type === "file" &&
      typeof (d as { download_url?: unknown }).download_url === "string")
    .map((d) => ({ name: d.name, rawUrl: d.download_url }));
}

async function listGitLab(ref: GitRef): Promise<Entry[]> {
  const id = encodeURIComponent(`${ref.owner}/${ref.repo}`);
  const tree = `https://gitlab.com/api/v4/projects/${id}/repository/tree?per_page=100&ref=${encodeURIComponent(ref.branch)}` +
    (ref.dir ? `&path=${encodeURIComponent(ref.dir)}` : "");
  const res = await fetch(tree);
  if (!res.ok) {
    throw new Error(`GitLab: ${ref.owner}/${ref.repo} not found or rate-limited (status ${res.status}).`);
  }
  const data: unknown = await res.json();
  if (!Array.isArray(data)) throw new Error(`GitLab: unexpected tree response.`);
  return data
    .filter((d): d is { type: string; name: string; path: string } =>
      typeof d === "object" && d !== null && (d as { type?: unknown }).type === "blob")
    .map((d) => ({
      name: d.name,
      rawUrl: `https://gitlab.com/api/v4/projects/${id}/repository/files/${encodeURIComponent(d.path)}/raw?ref=${encodeURIComponent(ref.branch)}`,
    }));
}

/** Fetch every *.tokens.json (+ figma-mapping.json) in the ref's directory as
 * File[]. Throws a user-facing Error on listing failure / empty / fetch error. */
export async function fetchTokenFiles(ref: GitRef): Promise<File[]> {
  const entries = ref.host === "github" ? await listGitHub(ref) : await listGitLab(ref);
  const wanted = entries.filter((e) => isTokenFile(e.name));
  if (wanted.length === 0) {
    const where = `${ref.owner}/${ref.repo}${ref.dir ? "/" + ref.dir : ""} (branch ${ref.branch})`;
    throw new Error(`No *.tokens.json found in ${where}.`);
  }
  const files: File[] = [];
  for (const e of wanted) {
    const res = await fetch(e.rawUrl);
    if (!res.ok) throw new Error(`Failed to fetch ${e.name} (status ${res.status}).`);
    const text = await res.text();
    files.push(new File([text], e.name, { type: "application/json" }));
  }
  return files;
}

export interface TokenCommit {
  sha: string;
  date: string;
  message: string;
}

/** Where a loaded token graph came from: the Git ref + (best-effort) its latest commit. */
export interface TokenSource {
  ref: GitRef;
  commit: TokenCommit | null;
}

/**
 * Best-effort: the latest commit touching the ref's token directory, for the
 * header provenance badge. Returns null on ANY failure (rate-limit, network,
 * unexpected shape) — the source is still shown, just without the commit.
 */
export async function fetchLatestCommit(ref: GitRef): Promise<TokenCommit | null> {
  const dirQuery = ref.dir ? `&path=${encodeURIComponent(ref.dir)}` : "";
  try {
    if (ref.host === "github") {
      const url = `https://api.github.com/repos/${ref.owner}/${ref.repo}/commits?sha=${encodeURIComponent(ref.branch)}&per_page=1${dirQuery}`;
      const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
      if (!res.ok) return null;
      const data: unknown = await res.json();
      if (!Array.isArray(data) || data.length === 0) return null;
      const c = data[0] as { sha?: unknown; commit?: { author?: { date?: unknown }; message?: unknown } };
      if (typeof c.sha !== "string") return null;
      return {
        sha: c.sha,
        date: typeof c.commit?.author?.date === "string" ? c.commit.author.date : "",
        message: typeof c.commit?.message === "string" ? c.commit.message : "",
      };
    }
    const id = encodeURIComponent(`${ref.owner}/${ref.repo}`);
    const url = `https://gitlab.com/api/v4/projects/${id}/repository/commits?ref_name=${encodeURIComponent(ref.branch)}&per_page=1${dirQuery}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const c = data[0] as { id?: unknown; created_at?: unknown; title?: unknown };
    if (typeof c.id !== "string") return null;
    return {
      sha: c.id,
      date: typeof c.created_at === "string" ? c.created_at : "",
      message: typeof c.title === "string" ? c.title : "",
    };
  } catch {
    return null;
  }
}
