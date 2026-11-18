/**
 * Arlovi interface scaling v2.
 *
 * The former 80% setting is the new 100% visual baseline.
 * The visible slider is 0–100, but its lower stop is deliberately a usable
 * non-zero 60% of the original token dimensions; never render at CSS scale 0.
 */
export const SCALE_VERSION = 2;
export const SCALE_MIN = 0;
export const SCALE_MAX = 100;
export const SCALE_STEP = 5;
export const SCALE_DEFAULT = 100;
export const OLD_VISUAL_BASELINE = 0.8;
export const MIN_VISUAL_SCALE = 0.6;

export function normaliseInterfaceScale(value: number): number {
  if (!Number.isFinite(value)) return SCALE_DEFAULT;
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN,
    Math.round(value / SCALE_STEP) * SCALE_STEP));
}

export function effectiveInterfaceScale(value: number): number {
  const normalised = normaliseInterfaceScale(value);
  return MIN_VISUAL_SCALE + (OLD_VISUAL_BASELINE - MIN_VISUAL_SCALE) * normalised / 100;
}

/**
 * Unversioned persisted settings are old values 75–150. 75 is preserved at
 * the new 75, old 80 becomes new 100, and higher old scales cap at the new
 * default. A v2 setting must never be migrated again.
 */
export function readInterfaceScale(value: unknown, version: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return SCALE_DEFAULT;
  if (version === SCALE_VERSION) return normaliseInterfaceScale(value);
  if (value >= 75 && value <= 150) {
    return normaliseInterfaceScale((Math.min(value, OLD_VISUAL_BASELINE * 100) / 100
      - MIN_VISUAL_SCALE) / (OLD_VISUAL_BASELINE - MIN_VISUAL_SCALE) * 100);
  }
  return SCALE_DEFAULT;
}
