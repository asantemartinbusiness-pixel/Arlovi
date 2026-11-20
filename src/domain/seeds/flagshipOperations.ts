import { registerSeed } from "@/domain/seedRegistry";
import { ORG_COLLECTIVE } from "@/domain/types";
import type { Rec } from "@/domain/types";

/**
 * Northline Collective / integrated 12-month commercial planning simulation.
 *
 * IMPORTANT: this is not imported historical accounting. Every financial
 * instrument is an UNSENT / UNPOSTED draft and every time series is a
 * forecast scenario. These data can demonstrate workflows and inspection
 * without manufacturing bank reconciliation, tax filings, paid invoices,
 * revenue recognition, provider confirmations or audit evidence.
 *
 * Rows are deterministic and use the 12xx–14xx namespace, independent of
 * the existing Northline / flagship seed contributors.
 */
const MONTHLY_GBP = [650000,680000,700000,730000,760000,780000,810000,825000,845000,870000,935000,1015000];
const CATEGORY_SPLIT_BP = { commerce: 6200, services: 3200, experiences: 600 } as const;
const date = (month: number, day = 10) => new Date(Date.UTC(2025,11+month,day,9,30)).toISOString();
const money = (gbp: number) => Math.round(gbp*100);
const id = (collection: string, n: number) => "nl-"+collection+"-"+n;
const LIFECYCLE = ["inquiry","quote","draft","awaiting_review","revision_requested"] as const;
type Extras = {status?:string;summary?:string;amountMinor?:number;at?:string;dueAt?:string;parentId?:string;fields?:Record<string,string|number|boolean>;body?:unknown};

