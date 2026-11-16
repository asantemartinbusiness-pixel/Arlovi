import { ORG_HARBOR, ORG_NORTHLINE } from "@/domain/types";

export interface OrgProfile {
  id: string;
  slug: string;
  name: string;
  shortName: string;
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
