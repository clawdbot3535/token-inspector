// Commit generated files (tokens.css + app.config.ts) to a GitHub/GitLab repo
// in one atomic commit, using a user-supplied write PAT. Client-side fetch.
// SECURITY: the token is never logged and never placed in a thrown Error message.

import type { GitRef } from "./git-import.js";

export interface ExportFile { path: string; content: string; }
export interface CommitResult { commitUrl: string; }

const GH_API = "https://api.github.com";
const GL_API = "https://gitlab.com/api/v4";

/** Parse a host response, mapping non-OK status to a user-facing (token-free) Error. */
async function need<T>(res: Response, host: "GitHub" | "GitLab", ctx: string): Promise<T> {
  if (res.ok) return (await res.json()) as T;
  if (res.status === 401 || res.status === 403) throw new Error(`${host}: token invalid or missing write scope (${ctx}).`);
  if (res.status === 404) throw new Error(`${host}: repo or branch not found (${ctx}).`);
  if (res.status === 422) throw new Error(`${host}: ${ctx} rejected — the branch may have moved; reload and retry.`);
  throw new Error(`${host}: ${ctx} failed (status ${res.status}).`);
}

async function commitGitHub(target: GitRef, files: readonly ExportFile[], token: string, message: string): Promise<CommitResult> {
  const base = `${GH_API}/repos/${target.owner}/${target.repo}/git`;
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" };
  const branchPath = `heads/${target.branch.split("/").map(encodeURIComponent).join("/")}`;

  const ref = await need<{ object: { sha: string } }>(await fetch(`${base}/ref/${branchPath}`, { headers }), "GitHub", "read branch ref");
  const baseSha = ref.object.sha;
  const baseCommit = await need<{ tree: { sha: string } }>(await fetch(`${base}/commits/${baseSha}`, { headers }), "GitHub", "read base commit");

  const tree: { path: string; mode: "100644"; type: "blob"; sha: string }[] = [];
  for (const f of files) {
    const blob = await need<{ sha: string }>(
      await fetch(`${base}/blobs`, { method: "POST", headers, body: JSON.stringify({ content: f.content, encoding: "utf-8" }) }),
      "GitHub", `create blob ${f.path}`,
    );
    tree.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
  }

  const newTree = await need<{ sha: string }>(
    await fetch(`${base}/trees`, { method: "POST", headers, body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree }) }),
    "GitHub", "create tree",
  );
  const newCommit = await need<{ sha: string; html_url: string }>(
    await fetch(`${base}/commits`, { method: "POST", headers, body: JSON.stringify({ message, tree: newTree.sha, parents: [baseSha] }) }),
    "GitHub", "create commit",
  );
  await need<unknown>(
    await fetch(`${base}/refs/${branchPath}`, { method: "PATCH", headers, body: JSON.stringify({ sha: newCommit.sha }) }),
    "GitHub", "update branch ref",
  );
  return { commitUrl: newCommit.html_url };
}

async function commitGitLab(target: GitRef, files: readonly ExportFile[], token: string, message: string): Promise<CommitResult> {
  const id = encodeURIComponent(`${target.owner}/${target.repo}`);
  const ref = encodeURIComponent(target.branch);
  const actions: { action: "create" | "update"; file_path: string; content: string }[] = [];
  for (const f of files) {
    const head = await fetch(`${GL_API}/projects/${id}/repository/files/${encodeURIComponent(f.path)}?ref=${ref}`, { headers: { "PRIVATE-TOKEN": token } });
    if (head.status === 401 || head.status === 403) throw new Error(`GitLab: token invalid or missing write scope (check file ${f.path}).`);
    actions.push({ action: head.ok ? "update" : "create", file_path: f.path, content: f.content });
  }
  const res = await fetch(`${GL_API}/projects/${id}/repository/commits`, {
    method: "POST",
    headers: { "PRIVATE-TOKEN": token, "Content-Type": "application/json" },
    body: JSON.stringify({ branch: target.branch, commit_message: message, actions }),
  });
  const data = await need<{ web_url: string }>(res, "GitLab", "create commit");
  return { commitUrl: data.web_url };
}

/** Commit files to the target ref in one atomic commit. Throws a token-free,
 *  user-facing Error on auth/not-found/validation failure. */
export async function commitFiles(target: GitRef, files: readonly ExportFile[], token: string, message: string): Promise<CommitResult> {
  if (files.length === 0) throw new Error("No files to commit.");
  return target.host === "github"
    ? commitGitHub(target, files, token, message)
    : commitGitLab(target, files, token, message);
}
