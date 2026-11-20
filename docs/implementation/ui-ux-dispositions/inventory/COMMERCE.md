# COMMERCE · screen and overlay inventory (generated from src/generated/catalog.json + scripts/audit-native-overlays.mjs)

Regenerated 2026-11-19. Columns: source = where the overlay is declared; flags = D description, G guidance, C capability, F footer.


## ARL-COMMERCE-001 · Commerce Overview  
Route `/o/:org/commerce/home` · sample `nl-orders-001` · archetype dashboard · collection `orders`  
Tabs: Overview, Sales, Operations, Insights  
Actions: Review order, inspect product, create promotion, ask Commerce  
Edge: Sales and margin metrics reconcile with Finance policy

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| KPI explanation | drawer | `src/applications/commerce/index.tsx:86` |  |  |  |
| exception list | drawer | `src/applications/commerce/index.tsx:87` |  |  |  |
| store picker | modal | `src/applications/commerce/index.tsx:88` | F |  |  |

## ARL-COMMERCE-002 · Products  
Route `/o/:org/commerce/products` · sample `nl-products-001` · archetype table · collection `products`  
Tabs: All, Active, Draft, Collections, Archived  
Actions: Create, bulk edit, categorize, duplicate, archive  
Edge: Bulk publish requires preview and stock/price validation

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Product editor | drawer | `src/applications/commerce/index.tsx:111` | F |  |  |
| import mapping | modal | `src/applications/commerce/index.tsx:112` | F |  |  |
| bulk preview | modal | `src/applications/commerce/index.tsx:113` |  |  |  |

## ARL-COMMERCE-003 · Product Detail  
Route `/o/:org/commerce/products/:id` · sample `nl-products-001` · archetype record · collection `products`  
Tabs: Overview, Variants, Media, Pricing, SEO, History  
Actions: Edit, add variant, change price, publish  
Edge: Price changes affecting live promotions checked against contract

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Variant editor | modal | `src/applications/commerce/index.tsx:137` | F |  |  |
| media picker | modal | `src/applications/commerce/index.tsx:138` | F |  |  |
| margin impact | drawer | `src/applications/commerce/index.tsx:139` |  |  |  |
| publish | modal | `src/applications/commerce/index.tsx:140` |  |  |  |

## ARL-COMMERCE-004 · Inventory  
Route `/o/:org/commerce/inventory` · sample `nl-stockMoves-001` · archetype table · collection `stockMoves`  
Tabs: Stock, Movements, Locations, Replenishment  
Actions: Adjust, transfer, receive, count, reorder  
Edge: Concurrent order reservations must be atomic

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Stock adjustment | modal | `src/applications/commerce/index.tsx:166` | F |  |  |
| transfer approval | modal | `src/applications/commerce/index.tsx:168` | F |  |  |
| count reconciliation | drawer | `src/applications/commerce/index.tsx:169` | F |  |  |

## ARL-COMMERCE-005 · Orders  
Route `/o/:org/commerce/orders` · sample `nl-orders-001` · archetype table · collection `orders`  
Tabs: All, Unfulfilled, In transit, Delivered, Returns  
Actions: View, filter, bulk fulfil, export, assign  
Edge: No duplicate shipment or refund on retry

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Order quick view | drawer | `src/applications/commerce/index.tsx:192` |  |  |  |
| bulk operation | modal | `src/applications/commerce/index.tsx:193` | F |  |  |
| refund approval | modal | `src/applications/commerce/index.tsx:194` | F |  |  |

## ARL-COMMERCE-006 · Order Detail  
Route `/o/:org/commerce/orders/:id` · sample `nl-orders-001` · archetype record · collection `orders`  
Tabs: Overview, Fulfilment, Payments, Returns, Activity  
Actions: Fulfil, refund proposal, contact buyer, cancel  
Edge: Financial state and physical stock adjust consistently

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Shipping label | modal | `src/applications/commerce/index.tsx:225` |  |  |  |
| cancellation impact | modal | `src/applications/commerce/index.tsx:230` |  |  |  |
| refund confirmation | drawer | `src/applications/commerce/index.tsx:231` |  |  |  |

