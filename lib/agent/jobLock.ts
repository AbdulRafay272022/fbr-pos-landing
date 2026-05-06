/**
 * lib/agent/jobLock.ts
 *
 * Distributed job lock stored in data/meta.json on GitHub.
 *
 * Pattern:
 *   1. readMeta()           — read current state
 *   2. isLocked(meta)       — check if another job is running
 *   3. acquireLock(meta)    — write lock to GitHub
 *   4. ...do work...
 *   5. releaseLock(meta)    — clear lock + update stats in one commit
 *
 * Safety: lock has a TTL (LOCK_TTL_MS). If a serverless function dies mid-run
 * without releasing, the lock auto-expires and the next invocation can proceed.
 *
 * The meta.json is read/written via atomic GitHub commits so the lock
 * is consistent even under concurrent Vercel invocations.
 */

import { readJsonFromGitHub, atomicCommit } from "@/lib/githubApi";
import type { MetaJson, AgentStats } from "@/lib/types";
import type { GitHubConfig } from "./siteConfig";

// Lock expires after 8 minutes (Vercel max function timeout is 10 min on Pro)
const LOCK_TTL_MS = 8 * 60 * 1000;

// ─── Default meta ─────────────────────────────────────────────────────────────

export function defaultMeta(): MetaJson {
  return {
    lastTopicIndex: -1,
    agent: {
      isRunning: false,
      lockedAt:  null,
      lockedBy:  null,
    },
    stats: {
      lastScrapeAt:        null,
      lastGenerateAt:      null,
      lastUpdateAt:        null,
      blogsGeneratedTotal: 0,
      blogsUpdatedTotal:   0,
      keywordsUsedTotal:   0,
    },
  };
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function readMeta(gh: GitHubConfig): Promise<MetaJson> {
  const raw = await readJsonFromGitHub<Partial<MetaJson>>(
    "data/meta.json", gh.token, gh.owner, gh.repo
  );

  if (!raw) return defaultMeta();

  // Merge with defaults so new fields always exist
  return {
    lastTopicIndex: raw.lastTopicIndex ?? -1,
    agent: {
      isRunning: raw.agent?.isRunning ?? false,
      lockedAt:  raw.agent?.lockedAt  ?? null,
      lockedBy:  raw.agent?.lockedBy  ?? null,
    },
    stats: {
      lastScrapeAt:        raw.stats?.lastScrapeAt        ?? null,
      lastGenerateAt:      raw.stats?.lastGenerateAt      ?? null,
      lastUpdateAt:        raw.stats?.lastUpdateAt        ?? null,
      blogsGeneratedTotal: raw.stats?.blogsGeneratedTotal ?? 0,
      blogsUpdatedTotal:   raw.stats?.blogsUpdatedTotal   ?? 0,
      keywordsUsedTotal:   raw.stats?.keywordsUsedTotal   ?? 0,
    },
  };
}

// ─── Lock checks ──────────────────────────────────────────────────────────────

/**
 * Returns true if a valid (non-expired) lock exists.
 */
export function isLocked(meta: MetaJson): boolean {
  if (!meta.agent.isRunning || !meta.agent.lockedAt) return false;
  const age = Date.now() - new Date(meta.agent.lockedAt).getTime();
  return age < LOCK_TTL_MS;
}

/**
 * Returns the lock age in seconds, or -1 if not locked.
 */
export function lockAgeSeconds(meta: MetaJson): number {
  if (!meta.agent.lockedAt) return -1;
  return Math.round(
    (Date.now() - new Date(meta.agent.lockedAt).getTime()) / 1000
  );
}

// ─── Acquire / release ────────────────────────────────────────────────────────

/**
 * Write a running lock to meta.json on GitHub.
 * Uses a unique lockedBy string so logs are traceable.
 */
export async function acquireLock(
  meta: MetaJson,
  gh: GitHubConfig,
  lockedBy = `agent-${Date.now()}`
): Promise<MetaJson> {
  const updated: MetaJson = {
    ...meta,
    agent: {
      isRunning: true,
      lockedAt:  new Date().toISOString(),
      lockedBy,
    },
  };

  await atomicCommit(
    [{ path: "data/meta.json", content: JSON.stringify(updated, null, 2) }],
    "chore: agent lock acquired",
    gh.token, gh.owner, gh.repo, gh.branch
  );

  return updated;
}

/**
 * Clear the lock and update stats atomically.
 * Pass the same GitHubConfig so the commit goes to the right repo.
 */
export async function releaseLock(
  meta: MetaJson,
  statsUpdate: Partial<AgentStats>,
  extraFiles: Array<{ path: string; content: string }>,
  gh: GitHubConfig,
  commitMessage = "chore: agent lock released"
): Promise<void> {
  const updated: MetaJson = {
    ...meta,
    agent: {
      isRunning: false,
      lockedAt:  null,
      lockedBy:  null,
    },
    stats: {
      ...meta.stats,
      ...statsUpdate,
    },
  };

  const files = [
    { path: "data/meta.json", content: JSON.stringify(updated, null, 2) },
    ...extraFiles,
  ];

  await atomicCommit(files, commitMessage, gh.token, gh.owner, gh.repo, gh.branch);
}

// ─── Convenience: write meta without touching the lock ────────────────────────

export async function patchMeta(
  meta: MetaJson,
  patch: Partial<MetaJson>,
  extraFiles: Array<{ path: string; content: string }>,
  gh: GitHubConfig,
  message: string
): Promise<MetaJson> {
  const updated: MetaJson = {
    lastTopicIndex: patch.lastTopicIndex ?? meta.lastTopicIndex,
    agent: { ...meta.agent, ...patch.agent },
    stats: { ...meta.stats, ...patch.stats },
  };

  const files = [
    { path: "data/meta.json", content: JSON.stringify(updated, null, 2) },
    ...extraFiles,
  ];

  await atomicCommit(files, message, gh.token, gh.owner, gh.repo, gh.branch);
  return updated;
}
