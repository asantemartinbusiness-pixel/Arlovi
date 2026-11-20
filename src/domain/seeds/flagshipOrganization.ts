import { registerSeed } from "@/domain/seedRegistry";
import { ORG_COLLECTIVE } from "@/domain/types";

/** An independent fictional demo organisation; not a registered legal entity.
 * This record enables normal Workspace, organisation switcher and pause checks
 * without copying Northline Atelier's original live-looking finance fixtures.
 */
registerSeed("flagship-organization", ctx => {
  const org=ctx.rec({
    org:"nl",collection:"organizations",n:1999,title:"Northline Collective",
    status:"active",owner:"Maya Chen",
    summary:"Fictional design-led creative group; a separate browser-local Arlovi demonstration company.",
    tags:["flagship","fictional","organization"],
    fields:{
      slug:"collective",locale:"en-GB",timezone:"Europe/London",jurisdiction:"GB",
      currency:"GBP",brandAccent:"#7e57ff",executionPaused:false,
      fictional:true,scenarioOnly:true,legalEntityVerified:false,
      legalName:"Northline Collective — fictional demonstration",
    },
    body:{statement:"Material. Space. Experience.",
      disclaimer:"No authenticated tenant, incorporation, external provider or registered company is claimed."},
  });
  return {records:[{...org,id:ORG_COLLECTIVE}]};
}, {organizationId:ORG_COLLECTIVE});
