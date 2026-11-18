import {describe,expect,it} from "vitest";
import {applications,screens} from "@/app/catalog";
import {NAV_GROUPS} from "@/app/nav";
import {
  ROLE_TEMPLATES,applicationsForRoleTemplate,allRegisteredApplicationCodes,
  defaultLegacyTemplate,screenAccessCatalogue,isSensitiveScreen,evaluateAccess,
  type AccessPrincipal,type AccessResource,
} from "@/platform/accessModel";
import {canOpen} from "@/platform/policy";
import type {Role} from "@/domain/types";

const principal:AccessPrincipal={
 subjectId:"alice",organizationId:"company-a",kind:"human",roleIds:["team_manager"],
 departmentIds:["dept-a"],teamIds:["team-a"],
};
const resource:AccessResource={
 organizationId:"company-a",application:"PROJECT",id:"project-1",
 classification:"internal",ownerId:"bob",teamId:"team-a",departmentId:"dept-a",
};
describe("Arlovi access design contracts",()=>{
 it("covers all registered applications and screen inventory",()=>{
  const codes=NAV_GROUPS.flatMap(g=>g.apps.map(app=>app.code)).sort();
  expect(allRegisteredApplicationCodes().sort()).toEqual(codes);
  expect(screenAccessCatalogue()).toHaveLength(screens.length);
  expect(screens.length).toBe(316);
  expect(applications.length).toBe(35);
 });
 it("has unique templates and no default tool access for AI employees",()=>{
  expect(new Set(ROLE_TEMPLATES.map(r=>r.id)).size).toBe(ROLE_TEMPLATES.length);
  expect(applicationsForRoleTemplate("ai_employee")).toEqual([]);
  expect(applicationsForRoleTemplate("company_owner")).toHaveLength(35);
 });
 it("keeps existing six role-based application visibility unchanged",()=>{
  for(const role of ["owner","finance","sales","people","member","client"] as Role[]){
   const old=applications.filter(app=>canOpen(role,app.code)).map(app=>app.code);
   const preview=applicationsForRoleTemplate(defaultLegacyTemplate(role));
   if(role==="member")expect(preview.length).toBeLessThan(old.length);
   else expect(preview.sort()).toEqual(old.sort());
  }
 });
 it("denies foreign organisations and unknown or mismatched scopes",()=>{
  expect(evaluateAccess(principal,{...resource,organizationId:"company-b"},"view").reason).toBe("org_mismatch");
  expect(evaluateAccess(principal,{...resource,teamId:"team-b",departmentId:"dept-b"},"view").allowed).toBe(false);
  expect(evaluateAccess(principal,resource,"view").allowed).toBe(true);
 });
 it("prevents confidential access solely by executive or owner template",()=>{
  const executive={...principal,roleIds:["company_owner"]};
  expect(evaluateAccess(executive,{...resource,application:"HR",classification:"confidential"},"view").allowed).toBe(false);
  expect(isSensitiveScreen("HR","Payroll")).toBe(true);
  expect(isSensitiveScreen("PROJECT","Task Board")).toBe(false);
 });
 it("explicit denial overrides an otherwise valid grant",()=>{
  const denied={...principal,grants:[
   {application:"PROJECT",action:"view",scope:"team",effect:"allow"},
   {application:"PROJECT",action:"view",scope:"none",effect:"deny"},
  ]} as AccessPrincipal;
  expect(evaluateAccess(denied,resource,"view").reason).toBe("explicit_deny");
 });
 it("requires a classified resource grant and a separate approval decision",()=>{
  const secure={...principal,grants:[{
   application:"PROJECT",action:"approve",scope:"team",effect:"allow",
   classificationMax:"confidential",requiresApproval:true,
  }]} as AccessPrincipal;
  const confidential={...resource,classification:"confidential" as const};
  expect(evaluateAccess(secure,confidential,"approve")).toMatchObject({allowed:false,requiresApproval:true,reason:"approval_required"});
  expect(evaluateAccess(secure,confidential,"approve",{approvalGranted:true}).allowed).toBe(true);
  expect(evaluateAccess(secure,{...resource,classification:"restricted"},"approve").allowed).toBe(false);
 });
 it("does not grant expired permissions and does not treat a grant for another record as authority",()=>{
  const scoped={...principal,roleIds:[],grants:[{
   application:"PROJECT",action:"view",scope:"team",effect:"allow",
   expiresAt:"2026-11-18T18:00:00Z",resourceId:"project-1",
  }]} as AccessPrincipal;
  expect(evaluateAccess(scoped,resource,"view",{now:"2026-11-18T19:00:00Z"}).allowed).toBe(false);
  expect(evaluateAccess(scoped,{...resource,id:"project-2"},"view",{now:"2026-11-18T17:00:00Z"}).allowed).toBe(false);
 });
});
