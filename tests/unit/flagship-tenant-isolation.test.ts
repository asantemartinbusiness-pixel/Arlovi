import { describe, expect, it } from "vitest";
import "@/domain/seeds/flagshipOrganization";
import "@/domain/seeds/flagshipCollective";
import "@/domain/seeds/flagshipStudio";
import "@/domain/seeds/flagshipOperations";
import "@/domain/seeds/flagshipLighthouse";
import { buildSeed } from "@/domain/seed";
import { collectSeedsByContributor } from "@/domain/seedRegistry";
import { ORG_COLLECTIVE, ORG_HARBOR, ORG_NORTHLINE, SEED_NOW, orgFromSlug, slugFor } from "@/domain/types";
import { orgBySlug } from "@/platform/org";

const flagship=collectSeedsByContributor(SEED_NOW).filter(group=>group.key.startsWith("flagship-"));
const flagshipRecords=flagship.flatMap(group=>group.records);
const base=buildSeed().records;

describe("independent Northline Collective browser-local company",()=>{
  it("resolves as a third business without changing the original company identities",()=>{
    expect(orgBySlug("northline")?.id).toBe(ORG_NORTHLINE);
    expect(orgBySlug("harbor")?.id).toBe(ORG_HARBOR);
    const collective=orgBySlug("collective");
    expect(collective?.id).toBe(ORG_COLLECTIVE);
    expect(collective?.name).toBe("Northline Collective");
    expect(collective?.currency).toBe("GBP");
    expect(collective?.registration).toBeUndefined();
    expect(orgFromSlug("collective")).toBe(ORG_COLLECTIVE);
    expect(slugFor(ORG_COLLECTIVE)).toBe("collective");
  });
  it("assigns all flagship records and audit events to Collective only",()=>{
    expect(flagship).toHaveLength(5);
    expect(flagshipRecords.length).toBeGreaterThan(500);
    expect(new Set(flagshipRecords.map(record=>record.id)).size).toBe(flagshipRecords.length);
    expect(flagshipRecords.every(record=>record.organizationId===ORG_COLLECTIVE)).toBe(true);
    expect(flagship.flatMap(group=>group.events).every(event=>event.organizationId===ORG_COLLECTIVE)).toBe(true);
    expect(flagshipRecords.filter(record=>record.collection!=="organizations")
      .every(record=>record.fields.flagship==="Northline Collective")).toBe(true);
  });
  it("has a distinct seeded organisation record without pretending incorporation",()=>{
    const record=flagshipRecords.find(r=>r.id===ORG_COLLECTIVE);
    expect(record?.collection).toBe("organizations");
    expect(record?.fields.slug).toBe("collective");
    expect(record?.fields.legalEntityVerified).toBe(false);
    expect(record?.fields.fictional).toBe(true);
  });
  it("does not remove or overwrite legacy Atelier/Harbor demonstration records",()=>{
    expect(base.some(record=>record.organizationId===ORG_NORTHLINE)).toBe(true);
    expect(base.some(record=>record.organizationId===ORG_HARBOR)).toBe(true);
    expect(base.some(record=>record.organizationId===ORG_COLLECTIVE)).toBe(false);
    const baseIds=new Set(base.map(record=>record.id));
    expect(flagshipRecords.every(record=>!baseIds.has(record.id))).toBe(true);
  });
});
