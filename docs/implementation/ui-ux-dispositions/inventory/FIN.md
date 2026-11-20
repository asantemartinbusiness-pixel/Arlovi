# FIN · screen and overlay inventory (generated from src/generated/catalog.json + scripts/audit-native-overlays.mjs)

Regenerated 2026-11-19. Columns: source = where the overlay is declared; flags = D description, G guidance, C capability, F footer.


## ARL-FIN-001 · Finance Overview  
Route `/o/:org/fin/home` · sample `nl-journals-001` · archetype dashboard · collection `journals`  
Tabs: Overview, Cashflow, Tasks, Insights  
Actions: Inspect metric, issue report, start reconciliation, ask Finance  
Edge: Unknown bank feed clearly marks balance unverified

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Metric drilldown | drawer | `src/applications/fin/index.tsx:123` |  |  |  |
| reporting-period selector | modal | `src/applications/fin/index.tsx:124` |  |  |  |
| correction proposal | modal | `src/applications/fin/index.tsx:125` |  |  |  |

## ARL-FIN-002 · Chart of Accounts  
Route `/o/:org/fin/accounts` · sample `nl-accounts-001` · archetype directory · collection `accounts`  
Tabs: All, Assets, Liabilities, Equity, Revenue, Expenses  
Actions: Create account, deactivate, map category, export  
Edge: Cannot delete account with posted journal entries

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Account editor | modal | `src/applications/fin/index.tsx:150` |  |  |  |
| account history | drawer | `src/applications/fin/index.tsx:151` |  |  |  |
| deactivation impact | modal | `src/applications/fin/index.tsx:152` |  |  |  |

## ARL-FIN-003 · General Ledger  
Route `/o/:org/fin/ledger` · sample `nl-journals-001` · archetype table · collection `journals`  
Tabs: Entries, Journals, Periods, Audit  
Actions: Post approved journal, inspect lines, reverse, search  
Edge: Post rejects unbalanced entries and locked accounting periods

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Journal form | drawer | `src/applications/fin/index.tsx:175` |  |  |  |
| balancing validator | drawer | `src/applications/fin/index.tsx:176` |  |  |  |
| reverse confirmation | modal | `src/applications/fin/index.tsx:177` | GC |  |  |

## ARL-FIN-004 · Invoice List  
Route `/o/:org/fin/invoices` · sample `nl-invoices-001` · archetype table · collection `invoices`  
Tabs: Draft, Awaiting payment, Overdue, Paid, Void, Time inputs  
Actions: Create, filter, bulk reminders, export, open record  
Edge: Duplicate outbound sends guarded by provider reconciliation

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| New invoice | modal | `src/applications/fin/index.tsx:204` |  |  |  |
| bulk action preview | modal | `src/applications/fin/index.tsx:205` |  |  |  |
| reminder approval | modal | `src/applications/fin/index.tsx:206` |  |  |  |
| finance time review | drawer | `src/applications/fin/index.tsx:202` |  |  |  |

## ARL-FIN-005 · Invoice Detail  
Route `/o/:org/fin/invoices/:id` · sample `nl-invoices-001` · archetype record · collection `invoices`  
Tabs: Overview, Line items, Payments, Activity  
Actions: Edit draft, preview, approve, send, void, record payment  
Edge: Sent invoices become versioned immutable records with correct adjustments

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Line item editor | drawer | `src/applications/fin/index.tsx:236` |  |  |  |
| email preview | drawer | `src/applications/fin/index.tsx:237` |  |  |  |
| payment form | modal | `src/applications/fin/index.tsx:238` | GC |  |  |
| void reason | modal | `src/applications/fin/index.tsx:239` |  |  |  |

## ARL-FIN-006 · Bills & Payables  
Route `/o/:org/fin/bills` · sample `nl-bills-001` · archetype table · collection `bills`  
Tabs: Inbox, Due, Approved, Paid, Exceptions  
Actions: Upload bill, match supplier, approve, schedule payment  
Edge: No AI bank-transfer authorization outside explicit mandate

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Bill capture | modal | `src/applications/fin/index.tsx:263` |  |  |  |
| match inspector | drawer | `src/applications/fin/index.tsx:264` |  |  |  |
| payment authorization | modal | `src/applications/fin/index.tsx:265` |  |  |  |

