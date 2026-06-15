/**
 * lib/niche/registry.ts
 *
 * Resolves the active NichePack. A deployment selects its niche with the
 * SITE_NICHE_PACK env var (default "fbr-pos" — the original site, so existing
 * deployments keep working with zero changes).
 *
 * Adding a niche = add a pack file + one line here. That's the whole onboarding.
 */

import type { NichePack } from "./types";
import { fbrPosPack } from "./packs/fbr-pos";
import { sportsPack } from "./packs/sports";

const PACKS: Record<string, NichePack> = {
  "fbr-pos": fbrPosPack,
  sports: sportsPack,
};

const DEFAULT_PACK_ID = "fbr-pos";

/** The pack this deployment runs as. */
export function getActivePack(): NichePack {
  const id = process.env.SITE_NICHE_PACK ?? DEFAULT_PACK_ID;
  const pack = PACKS[id];
  if (!pack) {
    console.warn(
      JSON.stringify({
        ts: new Date().toISOString(),
        event: "niche_pack_not_found",
        requested: id,
        fallback: DEFAULT_PACK_ID,
      })
    );
    return PACKS[DEFAULT_PACK_ID];
  }
  return pack;
}

export function getPack(id: string): NichePack | null {
  return PACKS[id] ?? null;
}

export function listPackIds(): string[] {
  return Object.keys(PACKS);
}
