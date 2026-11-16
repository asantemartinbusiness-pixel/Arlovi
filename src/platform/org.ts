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
];

export function orgBySlug(slug: string | undefined): OrgProfile | undefined {
  return ORGS.find((org) => org.slug === slug);
}

export function orgById(id: string | undefined): OrgProfile | undefined {
  return ORGS.find((org) => org.id === id);
}
