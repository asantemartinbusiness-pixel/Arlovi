import { describe, expect, it } from "vitest";
import "@/domain/seeds/flagshipCollective";
import "@/domain/seeds/flagshipLighthouse";
import { collectSeedsByContributor } from "@/domain/seedRegistry";
import { SEED_NOW } from "@/domain/types";
import { listedPortals, portalDocuments, portalForRole, resolvePortal, sharedRecords, type PortalBody, type usePortalData } from "@/applications/portal/data";

const contributors=collectSeedsByContributor(SEED_NOW);
const core=contributors.find(c=>c.key==="flagship-collective");
const review=contributors.find(c=>c.key==="flagship-lighthouse-review");
const all=[...(core?.records??[]),...(review?.records??[])];
const get=(id:string)=>all.find(record=>record.id===id);

describe("Lighthouse Hotels / linked review workflow",()=>{
  it("adds only new deterministic identifiers and leaves core user-editable records intact",()=>{
    expect(review).toBeDefined();
    expect(review!.records.length).toBeGreaterThanOrEqual(22);
    expect(new Set(review!.records.map(r=>r.id)).size).toBe(review!.records.length);
    expect(review!.records.every(r=>r.id.endsWith("-1600")||Number(r.id.split("-").at(-1))>=1600)).toBe(true);
    expect(review!.records.every(r=>r.organizationId==="org-northline-collective"&&r.fields.fictional===true)).toBe(true);
    expect(review!.records.every(r=>r.fields.externalState==="not_connected")).toBe(true);
    expect(get("nl-projects-900")).toBeDefined();
    expect(get("nl-deals-910")).toBeDefined();
    expect(get("nl-designs-911")).toBeUndefined(); // Studio contributor is loaded separately
  });
  it("replaces the Lighthouse concept stub by a real draft portal without publishing or inviting anyone",()=>{
    const portal=get("nl-portals-1600")!;
    const stub=get("nl-portals-900")!;
    const body=portal.body as PortalBody & {releaseGates:{scopeReviewed:boolean;clientApproved:boolean;invitationSent:boolean}};
    expect(portal.status).toBe("draft");
    expect(portal.fields.canonicalFor).toBe(stub.id);
    expect(resolvePortal(stub.id,[stub,portal])?.id).toBe(portal.id);
    expect(listedPortals([stub,portal]).map(r=>r.id)).toEqual([portal.id]);
    expect(body.pages).toHaveLength(5);
    expect(body.users).toEqual([]);
    expect(portal.fields.externalUsers).toBe(0);
    expect(portal.fields.invitesPending).toBe(0);
    expect(portal.fields.visits90d).toBe(0);
    expect(body.releaseGates).toEqual({scopeReviewed:false,clientApproved:false,invitationSent:false});
    const shared=body.shared??[];
    expect(shared).toHaveLength(1);
    expect(shared[0].collection).toBe("documents");
    expect(shared[0].ids).toHaveLength(3);
    expect(shared[0].ids.every(id=>Boolean(get(id)))).toBe(true);
    expect(shared.some(scope=>scope.collection==="invoices"||scope.collection==="purchaseOrders")).toBe(false);
    expect(portalForRole("client",[stub,portal],"Sofia Reed",all.filter(r=>r.collection==="contacts"))).toBeUndefined();
  });
  it("exposes only explicitly named client documents in the portal model",()=>{
    const portal=get("nl-portals-1600")!;
    const data={
      orders:[],invoices:[get("nl-invoices-900")!],bookings:[],
      documents:all.filter(r=>r.collection==="documents"),purchaseOrders:[get("nl-purchaseOrders-900")!],
      returns:[],portals:[portal],messages:[],contacts:[get("nl-contacts-910")!],
    } as unknown as ReturnType<typeof usePortalData>;
    const shared=sharedRecords(portal,data);
    expect(shared).toHaveLength(3);
    expect(shared.every(item=>item.collection==="documents")).toBe(true);
    expect(shared.every(item=>item.record.fields.portalId===portal.id)).toBe(true);
    expect(portalDocuments(portal,data.documents)).toHaveLength(3);
  });
  it("connects tasks, approval gates and purchasing to the one Lighthouse project",()=>{
    const gates=review!.records.filter(r=>r.collection==="approvals");
    const work=review!.records.filter(r=>r.collection==="tasks");
    expect(gates).toHaveLength(5);
    expect(work).toHaveLength(8);
    expect(gates.every(r=>r.status==="pending"&&r.fields.projectId==="nl-projects-900")).toBe(true);
    expect(work.every(r=>r.fields.projectId==="nl-projects-900"&&r.parentId==="nl-projects-900")).toBe(true);
    const req=get("nl-requisitions-1600");
    expect(req?.fields.supplierId).toBe("nl-suppliers-900");
    expect(req?.fields.purchaseOrderId).toBe("nl-purchaseOrders-900");
    expect(req?.fields.receiptState).toBe("not_received");
    expect(get("nl-risks-1600")?.status).toBe("open");
    expect(get("nl-risks-1601")?.status).toBe("open");
  });
});
