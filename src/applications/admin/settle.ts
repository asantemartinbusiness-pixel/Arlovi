/* ====================================================================== *
 * Whether every application's fixtures reached the store. Pure, so the
 * privacy register's "complete or not" rule can be tested on its own.
 * ====================================================================== */

export type SeedStatus = "loading" | "settled" | "failed";

/**
 * Run the fixture load and report how it ended. A rejected load is "failed",
 * never "settled": counts, exports and erasures must not run on a partial set.
 */
export async function settleSeeds(load: () => Promise<unknown>): Promise<SeedStatus> {
  try {
    await load();
    return "settled";
  } catch {
    return "failed";
  }
}
