# PROC · screen and overlay inventory (generated from src/generated/catalog.json + scripts/audit-native-overlays.mjs)

Regenerated 2026-11-19. Columns: source = where the overlay is declared; flags = D description, G guidance, C capability, F footer.


## ARL-PROC-001 · Procurement Overview  
Route `/o/:org/proc/home` · sample `nl-purchaseOrders-001` · archetype dashboard · collection `purchaseOrders`  
Tabs: Overview, Approvals, Suppliers, Stock  
Actions: Create requisition, inspect risk, approve PO  
Edge: Budget owner approval required for financial commitments

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Requisition | drawer | `src/applications/proc/index.tsx:83` | G |  |  |
| stock alert | drawer | `src/applications/proc/index.tsx:84` |  |  |  |
| cost inspector | drawer | `src/applications/proc/index.tsx:85` |  |  |  |

## ARL-PROC-002 · Suppliers  
Route `/o/:org/proc/suppliers` · sample `nl-suppliers-001` · archetype directory · collection `suppliers`  
Tabs: All, Approved, Review, Archived  
Actions: Create, evaluate, link contract, open  
Edge: Bank detail updates require privileged separate verification

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Supplier form | drawer | `src/applications/proc/index.tsx:107` | F |  |  |
| verification | modal | `src/applications/proc/index.tsx:108` | F |  |  |
| sanctions/compliance review | drawer | `src/applications/proc/index.tsx:109` |  |  |  |

## ARL-PROC-003 · Supplier Detail  
Route `/o/:org/proc/suppliers/:id` · sample `nl-suppliers-001` · archetype record · collection `suppliers`  
Tabs: Overview, Contracts, Orders, Communications  
Actions: Request quote, update, compare, flag  
Edge: Supplier contract clauses require qualified review

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Supplier editor | drawer | `src/applications/proc/index.tsx:133` | F |  |  |
| contract viewer | drawer | `src/applications/proc/index.tsx:134` |  |  |  |
| risk escalation | modal | `src/applications/proc/index.tsx:135` | F |  |  |

## ARL-PROC-004 · Purchase Requisitions  
Route `/o/:org/proc/requisitions` · sample `nl-purchaseOrders-001` · archetype table · collection `purchaseOrders`  
Tabs: Mine, Team, Awaiting approval, Closed  
Actions: Create, approve, reject, convert to PO  
Edge: Approval chain cannot be bypassed by conversion

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Requisition form | drawer | `src/applications/proc/index.tsx:163` | F |  |  |
| budget check | drawer | `src/applications/proc/index.tsx:165` |  |  |  |
| rejection reason | modal | `src/applications/proc/index.tsx:167` | F |  |  |

## ARL-PROC-005 · Purchase Orders  
Route `/o/:org/proc/orders` · sample `nl-purchaseOrders-001` · archetype table · collection `purchaseOrders`  
Tabs: Draft, Approved, Sent, Received, Closed  
Actions: Create, revise, send, receive, close  
Edge: Sent revisions versioned; double ordering prevented

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| PO editor | drawer | `src/applications/proc/index.tsx:190` | F |  |  |
| change impact | drawer | `src/applications/proc/index.tsx:191` |  |  |  |
| send preview | drawer | `src/applications/proc/index.tsx:194` |  |  |  |

## ARL-PROC-006 · Warehouse Locations  
Route `/o/:org/proc/warehouses` · sample `nl-warehouses-001` · archetype directory · collection `warehouses`  
Tabs: Sites, Bins, Capacity, Activity  
Actions: Add bin, transfer, inspect, audit  
Edge: Physical stock changes require scan/receipt proof when mandated

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Location editor | modal | `src/applications/proc/index.tsx:216` | F |  |  |
| stock count | drawer | `src/applications/proc/index.tsx:217` | F |  |  |
| transfer | modal | `src/applications/proc/index.tsx:218` | F |  |  |

## ARL-PROC-007 · Receiving & Scanning  
Route `/o/:org/proc/receiving` · sample `nl-receipts-001` · archetype editor · collection `receipts`  
Tabs: Expected, Receiving, Exceptions, Complete  
Actions: Scan, count, flag damage, put away  
Edge: Duplicate scans and offline sessions de-duplicated

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Scan overlay | drawer | `src/applications/proc/index.tsx:248` | F |  |  |
| discrepancy | modal | `src/applications/proc/index.tsx:249` | F |  |  |
| receipt confirmation | drawer | `src/applications/proc/index.tsx:250` |  |  |  |

## ARL-PROC-008 · Stock Movements  
Route `/o/:org/proc/movements` · sample `nl-stockMoves-001` · archetype table · collection `stockMoves`  
Tabs: All, Transfers, Adjustments, Counts  
Actions: Create move, approve adjustment, export  
Edge: Inventory ledger never updated without traceable transaction

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Movement inspector | drawer | `src/applications/proc/index.tsx:272` |  |  |  |
| count reconciliation | drawer | `src/applications/proc/index.tsx:273` | F |  |  |
| authorization | modal | `src/applications/proc/index.tsx:274` | G |  |  |

## ARL-PROC-009 · Replenishment  
Route `/o/:org/proc/replenishment` · sample `nl-purchaseOrders-001` · archetype report · collection `purchaseOrders`  
Tabs: Suggested, Planned, Ordered, Exceptions  
Actions: Adjust forecast, create requisition, approve  
Edge: No autonomous financial commitment beyond limit

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Reorder policy | drawer | `src/applications/proc/index.tsx:294` |  |  |  |
| scenario | drawer | `src/applications/proc/index.tsx:295` |  |  |  |
| purchase preview | drawer | `src/applications/proc/index.tsx:296` | F |  |  |

## ARL-PROC-010 · Procurement Analytics  
Route `/o/:org/proc/reports` · sample `nl-purchaseOrders-001` · archetype report · collection `purchaseOrders`  
Tabs: Spend, Service, Inventory, Forecast  
Actions: Compare, inspect, report, export  
Edge: Cancelled orders excluded appropriately from spend

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Metric source | drawer | `src/applications/proc/index.tsx:319` |  |  |  |
| report designer | modal | `src/applications/proc/index.tsx:320` | F |  |  |
| supplier review | modal | `src/applications/proc/index.tsx:321` | F |  |  |
