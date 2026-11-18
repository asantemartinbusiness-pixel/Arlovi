import { describe, expect, it } from "vitest";
import { screens } from "@/app/catalog";
import {
  evaluateAccess, scopeMatches, ROLE_TEMPLATES, templateOffersApp, type AccessGrant,
  type AccessPrincipal, type AccessResource, type AccessQuery,
} from "@/platform/accessPolicyContract";
import { ACCESS_APPLICATION_INVENTORY, ACCESS_SCREEN_INVENTORY, accessDescriptor, accessInventoryCoverage, canOpenLegacyScreen } from "@/platform/accessInventory";

const principal: AccessPrincipal = {
  id:"user-10", orgId:"org-1", kind:"human", authenticated:true, roles:["finance"],
  teamIds:["team-1"], departmentIds:["finance"], entityIds:["entity-1"],
};
const resource: AccessResource = {
  orgId:"org-1", appCode:"FIN", screenId:"ARL-FIN-005",
  id:"invoice-1", ownerId:"user-10", teamId:"team-1", departmentId:"finance",
  entityId:"entity-1", classification:"internal",
};
const grant: AccessGrant = {
  id:"finance-review", orgId:"org-1", effect:"allow", roleIds:["finance"],
  appCodes:["FIN"], actions:["view","approve"], scope:"department",
  maxClassification:"internal", maxAmountMinor:25000,
};
const query = (override: Partial<AccessQuery> = {}): AccessQuery => ({
  principal, resource, action:"view", now:new Date("2026-11-18T19:00:00Z"),...override,
});

describe("Arlovi role and access-control contract", () => {
  it("inventories every registered native app and page without missing screen contracts", () => {
    const coverage=accessInventoryCoverage();
    expect(coverage).toEqual({apps:35,screens:316,complete:true});
    expect(new Set(ACCESS_APPLICATION_INVENTORY.map(x=>x.code)).size).toBe(35);
    expect(new Set(ACCESS_SCREEN_INVENTORY.map(x=>x.id)).size).toBe(316);
    expect(ACCESS_APPLICATION_INVENTORY.reduce((sum,x)=>sum+x.pages.length,0)).toBe(316);
  });
  it("provides requested job-title templates without silently changing actual legacy roles",()=>{
    expect(ROLE_TEMPLATES).toHaveLength(13);
    expect(templateOffersApp("managing_director","FIN")).toBe(true);
    expect(templateOffersApp("managing_director","IT")).toBe(false);
    expect(templateOffersApp("client","FIN")).toBe(false);
    expect(templateOffersApp("unknown","HQ")).toBe(false);
  });
  it("protects important page previews on top of broad application lists", () => {
    const payroll=screens.find(s=>s.id==="ARL-HR-009")!;
    const dev=screens.find(s=>s.id==="ARL-ADMIN-011")!;
    const admin=screens.find(s=>s.id==="ARL-ADMIN-003")!;
    expect(accessDescriptor(payroll).classification).toBe("restricted");
    expect(accessDescriptor(payroll).legacyCapability).toBe("view_payroll");
    expect(canOpenLegacyScreen("owner", payroll)).toBe(true);
    expect(canOpenLegacyScreen("people", payroll)).toBe(true);
    expect(canOpenLegacyScreen("member", payroll)).toBe(false);
    expect(canOpenLegacyScreen("finance", dev)).toBe(false);
    expect(canOpenLegacyScreen("finance", admin)).toBe(false);
    expect(canOpenLegacyScreen("owner", dev)).toBe(true);
  });
  it("refuses unauthenticated, suspended and cross-organisation requests", () => {
    expect(evaluateAccess(query({principal:{...principal, authenticated:false}}),[grant]).outcome).toBe("deny");
    expect(evaluateAccess(query({principal:{...principal, suspended:true}}),[grant]).outcome).toBe("deny");
    expect(evaluateAccess(query({resource:{...resource,orgId:"org-2"}}),[grant]).outcome).toBe("deny");
    expect(evaluateAccess(query({principal:{...principal,orgId:"org-2"}}),[grant]).outcome).toBe("deny");
  });
  it("matches project, team, department, entity and explicit assignments precisely",()=>{
    expect(scopeMatches("own", principal,resource)).toBe(true);
    expect(scopeMatches("team",principal,resource)).toBe(true);
    expect(scopeMatches("department",principal,resource)).toBe(true);
    expect(scopeMatches("entity",principal,resource)).toBe(true);
    expect(scopeMatches("assigned",principal,{...resource,assigneeIds:["user-10"]})).toBe(true);
    expect(scopeMatches("assigned",principal,{...resource,assigneeIds:["other"]})).toBe(false);
    expect(scopeMatches("explicit",principal,resource,{...grant,resourceIds:["invoice-1"]})).toBe(true);
    expect(scopeMatches("explicit",principal,resource,{...grant,resourceIds:["invoice-2"]})).toBe(false);
  });
  it("denies restricted resources even if an app is otherwise available",()=>{
    expect(evaluateAccess(query(),[grant]).outcome).toBe("allow");
    expect(evaluateAccess(query({resource:{...resource,classification:"restricted"}}),[grant]).outcome).toBe("deny");
  });
  it("explicit deny takes precedence over any allow",()=>{
    const denial:AccessGrant={...grant,id:"blocked",effect:"deny",actions:["view"]};
    const result=evaluateAccess(query(),[grant,denial]);
    expect(result.outcome).toBe("deny");
    expect(result.matchedGrantIds).toEqual(["blocked"]);
  });
  it("requires an additional approval when a permitted financial action exceeds its limit",()=>{
    expect(evaluateAccess(query({action:"approve",amountMinor:10000}),[grant]).outcome).toBe("allow");
    expect(evaluateAccess(query({action:"approve",amountMinor:100000}),[grant]).outcome).toBe("approval_required");
    expect(evaluateAccess(query({action:"approve"}),[{...grant,requiresApproval:true}]).outcome).toBe("approval_required");
  });
  it("prevents transaction self-approval and requires human approval for powerful AI actions",()=>{
    expect(evaluateAccess(query({action:"approve",resource:{...resource,submittedById:principal.id}}),[grant]).outcome).toBe("deny");
    const agent={...principal,id:"agent-1",kind:"ai_agent" as const};
    expect(evaluateAccess(query({principal:agent,action:"approve",amountMinor:10000}),
      [{...grant,agentEligible:true}]).outcome).toBe("approval_required");
    expect(evaluateAccess(query({principal:agent,action:"view"}),
      [{...grant,agentEligible:true}]).outcome).toBe("allow");
  });
  it("expires grants and blocks malformed expiry",()=>{
    expect(evaluateAccess(query(),[{...grant,expiresAt:"2026-11-18T18:00:00Z"}]).outcome).toBe("deny");
    expect(evaluateAccess(query(),[{...grant,expiresAt:"invalid"}]).outcome).toBe("deny");
  });
  it("prevents AI employees from inheriting human approval rights",()=>{
    const agent={...principal,id:"agent-1",kind:"ai_agent" as const,roles:["finance"]};
    expect(evaluateAccess(query({principal:agent}),[grant]).outcome).toBe("deny");
    expect(evaluateAccess(query({principal:agent}),[{...grant,agentEligible:true}]).outcome).toBe("allow");
    expect(evaluateAccess(query({principal:agent,action:"manage"}),[{...grant,agentEligible:true}]).outcome).toBe("deny");
  });
});
