/**
 * lib/agent/publishingSchedule.ts
 *
 * Smart Publishing Cadence — what a senior SEO does with a calendar.
 *
 * Strategy:
 *   - Day 0 of cluster:  Pillar post (broad keyword, comprehensive)
 *   - Days 1-3:          High-priority cluster posts (long-tail)
 *   - Days 4-7:          Remaining cluster posts
 *   - After cluster:     Move to next cluster
 *
 * Daily decision is made based on:
 *   1. Current day-of-week (controls cadence)
 *   2. Last published post (don't dump 2 cluster posts same day)
 *   3. Active cluster status
 *
 * Posting random keywords daily ≠ ranking.
 * Building a topic cluster over 7 days → Google notices → ranks the whole site.
 */

import type { TopicCluster } from "./topicCluster";

export type ScheduleAction = "publish-pillar" | "publish-cluster" | "refresh-existing" | "rest";

export interface ScheduleDecision {
  action:        ScheduleAction;
  targetKeyword?: string;
  clusterId?:    string;
  isPillar?:     boolean;
  reason:        string;
  cadence: {
    dayOfWeek:    string;
    publishesToday: boolean;
    nextRun:      string;     // human-readable, e.g. "tomorrow at 02:00 UTC"
  };
}

// ─── Schedule rules ──────────────────────────────────────────────────────────

/**
 * Decide what to do today based on:
 *  - day of week (Sun=rest, Mon-Fri=publish, Sat=refresh)
 *  - active clusters
 *  - last post timestamp
 *
 * @param clusters       - all topic clusters
 * @param lastPublishAt  - ISO timestamp of last blog publish
 * @param now            - current Date (for testing)
 */
export function decideSchedule(
  clusters: TopicCluster[],
  lastPublishAt: string | null,
  now: Date = new Date(),
): ScheduleDecision {
  const dayIdx = now.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const dayName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dayIdx];

  const hoursSinceLastPublish = lastPublishAt
    ? (now.getTime() - new Date(lastPublishAt).getTime()) / (1000 * 60 * 60)
    : Infinity;

  // ── Sunday: REST (let Google index, no new posts) ────────────────────────
  if (dayIdx === 0) {
    return {
      action: "rest",
      reason: "Sunday — pause posting. Lets Google index recent posts and prevents content overload.",
      cadence: {
        dayOfWeek:      dayName,
        publishesToday: false,
        nextRun:        "Monday 02:00 UTC",
      },
    };
  }

  // ── Saturday: REFRESH only (no new posts) ────────────────────────────────
  if (dayIdx === 6) {
    return {
      action: "refresh-existing",
      reason: "Saturday — refresh decayed posts instead of publishing new ones.",
      cadence: {
        dayOfWeek:      dayName,
        publishesToday: false,
        nextRun:        "Monday 02:00 UTC",
      },
    };
  }

  // ── Don't post twice in 18 hours (avoids burst publishing) ──────────────
  if (hoursSinceLastPublish < 18) {
    return {
      action: "rest",
      reason: `Last post was ${hoursSinceLastPublish.toFixed(1)}h ago — minimum gap is 18h. Skipping.`,
      cadence: {
        dayOfWeek:      dayName,
        publishesToday: false,
        nextRun:        "tomorrow 02:00 UTC",
      },
    };
  }

  // ── Pillar-first strategy ────────────────────────────────────────────────
  // If any cluster is missing a pillar, write that first
  const pillarNeeded = clusters.find((c) => c.status === "pillar-needed");
  if (pillarNeeded) {
    return {
      action:        "publish-pillar",
      targetKeyword: pillarNeeded.pillarKeyword,
      clusterId:     pillarNeeded.id,
      isPillar:      true,
      reason:        `Cluster "${pillarNeeded.theme}" has ${pillarNeeded.totalKeywords} keywords but no pillar yet. Pillar first.`,
      cadence: {
        dayOfWeek:      dayName,
        publishesToday: true,
        nextRun:        "tomorrow 02:00 UTC",
      },
    };
  }

  // ── Cluster expansion: pick least-covered cluster ────────────────────────
  const expanding = clusters
    .filter((c) => c.status === "expanding")
    .sort((a, b) => {
      const ar = a.writtenCount / a.totalKeywords;
      const br = b.writtenCount / b.totalKeywords;
      return ar - br;
    });

  for (const cluster of expanding) {
    const nextKw = cluster.clusterKeywords.find((c) => !c.written);
    if (nextKw) {
      return {
        action:        "publish-cluster",
        targetKeyword: nextKw.keyword,
        clusterId:     cluster.id,
        isPillar:      false,
        reason:        `Cluster "${cluster.theme}" is ${cluster.writtenCount}/${cluster.totalKeywords} done. Adding next cluster post.`,
        cadence: {
          dayOfWeek:      dayName,
          publishesToday: true,
          nextRun:        "tomorrow 02:00 UTC",
        },
      };
    }
  }

  // ── All clusters complete — refresh existing content ─────────────────────
  return {
    action: "refresh-existing",
    reason: "All clusters complete. Switching to refresh mode for content decay prevention.",
    cadence: {
      dayOfWeek:      dayName,
      publishesToday: false,
      nextRun:        "tomorrow 02:00 UTC",
    },
  };
}

// ─── Weekly summary for admin dashboard ──────────────────────────────────────

export interface WeeklyPlan {
  thisWeek: Array<{
    day:    string;
    action: ScheduleAction;
    target: string;
  }>;
  upcomingPillars:   string[];
  upcomingClusters:  number;
}

export function buildWeeklyPlan(clusters: TopicCluster[]): WeeklyPlan {
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const today = new Date();
  const todayIdx = today.getUTCDay();

  const thisWeek: WeeklyPlan["thisWeek"] = [];
  const remainingPillars: string[] = clusters
    .filter((c) => c.status === "pillar-needed")
    .map((c) => c.pillarKeyword);

  // Build virtual queue of unwritten cluster keywords across clusters
  const clusterQueue: Array<{ kw: string; cluster: string }> = [];
  for (const cluster of clusters.filter((c) => c.status === "expanding")) {
    for (const c of cluster.clusterKeywords.filter((c) => !c.written)) {
      clusterQueue.push({ kw: c.keyword, cluster: cluster.theme });
    }
  }

  for (let i = 0; i < 7; i++) {
    const idx = (todayIdx + i) % 7;
    const day = dayNames[idx];

    if (idx === 0)      thisWeek.push({ day, action: "rest", target: "—" });
    else if (idx === 6) thisWeek.push({ day, action: "refresh-existing", target: "decayed posts" });
    else if (remainingPillars.length > 0) {
      thisWeek.push({ day, action: "publish-pillar", target: remainingPillars.shift()! });
    } else if (clusterQueue.length > 0) {
      const next = clusterQueue.shift()!;
      thisWeek.push({ day, action: "publish-cluster", target: `${next.kw} (${next.cluster})` });
    } else {
      thisWeek.push({ day, action: "refresh-existing", target: "decayed posts" });
    }
  }

  return {
    thisWeek,
    upcomingPillars:  clusters.filter((c) => c.status === "pillar-needed").map((c) => c.pillarKeyword),
    upcomingClusters: clusters.filter((c) => c.status === "expanding").length,
  };
}
