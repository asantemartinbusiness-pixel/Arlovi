/**
 * Session-scoped cross-application wayfinding.
 *
 * Stores only route URLs (including tabs/filters) for this organisation and
 * browser tab; no form values, credentials, or records are copied here.
 * Navigation backtracking is distinct from the browser's actual history.
 */
export interface JourneyEntry { app: string; url: string }
export interface AppJourney { trail: JourneyEntry[]; byApp: Record<string, string> }

const MAX_TRAIL = 18;
const MAX_PATH = 1600;
const EMPTY = (): AppJourney => ({ trail: [], byApp: {} });

const validApp = (value: unknown): value is string =>
  typeof value === "string" && /^(?:[A-Z][A-Z0-9_-]*|WS:(?:home|company|spaces|work|apps))$/.test(value);

export function scopedJourneyUrl(url: string, slug: string): boolean {
  if (typeof url !== "string" || url.length > MAX_PATH) return false;
  // Avoid untrusted control bytes or Windows path separators without a regex
  // control range (which is intentionally rejected by ESLint).
  if (url.includes("\\") || [...url].some(char => char.charCodeAt(0) < 32)) return false;
  const prefix = `/o/${slug}/`;
  if (!url.startsWith(prefix)) return false;
  try {
    const parsed = new URL(url, "https://arlovi.local");
    return parsed.origin === "https://arlovi.local"
      && parsed.pathname.startsWith(prefix)
      && !parsed.pathname.includes("//")
      && !parsed.pathname.includes("/../")
      && !parsed.pathname.includes("/./");
  } catch { return false; }
}
export function emptyJourney(): AppJourney { return EMPTY(); }

/** Route changes inside one app update its saved position; crossing apps
 * creates a return step. Landing on the exact preceding route pops that step. */
export function advanceJourney(state: AppJourney, slug: string, app: string, url: string): AppJourney {
  if (!validApp(app) || !scopedJourneyUrl(url, slug)) return state;
  const trail = [...state.trail];
  const last = trail[trail.length - 1];
  const prior = trail[trail.length - 2];
  if (last?.app === app) {
    trail[trail.length - 1] = { app, url };
  } else if (prior?.app === app && prior.url === url) {
    trail.pop();
  } else {
    trail.push({ app, url });
  }
  const byApp = { ...state.byApp, [app]: url };
  return { trail: trail.slice(-MAX_TRAIL), byApp };
}
export function previousJourney(state: AppJourney): JourneyEntry | null {
  return state.trail.length > 1 ? state.trail[state.trail.length - 2] : null;
}
export function rememberedAppRoute(state: AppJourney, slug: string, app: string): string | null {
  const url = state.byApp[app];
  return validApp(app) && url && scopedJourneyUrl(url, slug) ? url : null;
}
function sessionKey(scope: string): string {
  return `arlovi-app-journey-v1:${encodeURIComponent(scope)}`;
}
export function readAppJourney(scope: string, slug: string): AppJourney {
  try {
    if (typeof sessionStorage === "undefined") return EMPTY();
    const raw = sessionStorage.getItem(sessionKey(scope));
    if (!raw) return EMPTY();
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object") return EMPTY();
    const candidate = data as Partial<AppJourney>;
    const trail = Array.isArray(candidate.trail)
      ? candidate.trail.filter((entry): entry is JourneyEntry =>
          Boolean(entry && validApp(entry.app) && scopedJourneyUrl(entry.url, slug))).slice(-MAX_TRAIL)
      : [];
    const byApp: Record<string, string> = {};
    if (candidate.byApp && typeof candidate.byApp === "object") {
      for (const [app, url] of Object.entries(candidate.byApp)) {
        if (validApp(app) && typeof url === "string" && scopedJourneyUrl(url, slug)) {
          byApp[app] = url;
        }
      }
    }
    return { trail, byApp };
  } catch { return EMPTY(); }
}
export function recordAppJourney(scope: string, slug: string, app: string, url: string): AppJourney {
  const previous = readAppJourney(scope, slug);
  const next = advanceJourney(previous, slug, app, url);
  if (next === previous) return previous;
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(sessionKey(scope), JSON.stringify(next));
    }
  } catch { /* In-memory return bar still works if browser storage is disabled. */ }
  return next;
}
