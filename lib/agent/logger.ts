/**
 * lib/agent/logger.ts
 *
 * Structured logging for the SEO Agent.
 *
 * - Logs to console (always) → visible in Vercel function logs
 * - Appends to data/logs.json on GitHub (included in each atomic commit)
 * - Rotates: keeps last MAX_LOG_ENTRIES entries
 *
 * Usage:
 *   const logger = createLogger("phelix-erp")
 *   logger.log("blog_generated", "info", { slug, words, source })
 *   const entries = logger.flush()   // returns entries to include in commit
 */

import type { LogEntry, LogEvent, LogsData } from "@/lib/types";

const MAX_LOG_ENTRIES = 500;

// ─── ID generator (no dependency needed) ─────────────────────────────────────

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Logger class ─────────────────────────────────────────────────────────────

export class AgentLogger {
  private readonly site: string;
  private readonly startTime: number;
  private buffer: LogEntry[] = [];
  private existing: LogEntry[] = [];

  constructor(site: string, existingEntries: LogEntry[] = []) {
    this.site      = site;
    this.startTime = Date.now();
    this.existing  = existingEntries;
  }

  log(
    event: LogEvent,
    level: "info" | "warn" | "error",
    details?: {
      keyword?: string;
      slug?: string;
      words?: number;
      source?: "groq" | "template";
      success?: boolean;
      durationMs?: number;
      [key: string]: unknown;
    }
  ): void {
    const entry: LogEntry = {
      id:      makeId(),
      ts:      new Date().toISOString(),
      site:    this.site,
      event,
      level,
      success: details?.success ?? level !== "error",
      ...(details?.keyword   ? { keyword:    details.keyword }   : {}),
      ...(details?.slug      ? { slug:       details.slug }      : {}),
      ...(details?.words     ? { words:      details.words }     : {}),
      ...(details?.source    ? { source:     details.source }    : {}),
      ...(details?.durationMs ? { durationMs: details.durationMs } : {}),
    };

    // Extract extra fields into details
    const extraKeys = Object.keys(details ?? {}).filter(
      (k) => !["keyword", "slug", "words", "source", "success", "durationMs"].includes(k)
    );
    if (extraKeys.length > 0) {
      entry.details = Object.fromEntries(
        extraKeys.map((k) => [k, (details as Record<string, unknown>)[k]])
      );
    }

    this.buffer.push(entry);

    // Always log to stdout for Vercel function logs
    const msg = { ...entry };
    if (level === "error") console.error(JSON.stringify(msg));
    else if (level === "warn") console.warn(JSON.stringify(msg));
    else console.log(JSON.stringify(msg));
  }

  info(event: LogEvent, details?: Parameters<AgentLogger["log"]>[2]) {
    this.log(event, "info", details);
  }

  warn(event: LogEvent, details?: Parameters<AgentLogger["log"]>[2]) {
    this.log(event, "warn", { success: false, ...details });
  }

  error(event: LogEvent, details?: Parameters<AgentLogger["log"]>[2]) {
    this.log(event, "error", { success: false, ...details });
  }

  /**
   * Merge buffered entries with existing log, trim to MAX_LOG_ENTRIES,
   * and return the LogsData ready to be committed to GitHub.
   */
  flushToLogsData(): LogsData {
    const merged = [...this.existing, ...this.buffer];
    const trimmed = merged.slice(-MAX_LOG_ENTRIES);
    return {
      entries: trimmed,
      lastTrimmedAt:
        merged.length > MAX_LOG_ENTRIES ? new Date().toISOString() : null,
    };
  }

  /** Total elapsed ms since logger was created */
  elapsed(): number {
    return Date.now() - this.startTime;
  }

  /** Return buffered entries (for inline use without GitHub commit) */
  getBuffer(): LogEntry[] {
    return [...this.buffer];
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createLogger(site: string, existing: LogEntry[] = []): AgentLogger {
  return new AgentLogger(site, existing);
}

// ─── Standalone console-only logger (for API routes without GitHub access) ────

export function consoleLog(
  route: string,
  level: "info" | "warn" | "error",
  message: string,
  data?: unknown
): void {
  const entry = {
    ts:    new Date().toISOString(),
    route,
    level,
    message,
    ...(data ? { data } : {}),
  };
  if (level === "error") console.error(JSON.stringify(entry));
  else if (level === "warn") console.warn(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}