## ARL-FIN-007 · Expenses  
Route `/o/:org/fin/expenses` · sample `nl-expenses-001` · archetype table · collection `expenses`  
Tabs: My expenses, Team review, Approved, Reimbursed  
Actions: Upload receipt, assign category, approve, reimburse  
Edge: Personal expense visibility and reimbursement limits enforced

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Receipt capture | modal | `src/applications/fin/index.tsx:289` |  |  |  |
| expense detail | drawer | `src/applications/fin/index.tsx:290` |  |  |  |
| approval chain | drawer | `src/applications/fin/index.tsx:291` |  |  |  |

## ARL-FIN-008 · Banking & Feeds  
Route `/o/:org/fin/banking` · sample `nl-bankTransactions-001` · archetype table · collection `bankTransactions`  
Tabs: Accounts, Transactions, Imports, Feed health  
Actions: Connect account, import statement, inspect mismatch, reconcile  
Edge: Feed disconnect does not silently mark transactions reconciled

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Bank connection | modal | `src/applications/fin/index.tsx:316` |  |  |  |
| CSV mapper | drawer | `src/applications/fin/index.tsx:317` |  |  |  |
| feed incident | drawer | `src/applications/fin/index.tsx:318` |  |  |  |

## ARL-FIN-009 · Bank Reconciliation  
Route `/o/:org/fin/reconciliation` · sample `nl-bankTransactions-001` · archetype editor · collection `bankTransactions`  
Tabs: To reconcile, Matched, Exceptions, History  
Actions: Match, split, create adjustment, confirm statement  
Edge: Final reconciliation requires zero unexplained discrepancy

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Match candidates | drawer | `src/applications/fin/index.tsx:341` |  |  |  |
| adjustment review | drawer | `src/applications/fin/index.tsx:342` |  |  |  |
| reconciliation approval | modal | `src/applications/fin/index.tsx:343` |  |  |  |

## ARL-FIN-010 · Budgets & Forecasts  
Route `/o/:org/fin/budgets` · sample `nl-budgets-001` · archetype report · collection `budgets`  
Tabs: Budgets, Forecasts, Scenarios, Approval  
Actions: Edit assumptions, compare scenarios, submit budget  
Edge: Forecast estimates explicitly separate from posted actuals

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Model assumptions | drawer | `src/applications/fin/index.tsx:364` |  |  |  |
| revision history | drawer | `src/applications/fin/index.tsx:365` |  |  |  |
| budget approval | modal | `src/applications/fin/index.tsx:367` |  |  |  |

## ARL-FIN-011 · Tax & Compliance  
Route `/o/:org/fin/tax` · sample `nl-taxCodes-001` · archetype admin · collection `taxCodes`  
Tabs: Codes, Periods, Returns, Audit  
Actions: Prepare return, validate, review filing, export  
Edge: No unsupported claim of HMRC/compliance certification or legal advice

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Tax configuration | drawer | `src/applications/fin/index.tsx:390` |  |  |  |
| return review | modal | `src/applications/fin/index.tsx:391` |  |  |  |
| filing authorization | modal | `src/applications/fin/index.tsx:392` |  |  |  |

## ARL-FIN-012 · Financial Reports  
Route `/o/:org/fin/reports` · sample `nl-journals-001` · archetype report · collection `journals`  
Tabs: Statements, Management, Custom, Scheduled  
Actions: Build report, filter, drill down, export, schedule  
Edge: Unposted data is not silently blended into audited statement

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Report designer | modal | `src/applications/fin/index.tsx:418` |  |  |  |
| source note | drawer | `src/applications/fin/index.tsx:419` |  |  |  |
| schedule | modal | `src/applications/fin/index.tsx:420` |  |  |  |

## ARL-FIN-013 · Multi-Entity Finance  
Route `/o/:org/fin/entities` · sample `nl-legalEntities-001` · archetype admin · collection `legalEntities`  
Tabs: Entities, Intercompany, Consolidation, FX  
Actions: Create consolidation, eliminate intercompany, inspect postings  
Edge: Consolidation avoids double counting and preserves entity boundaries

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Entity config | modal | `src/applications/fin/index.tsx:443` |  |  |  |
| consolidation preview | drawer | `src/applications/fin/index.tsx:444` |  |  |  |
| FX sources | drawer | `src/applications/fin/index.tsx:445` |  |  |  |
