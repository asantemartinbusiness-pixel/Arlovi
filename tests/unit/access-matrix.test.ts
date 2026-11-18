import { describe, expect, it } from "vitest";
import { applications, screens } from "@/app/catalog";
import {
  countDraftChanges, emptyRolePermissionDraft, parseRolePermissionDraft,
  plannedPermission, updateRolePermission, updateRoleScope,
} from "@/platform/accessMatrix";

describe("editable access matrix — proposal only",()=>{
  it("starts with inheritance across the real app and screen inventories",()=>{
    expect(applications.length).toBe(35);
    expect(screens.length).toBe(316);
    const draft=emptyRolePermissionDraft("company_owner");
    expect(countDraftChanges(draft)).toBe(0);
    expect(plannedPermission("company_owner","FIN",undefined,"view",draft).allowed).toBe(true);
    expect(plannedPermission("company_owner","FIN",undefined,"approve",draft).allowed).toBe(false);
    expect(plannedPermission("ai_employee","FIN",undefined,"view",emptyRolePermissionDraft("ai_employee")).allowed).toBe(false);
  });
  it("allows planned view or edit overrides but never describes them as live permissions",()=>{
    let draft=emptyRolePermissionDraft("employee");
    expect(plannedPermission("employee","FIN",undefined,"view",draft).allowed).toBe(false);
    draft=updateRolePermission(draft,"application","FIN","view","allow");
    draft=updateRolePermission(draft,"application","FIN","edit","allow");
    expect(plannedPermission("employee","FIN",undefined,"view",draft)).toMatchObject({allowed:true,source:"Application draft allow"});
    expect(plannedPermission("employee","FIN",undefined,"edit",draft).allowed).toBe(true);
    expect(countDraftChanges(draft)).toBe(2);
  });
  it("always lets a parent app view denial win over page-level allows",()=>{
    const page=screens.find(s=>s.applicationCode==="FIN");
    expect(page).toBeDefined();
    let draft=emptyRolePermissionDraft("company_owner");
    draft=updateRolePermission(draft,"page",page!.id,"view","allow");
    draft=updateRolePermission(draft,"application","FIN","view","deny");
    expect(plannedPermission("company_owner","FIN",page!.id,"view",draft)).toMatchObject({allowed:false,explicitlyDenied:true});
    expect(plannedPermission("company_owner","FIN",page!.id,"edit",draft).allowed).toBe(false);
    expect(draft.appRules.FIN.edit).toBeUndefined();
  });
  it("preserves explicit deny exceptions when view access is turned off and back on",()=>{
    let draft=emptyRolePermissionDraft("company_owner");
    draft=updateRolePermission(draft,"application","FIN","approve","deny");
    draft=updateRolePermission(draft,"application","FIN","edit","allow");
    draft=updateRolePermission(draft,"application","FIN","view","deny");
    expect(draft.appRules.FIN.approve).toBe("deny");
    expect(draft.appRules.FIN.edit).toBeUndefined();
    draft=updateRolePermission(draft,"application","FIN","view","allow");
    expect(draft.appRules.FIN.approve).toBe("deny");
    expect(plannedPermission("company_owner","FIN",undefined,"approve",draft).allowed).toBe(false);
  });
  it("requires a view grant before a page can be edited",()=>{
    const page=screens.find(s=>s.applicationCode==="HR")!;
    let draft=emptyRolePermissionDraft("client");
    draft=updateRolePermission(draft,"page",page.id,"edit","allow");
    expect(plannedPermission("client","HR",page.id,"edit",draft).allowed).toBe(false);
    draft=updateRolePermission(draft,"application","HR","view","allow");
    // A page inherits View from its parent application unless explicitly denied.
    expect(plannedPermission("client","HR",page.id,"edit",draft).allowed).toBe(true);
    draft=updateRolePermission(draft,"page",page.id,"view","deny");
    expect(plannedPermission("client","HR",page.id,"edit",draft).allowed).toBe(false);
    // Denying View also intentionally drops dependent edit grants on this page.
    expect(draft.pageRules[page.id].edit).toBeUndefined();
    draft=updateRolePermission(draft,"page",page.id,"view","allow");
    expect(plannedPermission("client","HR",page.id,"edit",draft).allowed).toBe(false);
    draft=updateRolePermission(draft,"page",page.id,"edit","allow");
    expect(plannedPermission("client","HR",page.id,"edit",draft).allowed).toBe(true);
  });
  it("can remove an override by returning to inherit",()=>{
    let draft=emptyRolePermissionDraft("sales");
    draft=updateRolePermission(draft,"application","CRM","view","deny");
    expect(draft.appRules.CRM.view).toBe("deny");
    draft=updateRolePermission(draft,"application","CRM","view","inherit");
    expect(draft.appRules.CRM).toBeUndefined();
    expect(countDraftChanges(draft)).toBe(0);
  });
  it("rejects corrupted, foreign role and unknown-code draft records",()=>{
    const raw={roleId:"employee",appRules:{FIN:{view:"allow",edit:"illegal"},UNKNOWN:{view:"allow"}},
      pageRules:{"ARL-NOT-REAL":{view:"allow"}},scopes:{FIN:"team",UNKNOWN:"organization",HR:"nope"}};
    expect(parseRolePermissionDraft(JSON.stringify(raw),"employee")).toEqual({
      roleId:"employee",appRules:{FIN:{view:"allow"}},pageRules:{},scopes:{FIN:"team"},
    });
    expect(parseRolePermissionDraft(raw,"company_owner")).toEqual(emptyRolePermissionDraft("company_owner"));
    expect(parseRolePermissionDraft("{oops","employee")).toEqual(emptyRolePermissionDraft("employee"));
  });
  it("keeps data scopes separate and rejects rules for nonexisting pages",()=>{
    let draft=emptyRolePermissionDraft("finance");
    draft=updateRoleScope(draft,"FIN","department");
    draft=updateRolePermission(draft,"page","BAD-SCREEN","view","allow");
    expect(draft.scopes.FIN).toBe("department");
    expect(draft.pageRules).toEqual({});
    expect(plannedPermission("finance","FIN","BAD-SCREEN","view",draft).allowed).toBe(false);
  });
});