## ARL-COMMERCE-007 · Storefront Builder  
Route `/o/:org/commerce/storefront` · sample `nl-products-001` · archetype editor · collection `products`  
Tabs: Pages, Design, Content, Settings, Preview  
Actions: Drag layout, edit theme, preview, publish, rollback  
Edge: Failed publish preserves prior production site

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Theme inspector | drawer | `src/applications/commerce/index.tsx:257` | F |  |  |
| template picker | modal | `src/applications/commerce/index.tsx:258` | F |  |  |
| publication review | modal | `src/applications/commerce/index.tsx:259` |  |  |  |

## ARL-COMMERCE-008 · Checkout & Payments  
Route `/o/:org/commerce/checkout` · sample `nl-orders-001` · archetype admin · collection `orders`  
Tabs: Experience, Payments, Tax, Recovery  
Actions: Configure, test, preview, deploy, monitor  
Edge: PCI and payment processing delegated appropriately and verified

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Provider setup | modal | `src/applications/commerce/index.tsx:282` | F |  |  |
| checkout test | drawer | `src/applications/commerce/index.tsx:283` |  |  |  |
| policy change review | modal | `src/applications/commerce/index.tsx:284` | F |  |  |

## ARL-COMMERCE-009 · Fulfilment & Shipping  
Route `/o/:org/commerce/fulfilment` · sample `nl-orders-001` · archetype board · collection `orders`  
Tabs: Pick, Pack, Ship, Track, Exceptions  
Actions: Create label, scan, handoff, report exception  
Edge: Unknown carrier response must not create duplicate label

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Carrier selector | modal | `src/applications/commerce/index.tsx:307` | F |  |  |
| label preview | drawer | `src/applications/commerce/index.tsx:308` |  |  |  |
| delivery exception | modal | `src/applications/commerce/index.tsx:309` | F |  |  |

## ARL-COMMERCE-010 · Returns & Refunds  
Route `/o/:org/commerce/returns` · sample `nl-returns-001` · archetype table · collection `returns`  
Tabs: Requested, In review, Approved, Completed  
Actions: Approve, restock, refund, communicate  
Edge: Disputed refunds need human escalation by risk

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Return inspector | drawer | `src/applications/commerce/index.tsx:334` |  |  |  |
| restock assessment | modal | `src/applications/commerce/index.tsx:335` | F |  |  |
| refund authorization | modal | `src/applications/commerce/index.tsx:336` | F |  |  |

## ARL-COMMERCE-011 · Promotions & Pricing  
Route `/o/:org/commerce/promotions` · sample `nl-promotions-001` · archetype editor · collection `promotions`  
Tabs: Offers, Codes, Rules, History  
Actions: Create promotion, model margin, schedule, pause  
Edge: Stacking discounts cannot violate minimum-price guardrail

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Offer builder | drawer | `src/applications/commerce/index.tsx:358` | F |  |  |
| margin check | drawer | `src/applications/commerce/index.tsx:359` |  |  |  |
| launch approval | modal | `src/applications/commerce/index.tsx:360` | F |  |  |

## ARL-COMMERCE-012 · Commerce Analytics  
Route `/o/:org/commerce/analytics` · sample `nl-orders-001` · archetype report · collection `orders`  
Tabs: Sales, Products, Customers, Operations  
Actions: Compare, segment, inspect source, export  
Edge: Results must identify which returns/refunds are included

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Chart builder | modal | `src/applications/commerce/index.tsx:383` | F |  |  |
| KPI inspector | drawer | `src/applications/commerce/index.tsx:384` |  |  |  |
| report schedule | modal | `src/applications/commerce/index.tsx:385` | F |  |  |
