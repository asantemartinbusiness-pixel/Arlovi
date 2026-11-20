# PORTAL · screen and overlay inventory (generated from src/generated/catalog.json + scripts/audit-native-overlays.mjs)

Regenerated 2026-11-19. Columns: source = where the overlay is declared; flags = D description, G guidance, C capability, F footer.


## ARL-PORTAL-001 · Portal Directory  
Route `/o/:org/portal/portals` · sample `nl-portals-001` · archetype directory · collection `portals`  
Tabs: Clients, Customers, Suppliers, Partners  
Actions: Create, clone, preview, suspend  
Edge: Portal never inherits internal company permissions by default

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Portal wizard | drawer | `src/applications/portal/index.tsx:71` | F |  |  |
| branding | modal | `src/applications/portal/index.tsx:72` | F |  |  |
| access setup | modal | `src/applications/portal/index.tsx:73` | GF |  |  |

## ARL-PORTAL-002 · Portal Builder  
Route `/o/:org/portal/portals/:id/builder` · sample `nl-portals-001` · archetype editor · collection `portals`  
Tabs: Pages, Design, Data, Access, Preview  
Actions: Drag modules, bind permitted data, test, publish  
Edge: External users cannot traverse internal object IDs

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Module picker | drawer | `src/applications/portal/index.tsx:95` | F |  |  |
| data grant | modal | `src/applications/portal/index.tsx:96` | F |  |  |
| publish review | modal | `src/applications/portal/index.tsx:97` |  |  |  |

## ARL-PORTAL-003 · External Dashboard  
Route `/o/:org/portal/portals/:id/dashboard` · sample `nl-portals-001` · archetype dashboard · collection `portals`  
Tabs: Overview, Work, Files, Messages, Billing  
Actions: View, comment, approve scoped item, request service  
Edge: Portal must not expose cross-client aggregated records

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Shared item inspector | drawer | `src/applications/portal/index.tsx:125` |  |  |  |
| client message | modal | `src/applications/portal/index.tsx:126` | F |  |  |
| access request | modal | `src/applications/portal/index.tsx:127` | F |  |  |

## ARL-PORTAL-004 · Shared Documents  
Route `/o/:org/portal/portals/:id/files` · sample `nl-portals-001` · archetype directory · collection `portals`  
Tabs: Shared, Needs review, Signed, Archive  
Actions: View, download, comment, request access  
Edge: Expired links and revocation applied immediately

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Document preview | drawer | `src/applications/portal/index.tsx:150` |  |  |  |
| permission request | modal | `src/applications/portal/index.tsx:151` | F |  |  |
| signature | modal | `src/applications/portal/index.tsx:152` | F |  |  |

## ARL-PORTAL-005 · External Messaging  
Route `/o/:org/portal/portals/:id/messages` · sample `nl-portals-001` · archetype chat · collection `portals`  
Tabs: Inbox, Requests, History  
Actions: Reply, upload, book meeting, escalate  
Edge: AI cannot discuss internal project notes not shared

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Conversation details | drawer | `src/applications/portal/index.tsx:174` |  |  |  |
| attachment preview | drawer | `src/applications/portal/index.tsx:175` |  |  |  |
| complaint | modal | `src/applications/portal/index.tsx:176` | F |  |  |

## ARL-PORTAL-006 · Portal Billing & Requests  
Route `/o/:org/portal/portals/:id/billing` · sample `nl-portals-001` · archetype table · collection `portals`  
Tabs: Invoices, Payments, Requests, History  
Actions: Pay, download, submit request, dispute  
Edge: Sensitive payment details delegated to compliant provider

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Payment provider | drawer | `src/applications/portal/index.tsx:199` |  |  |  |
| dispute form | modal | `src/applications/portal/index.tsx:200` | F |  |  |
| document receipt | drawer | `src/applications/portal/index.tsx:201` |  |  |  |

## ARL-PORTAL-007 · Portal Access & Analytics  
Route `/o/:org/portal/portals/:id/admin` · sample `nl-portals-001` · archetype admin · collection `portals`  
Tabs: Users, Access, Analytics, Audit  
Actions: Invite, revoke, set expiry, review activity  
Edge: Client cannot grant themselves broad internal access

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| External invite | modal | `src/applications/portal/index.tsx:223` | F |  |  |
| scope preview | drawer | `src/applications/portal/index.tsx:224` |  |  |  |
| account recovery | modal | `src/applications/portal/index.tsx:225` | F |  |  |
