import { describe, expect, it } from "vitest";
import { ARCHIVE_FORMAT, sha256, summarizeLocalCompany, verifyCompanyArchive } from "@/platform/companyArchive";
import type { Audit, Rec } from "@/domain/types";

function row(id: string, collection: string, org = "org-alpha", parentId?: string): Rec {
  return { id, organizationId: org, collection, title: id, status: "active",
    ownerName:"Test",summary:"",currency:"GBP",tags:[],fields:{},parentId,
    createdAt:"2026-11-01T00:00:00.000Z",updatedAt:"2026-11-02T00:00:00.000Z",
    revision:1,createdBy:"Test",updatedBy:"Test",history:[] };
}
describe("portable company archive",()=>{
  it("summarises collections and unresolved parent IDs without mutating originals",()=>{
    const records=[row("a","tasks"),row("b","documents","org-alpha","a"),row("c","tasks","org-alpha","unknown")];
    const result=summarizeLocalCompany(records,[]);
    expect(result.recordCount).toBe(3);
    expect(result.collections).toEqual([{name:"tasks",count:2},{name:"documents",count:1}]);
    expect(result.unlinkedParentIds).toEqual(["unknown"]);
    expect(records[0].id).toBe("a");
  });
  it("verifies checksum and rejects tenant mixing or tampering",async()=>{
    const events:Audit[]=[];
    const payload={format:ARCHIVE_FORMAT,organization:{id:"org-alpha",slug:"alpha",name:"Alpha"},
      generatedAt:"2026-11-16T16:00:00.000Z",records:[row("one","documents")],events};
    const original={payload,sha256:await sha256(JSON.stringify(payload))};
    expect(await verifyCompanyArchive(original)).toEqual({valid:true});
    expect((await verifyCompanyArchive({...original,sha256:"0".repeat(64)})).valid).toBe(false);
    const foreign={...payload,records:[row("one","documents","org-other")]};
    expect((await verifyCompanyArchive({payload:foreign,sha256:await sha256(JSON.stringify(foreign))})).valid).toBe(false);
  });
});
