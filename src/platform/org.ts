import { ORG_HARBOR, ORG_NORTHLINE } from "@/domain/types";
import { db } from "@/runtime/db";

export interface OrgProfile {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  /** Owner of a browser-local company; never inferred from another tenant's users. */
  ownerName?: string;
  currency: string;
  locale: string;
  timezone: string;
  /** Tax jurisdiction used by the tax engine — never inferred from currency. */
  jurisdiction: string;
  registration?: string;
  accent: string;
}

const LOCAL_ORGS_KEY = "arlovi-local-organizations-v1";

export const ORGS: OrgProfile[] = [
  {
    id: ORG_NORTHLINE,
    slug: "northline",
    name: "Northline Atelier",
    shortName: "Northline",
    currency: "GBP",
    locale: "en-GB",
    timezone: "Europe/London",
    jurisdiction: "GB",
    registration: "GB 418 2275 61",
    accent: "#234fe8",
  },
  {
    id: ORG_HARBOR,
    slug: "harbor",
    name: "Harbor Supply",
    shortName: "Harbor",
    currency: "USD",
    locale: "en-US",
    timezone: "America/New_York",
    jurisdiction: "US-NY",
    registration: "EIN 88-4410923",
    accent: "#0f8780",
  },
  ...loadLocalOrganizations(),
];

function loadLocalOrganizations(): OrgProfile[] {
  try {
    const value = typeof localStorage === "undefined" ? null : localStorage.getItem(LOCAL_ORGS_KEY);
    const parsed: unknown = value ? JSON.parse(value) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is OrgProfile => {
      if (!entry || typeof entry !== "object") return false;
      const item = entry as Partial<OrgProfile>;
      return typeof item.id === "string" && item.id.startsWith("org-")
        && typeof item.slug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug)
        && typeof item.name === "string" && item.name.length >= 2
        && (item.ownerName === undefined || typeof item.ownerName === "string")
        && typeof item.currency === "string" && typeof item.locale === "string"
        && typeof item.timezone === "string" && typeof item.jurisdiction === "string"
        && typeof item.accent === "string";
    });
  } catch {
    return [];
  }
}

/** A browser-local company catalogue, to be replaced by real tenant identity at backend integration. */
export function registerLocalOrganization(profile: OrgProfile): void {
  if (ORGS.some((existing) => existing.id === profile.id || existing.slug === profile.slug)) {
    throw new Error("An organization with that name or address already exists.");
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(profile.slug)) {
    throw new Error("The company address may contain lowercase letters, numbers and hyphens.");
  }
  if (typeof localStorage === "undefined") throw new Error("Local browser storage is unavailable.");
  const saved = loadLocalOrganizations();
  localStorage.setItem(LOCAL_ORGS_KEY, JSON.stringify([...saved, profile]));
  ORGS.push(profile);
}

export function isOrganizationSlugAvailable(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && !ORGS.some((profile) => profile.slug === slug);
}

export function orgBySlug(slug: string | undefined): OrgProfile | undefined {
  return ORGS.find((org) => org.slug === slug);
}

export function orgById(id: string | undefined): OrgProfile | undefined {
  return ORGS.find((org) => org.id === id);
}

/**
 * Reconstruct the browser-local company catalogue from durable workspace records.
 * localStorage is only a convenience index; the IndexedDB organization record is
 * authoritative. This repairs lost catalogue / last-workspace keys on startup
 * without creating a duplicate tenant or replaying onboarding.
 */
export async function recoverLocalOrganizations(): Promise<string | null> {
  const saved = await db.records.where("collection").equals("organizations").toArray();
  const local = saved
    .filter((record) => record.id.startsWith("org-") && typeof record.fields.slug === "string")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const recovered: OrgProfile[] = [];
  for (const record of local) {
    const slug = String(record.fields.slug);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) continue;
    const profile: OrgProfile = {
      id: record.id, slug, name: record.title,
      shortName: record.title.trim().split(" ")[0] || record.title,
      ownerName: record.ownerName,
      currency: record.currency,
      locale: String(record.fields.locale || "en-GB"),
      timezone: String(record.fields.timezone || "Europe/London"),
      jurisdiction: String(record.fields.jurisdiction || "GB"),
      accent: String(record.fields.brandAccent || "#234fe8"),
    };
    if (ORGS.some((org) => org.slug === slug && org.id !== record.id)) continue;
    if (!ORGS.some((org) => org.id === record.id)) ORGS.push(profile);
    recovered.push(profile);
  }
  // A last-workspace pointer can go stale independently of stored organization records.
  let selected: string | null = null;
  try { selected = localStorage.getItem("arlovi-last-workspace"); } catch { /* optional index */ }
  if (!selected || !orgBySlug(selected)) {
    selected = recovered[0]?.slug ?? null;
  }
  try {
    const existing = loadLocalOrganizations();
    const byId = new Map(existing.map((org) => [org.id, org]));
    for (const profile of recovered) byId.set(profile.id, profile);
    localStorage.setItem(LOCAL_ORGS_KEY, JSON.stringify([...byId.values()]));
    if (selected) localStorage.setItem("arlovi-last-workspace", selected);
  } catch { /* IndexedDB remains authoritative even if localStorage is unavailable */ }
  return selected;
}