registerSeed("flagship-operations",ctx=>{
  const records:Rec[]=[];
  const push=(collection:string,n:number,title:string,details:Extras={})=>{
    records.push(ctx.rec({
      org:"nl",collection,n,title,status:details.status??"draft",summary:details.summary??"",
      at:details.at??ctx.now,dueAt:details.dueAt,amountMinor:details.amountMinor,parentId:details.parentId,
      owner:"Collective Operations",createdAt:details.at??ctx.now,
      tags:["flagship","fictional","scenario","unposted"],
      fields:{flagship:"Northline Collective",fictional:true,scenarioOnly:true,ledgerPosted:false,externalState:"not_connected",...details.fields},
      body:details.body,
    }));
  };
  MONTHLY_GBP.forEach((revenueGBP,month)=>{
    const period=date(month).slice(0,7),at=date(month),targetMinor=money(revenueGBP);
    const commerceMinor=Math.round(targetMinor*CATEGORY_SPLIT_BP.commerce/10000);
    const servicesMinor=Math.round(targetMinor*CATEGORY_SPLIT_BP.services/10000);
    const experienceMinor=targetMinor-commerceMinor-servicesMinor;
    const marginRate=3900+(month%5)*125; // Scenario 39.00–44.00%
    const costMinor=Math.round(targetMinor*(10000-marginRate)/10000);
    const fixedMinor=money(106000+month*2600);
    const operatingMinor=targetMinor-costMinor-fixedMinor;

    push("datasets",1300+month,"Scenario / revenue and operating model / "+period,{
      status:"draft",at,summary:"Monthly board-planning assumptions; NOT ledger-derived actual revenue.",
      fields:{period,scenarioRevenueMinor:targetMinor,commerceMinor,servicesMinor,experienceMinor,
        costMinor,fixedMinor,operatingMinor,marginRateBp:marginRate,source:"fictional_scenario"},
      body:{metrics:{revenue:targetMinor,commerce:commerceMinor,services:servicesMinor,
        experiences:experienceMinor,cost:costMinor,fixedCost:fixedMinor,operatingResult:operatingMinor},
        caveat:"Hypothetical modelling figures; not general ledger actuals."},
    });
    push("reports",1200+month,"Board scenario review / "+period,{
      status:"draft",at,summary:"Executive scenario: contribution by division, exposure, capacity and actions. Not a signed financial report.",
      fields:{period,sourceDatasetId:id("datasets",1300+month),source:"scenario",approval:"pending"},
      body:{sections:[
        {heading:"What changes this month",body:"Plan capacity against the scenario, not recognised revenue."},
        {heading:"Three business lines",body:"Commerce, Atelier services and Experiences operating in a shared group model."},
        {heading:"What might go wrong",body:"Supplier lead times, client approval delays and workshop utilisation are modelled risks."},
        {heading:"Next decisions",body:"Review budgets, validate actuals only when connected and obtain human approval."}],
        scenario:{revenueMinor:targetMinor,operatingMinor},dataProvenance:"Hypothetical Northline flagship planning model"},
    });
    for(const [category,amount,index] of [
      ["Commerce",commerceMinor,0],["Atelier services",servicesMinor,1],["Experiences",experienceMinor,2],
    ] as const){
      push("budgets",1200+month*3+index,"Scenario budget / "+category+" / "+period,{
        at,status:"draft",amountMinor:amount,summary:"Unapproved scenario budget target. Not an expenditure authorisation.",
        fields:{period,category,kind:"forecast",scenarioAmountMinor:amount,approval:"pending",sourceDatasetId:id("datasets",1300+month)},
      });
    }
    // Customer pipeline and invoice drafting — never issued, never paid.
    for(let j=0;j<10;j++){
      const n=1200+month*10+j;
      const client=910+(j%6);
      const project=901+((month*5+j)%48);
      const netMinor=money(480+(month*87+j*113)%5400);
      const taxMinor=Math.round(netMinor*.2);
      push("invoices",n,"NLC-SIM-INV-"+String(n),{
        at,status:"draft",amountMinor:netMinor+taxMinor,
        summary:"Unissued client invoice draft for a fictional service or object order.",
        fields:{period,number:"NLC-SIM-INV-"+n,contactId:id("contacts",client),companyId:id("companies",client),
          projectId:id("projects",project),netMinor,taxMinor,discountMinor:0,
          customerTaxStatus:"uk_taxable",issueState:"not_sent",paymentStatus:"not_paid",
          origin:"fictional_flagship_scenario"},
        body:{lines:[{id:"line-"+n,description:j%3===0?"Lighting design concept":j%3===1?"Material sample selection":"Product enquiry draft",
          qty:1,unitMinor:netMinor,netMinor,taxMinor}],notes:"This is a simulation, not an issued tax invoice."},
      });
    }
    // Supplier request → PO draft → supplier bill draft. The three-way match
    // remains unverified until external receipt evidence exists.
    for(let j=0;j<6;j++){
      const n=1200+month*6+j, supplier=901+((month+j)%45);
      const expectedMinor=money(310+(month*71+j*113)%2800), taxMinor=Math.round(expectedMinor*.2);
      push("requisitions",n,"Materials requisition / "+period+" / "+(j+1),{
        status:"draft",at,amountMinor:expectedMinor,
        summary:"Proposed material demand, awaiting human sourcing approval.",
        fields:{period,supplierId:id("suppliers",supplier),approval:"pending",department:"Commerce & Distribution"},
      });
      push("purchaseOrders",n,"NLC-SIM-PO-"+n,{
        status:"draft",at,amountMinor:expectedMinor+taxMinor,
        summary:"Supplier order has not been approved, sent or fulfilled.",
        fields:{period,supplierId:id("suppliers",supplier),requisitionId:id("requisitions",n),
          netMinor:expectedMinor,taxMinor,approval:"pending",receiptState:"not_received"},
        body:{lines:[{id:"po-line-"+n,description:"Sample material supply",quantity:1,
          unitPriceMinor:expectedMinor,taxCategory:"standard",receivedQuantity:0}]},
      });
      push("bills",n,"NLC-SIM-BILL-"+n,{
        status:"draft",at,amountMinor:expectedMinor+taxMinor,
        summary:"Hypothetical payable. No supplier invoice, matching receipt or payment exists.",
        fields:{period,supplierId:id("suppliers",supplier),purchaseOrderId:id("purchaseOrders",n),
          matchState:"unmatched",netMinor:expectedMinor,taxMinor,paymentStatus:"not_paid"},
      });
    }
    for(let j=0;j<5;j++){
      const n=1300+month*5+j, netMinor=money(50+(month*23+j*67)%650);
      push("expenses",n,"Operations planning / "+period+" / "+(j+1),{
        status:"draft",at,amountMinor:netMinor,
        summary:"Unsubmitted operational expense scenario. No reimbursement or receipt is claimed.",
        fields:{period,category:["premises","design","travel","packaging","training"][j],
          receiptState:"missing",reimbursed:false},
      });
    }
    for(let j=0;j<9;j++){
      const n=1300+month*9+j, product=900+((month+j)%8),client=910+(j%6);
      push("orders",n,"NLC-SIM-ORDER-"+n,{
        status:"draft",at,amountMinor:money(280+(month*32+j*71)%1400),
        summary:"Illustrative checkout order, not charged or externally fulfilled.",
        fields:{period,productId:id("products",product),customerId:id("contacts",client),
          companyId:id("companies",client),paymentState:"not_connected",shippingState:"not_created",
          externalOrder:false},
      });
    }
    for(let j=0;j<4;j++){
      const n=1300+month*4+j,order=1300+month*9+j;
      push("tickets",n,"Service scenario / "+period+" / "+(j+1),{
        status:LIFECYCLE[j]??"draft",at,
        summary:["Product specification question","Delivery date amendment","Material finish change","Account follow-up"][j],
        fields:{period,orderId:id("orders",order),customerId:id("contacts",910+j),
          priority:j===2?"high":"normal",resolution:"not_verified"},
      });
    }
    push("workflowRuns",1200+month,"Review and approve / "+period,{
      status:"draft",at,summary:"Proposed review workflow, not a completed automation execution.",
      fields:{period,executed:false,approval:"required",kind:"planning"}
    });
  });
  push("documents",1200,"Collective / financial simulation methodology",{
    status:"draft",summary:"How twelve months of scenario data were generated and how to avoid presenting them as ledger actuals.",
    fields:{kind:"internal_methodology",retention:"scenario_only"},
    body:{content:"NORTHLINE COLLECTIVE — FICTIONAL FINANCIAL MODEL\nPeriod: December 2025 through November 2026.\nScenario annual revenue: £9.6m. This is a hypothetical target, NOT recognised revenue.\nAll customer invoices are unsent drafts. All supplier orders are unsubmitted drafts. All supplier bills and expenses are unposted. Bank transactions, cash balances, tax submissions and payment receipts are NOT simulated as verified external events.\nDivision split: Commerce 62%, Atelier services 32%, Experiences 6%.\nDo not aggregate these records with verified finance dashboards without an explicit scenario filter."},
  });
  return {records};
}, {organizationId: ORG_COLLECTIVE});

export const NORTHLINE_FLAGSHIP_SCENARIO_MONTHS = MONTHLY_GBP;
