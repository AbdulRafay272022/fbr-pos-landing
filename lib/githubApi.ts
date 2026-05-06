/**
 * lib/githubApi.ts
 *
 * Shared GitHub API utilities — serverless-safe, retry-equipped.
 *
 * Upgrades over v1:
 *  - withRetry() with exponential backoff for all network calls
 *  - atomicCommit detects 422 (non-fast-forward conflict) and retries
 *  - Parallel reads via readMultipleJsonFromGitHub
 */

const GH_API = "https://api.github.com";

// ─── Retry utility ────────────────────────────────────────────────────────────

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Retry an async function with exponential backoff + jitter.
 * Retryable: network errors, 429 (rate limit), 5xx server errors.
 * NOT retried: 401, 403, 404, 422 (these are caller logic errors).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 800
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const message = err instanceof Error ? err.message : String(err);

      // Don't retry on auth / not-found / business-logic errors
      if (
        message.includes(" 401") ||
        message.includes(" 403") ||
        message.includes(" 404")
      ) {
        throw err;
      }

      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 400;
        console.warn(
          JSON.stringify({
            ts: new Date().toISOString(),
            event: "github_retry",
            attempt: attempt + 1,
            delayMs: Math.round(delay),
            error: message,
          })
        );
        await sleep(delay);
      }
    }
  }
  throw lastErr;
}

// ─── Headers & base URL ───────────────────────────────────────────────────────

export function ghHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

export function ghBase(owner: string, repo: string): string {
  return `${GH_API}/repos/${owner}/${repo}`;
}

export async function ghGet<T>(url: string, token: string): Promise<T | null> {
  return withRetry(async () => {
    const res = await fetch(url, {
      headers: ghHeaders(token),
      cache: "no-store",
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub GET ${url} → ${res.status}`);
    return res.json() as Promise<T>;
  });
}

// ─── File read helpers ────────────────────────────────────────────────────────

export async function readJsonFromGitHub<T>(
  filePath: string,
  token: string,
  owner: string,
  repo: string
): Promise<T | null> {
  const url = `${ghBase(owner, repo)}/contents/${filePath}`;
  const file = await ghGet<{ content: string }>(url, token);
  if (!file) return null;
  try {
    const decoded = Buffer.from(file.content, "base64").toString("utf8");
    return JSON.parse(decoded) as T;
  } catch {
    return null;
  }
}

/**
 * Read multiple JSON files from GitHub in parallel.
 * Returns results in the same order as the paths array.
 * Individual failures return null (not thrown).
 */
export async function readMultipleJsonFromGitHub<T>(
  filePaths: string[],
  token: string,
  owner: string,
  repo: string
): Promise<(T | null)[]> {
  return Promise.all(
    filePaths.map((p) => readJsonFromGitHub<T>(p, token, owner, repo))
  );
}

export async function fileExistsOnGitHub(
  filePath: string,
  token: string,
  owner: string,
  repo: string
): Promise<boolean> {
  return withRetry(async () => {
    const url = `${ghBase(owner, repo)}/contents/${filePath}`;
    const res = await fetch(url, { method: "HEAD", headers: ghHeaders(token) });
    return res.ok;
  });
}

// ─── Blob creation ────────────────────────────────────────────────────────────

async function createBlob(
  content: string,
  token: string,
  owner: string,
  repo: string
): Promise<string> {
  return withRetry(async () => {
    const res = await fetch(`${ghBase(owner, repo)}/git/blobs`, {
      method: "POST",
      headers: ghHeaders(token),
      body: JSON.stringify({
        content: Buffer.from(content).toString("base64"),
        encoding: "base64",
      }),
    });
    if (!res.ok) throw new Error(`GitHub blob failed: ${res.status}`);
    const { sha } = (await res.json()) as { sha: string };
    return sha;
  });
}

// ─── Atomic commit (Git Trees API) ───────────────────────────────────────────

/**
 * Commit multiple file changes in one atomic GitHub commit.
 * Handles 422 conflicts (non-fast-forward) by re-reading HEAD and retrying once.
 *
 * 6-step process:
 *  1. GET refs/heads/{branch}  → latest commit SHA
 *  2. GET git/commits/{sha}    → base tree SHA
 *  3. POST blobs (parallel)    → one SHA per file
 *  4. POST git/trees           → new tree SHA
 *  5. POST git/commits         → new commit SHA
 *  6. PATCH git/refs/heads/{branch}
 */
export async function atomicCommit(
  files: Array<{ path: string; content: string }>,
  message: string,
  token: string,
  owner: string,
  repo: string,
  branch: string,
  conflictRetries = 2
): Promise<void> {
  const base = ghBase(owner, repo);
  const h = ghHeaders(token);

  for (let attempt = 0; attempt <= conflictRetries; attempt++) {
    // 1. Latest commit SHA
    const refRes = await withRetry(() =>
      fetch(`${base}/git/refs/heads/${branch}`, { headers: h })
    );
    if (!refRes.ok) throw new Error(`GitHub refs failed: ${refRes.status}`);
    const { object: { sha: latestCommitSha } } =
      (await refRes.json()) as { object: { sha: string } };

    // 2. Base tree SHA
    const commitRes = await withRetry(() =>
      fetch(`${base}/git/commits/${latestCommitSha}`, { headers: h })
    );
    if (!commitRes.ok)
      throw new Error(`GitHub commit read failed: ${commitRes.status}`);
    const { tree: { sha: baseTreeSha } } =
      (await commitRes.json()) as { tree: { sha: string } };

    // 3. Create blobs in parallel
    const blobs = await Promise.all(
      files.map((f) => createBlob(f.content, token, owner, repo))
    );

    // 4. New tree
    const treeRes = await withRetry(() =>
      fetch(`${base}/git/trees`, {
        method: "POST",
        headers: h,
        body: JSON.stringify({
          base_tree: baseTreeSha,
          tree: files.map((f, i) => ({
            path: f.path,
            mode: "100644",
            type: "blob",
            sha: blobs[i],
          })),
        }),
      })
    );
    if (!treeRes.ok) throw new Error(`GitHub tree failed: ${treeRes.status}`);
    const { sha: newTreeSha } = (await treeRes.json()) as { sha: string };

    // 5. New commit
    const newCommitRes = await withRetry(() =>
      fetch(`${base}/git/commits`, {
        method: "POST",
        headers: h,
        body: JSON.stringify({
          message,
          tree: newTreeSha,
          parents: [latestCommitSha],
        }),
      })
    );
    if (!newCommitRes.ok)
      throw new Error(`GitHub commit create failed: ${newCommitRes.status}`);
    const { sha: newCommitSha } = (await newCommitRes.json()) as { sha: string };

    // 6. Advance branch HEAD (may get 422 if someone else pushed concurrently)
    const patchRes = await fetch(`${base}/git/refs/heads/${branch}`, {
      method: "PATCH",
      headers: h,
      body: JSON.stringify({ sha: newCommitSha }),
    });

    if (patchRes.ok) return; // ✓ committed

    if (patchRes.status === 422 && attempt < conflictRetries) {
      // Non-fast-forward conflict — re-read HEAD and retry
      console.warn(
        JSON.stringify({
          ts: new Date().toISOString(),
          event: "github_conflict_retry",
          attempt: attempt + 1,
        })
      );
      await sleep(500 + Math.random() * 500);
      continue;
    }

    throw new Error(`GitHub ref update failed: ${patchRes.status}`);
  }
}
