/**
 * lib/agent/costGuard.ts
 *
 * Token-budget enforcement for Groq API calls.
 *
 * Tracks token usage per action in data/costs.json (stored in GitHub).
 * The agent checks this guard BEFORE calling Groq to avoid runaway spend.
 *
 * Default monthly budget: 5,000,000 tokens (~$2.50 at llama-3 pricing).
 * Override with env var: MONTHLY_TOKEN_BUDGET=<number>
 */

import type { CostData, CostEntry } from "@/lib/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_MONTHLY_BUDGET = 5_000_000;

// ─── Budget helpers ───────────────────────────────────────────────────────────

/** Return the current month key "YYYY-MM" */
function monthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

/** Return the monthly token budget from env or default */
export function getMonthlyBudget(): number {
  const env = process.env.MONTHLY_TOKEN_BUDGET;
  if (env) {
    const n = parseInt(env, 10);
    if (!isNaN(n) && n > 0) return n;
  }
  return DEFAULT_MONTHLY_BUDGET;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Check whether the current month's token spend is under budget.
 * Returns true  → safe to proceed with generation.
 * Returns false → budget exceeded, must skip.
 */
export function isUnderBudget(costs: CostData): boolean {
  const key    = monthKey();
  const used   = costs.monthly[key]?.tokens ?? 0;
  const budget = costs.monthlyTokenBudget ?? getMonthlyBudget();
  return used < budget;
}

/**
 * How many tokens remain this month.
 */
export function tokensRemaining(costs: CostData): number {
  const key    = monthKey();
  const used   = costs.monthly[key]?.tokens ?? 0;
  const budget = costs.monthlyTokenBudget ?? getMonthlyBudget();
  return Math.max(0, budget - used);
}

/**
 * Record a Groq call in the cost data.
 * Returns the updated CostData (caller must persist to GitHub).
 */
export function recordUsage(
  costs: CostData,
  entry: Omit<CostEntry, "ts">
): CostData {
  const key      = monthKey();
  const ts       = new Date().toISOString();
  const newEntry: CostEntry = { ts, ...entry };

  const monthStats = costs.monthly[key] ?? { tokens: 0, calls: 0 };
  const updated: CostData = {
    ...costs,
    entries: [...costs.entries, newEntry],
    monthly: {
      ...costs.monthly,
      [key]: {
        tokens: monthStats.tokens + entry.totalTokens,
        calls:  monthStats.calls  + 1,
      },
    },
  };

  // Trim entries to most recent 1000
  if (updated.entries.length > 1000) {
    updated.entries = updated.entries.slice(-1000);
    updated.lastTrimmedAt = ts;
  }

  return updated;
}

/**
 * Build a default empty CostData object.
 */
export function defaultCostData(): CostData {
  return {
    entries:            [],
    monthly:            {},
    monthlyTokenBudget: getMonthlyBudget(),
    lastTrimmedAt:      null,
  };
}

/**
 * Estimate token counts from prompt and completion strings.
 * Uses ~4 chars/token heuristic (no external tokenizer needed).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Return a human-readable budget status summary.
 */
export function budgetSummary(costs: CostData): string {
  const key     = monthKey();
  const used    = costs.monthly[key]?.tokens ?? 0;
  const calls   = costs.monthly[key]?.calls  ?? 0;
  const budget  = costs.monthlyTokenBudget ?? getMonthlyBudget();
  const pct     = ((used / budget) * 100).toFixed(1);
  return `${used.toLocaleString()}/${budget.toLocaleString()} tokens used this month (${pct}%, ${calls} calls)`;
}
