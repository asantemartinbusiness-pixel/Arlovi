import { describe,expect,it } from "vitest";
import "@/domain/seeds/flagshipOperations";
import { NORTHLINE_COLLECTIVE_IDENTITY } from "@/domain/flagship/identity";
import { NORTHLINE_FLAGSHIP_SCENARIO_MONTHS } from "@/domain/seeds/flagshipOperations";
import { collectSeedsByContributor } from "@/domain/seedRegistry";
import { ORG_COLLECTIVE,SEED_NOW } from "@/domain/types";

const group=collectSeedsByContributor(SEED_NOW).find(item=>item.key==="flagship-operations");
const records=group?.records??[];

describe("Northline Collective / identity and operations scenario",()=>{
  it("uses the canonical paper-and-acid identity instead of the previous moss and bronze theme",()=>{
    expect(NORTHLINE_COLLECTIVE_IDENTITY.palette.acid).toBe("#dfff3f");
    expect(NORTHLINE_COLLECTIVE_IDENTITY.palette.violet).toBe("#7e57ff");
    expect(NORTHLINE_COLLECTIVE_IDENTITY.palette.canvas).toBe("#f3f0e8");
    expect(NORTHLINE_COLLECTIVE_IDENTITY.typography.display.font).toBe("Manrope");
    expect(NORTHLINE_COLLECTIVE_IDENTITY.typography.displayItalic.font).toBe("Newsreader");
  });
  it("creates twelve months of transparently fictional scenario revenue totalling £9.6m",()=>{
    expect(NORTHLINE_FLAGSHIP_SCENARIO_MONTHS.length).toBe(12);
    expect(NORTHLINE_FLAGSHIP_SCENARIO_MONTHS.reduce((sum,month)=>sum+month,0)).toBe(9_600_000);
    const months=records.filter(record=>record.collection==="datasets");
    expect(months).toHaveLength(12);
    expect(new Set(months.map(record=>String(record.fields.period))).size).toBe(12);
    for(const month of months){
      const total=Number(month.fields.commerceMinor)+Number(month.fields.servicesMinor)+Number(month.fields.experienceMinor);
      expect(total).toBe(month.fields.scenarioRevenueMinor);
    }
  });
  it("keeps financial records unposted and protects against fake external evidence",()=>{
    expect(records.length).toBeGreaterThan(400);
    expect(new Set(records.map(record=>record.id)).size).toBe(records.length);
    expect(records.every(record=>record.organizationId===ORG_COLLECTIVE)).toBe(true);
    expect(records.every(record=>record.fields.fictional===true&&record.fields.scenarioOnly===true)).toBe(true);
    expect(records.every(record=>record.fields.ledgerPosted===false&&record.fields.externalState==="not_connected")).toBe(true);
    for(const record of records.filter(record=>["invoices","bills","expenses","purchaseOrders"].includes(record.collection))){
      expect(record.status).toBe("draft");
    }
  });
  it("models customer-to-invoice and requisition-to-PO-to-bill references",()=>{
    const all=new Set(records.map(record=>record.id));
    const invoice=records.find(record=>record.id==="nl-invoices-1200");
    expect(invoice?.status).toBe("draft");
    expect(invoice?.fields.companyId).toBe("nl-companies-910");
    expect(invoice?.fields.contactId).toBe("nl-contacts-910");
    const po=records.find(record=>record.id==="nl-purchaseOrders-1200");
    const bill=records.find(record=>record.id==="nl-bills-1200");
    expect(po?.fields.requisitionId).toBe("nl-requisitions-1200");
    expect(all.has(String(po?.fields.requisitionId))).toBe(true);
    expect(bill?.fields.purchaseOrderId).toBe(po?.id);
    expect(bill?.fields.paymentStatus).toBe("not_paid");
  });
});
