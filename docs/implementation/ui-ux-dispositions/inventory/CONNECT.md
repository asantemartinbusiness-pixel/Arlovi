# CONNECT · screen and overlay inventory (generated from src/generated/catalog.json + scripts/audit-native-overlays.mjs)

Regenerated 2026-11-19. Columns: source = where the overlay is declared; flags = D description, G guidance, C capability, F footer.


## ARL-CONNECT-001 · Integration Marketplace  
Route `/o/:org/connect/marketplace` · sample `nl-connectors-001` · archetype directory · collection `connectors`  
Tabs: Featured, Categories, Installed, Custom  
Actions: Browse, compare, install, inspect requirements  
Edge: Unverified provider claims not advertised as supported

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Connector preview | drawer | `src/applications/connect/index.tsx:139` |  |  |  |
| install wizard | ? | `not found` |  |  |  |
| risk summary | modal | `src/applications/connect/index.tsx:143` | F |  |  |

## ARL-CONNECT-002 · Connector Detail  
Route `/o/:org/connect/marketplace/:id` · sample `nl-connectors-001` · archetype record · collection `connectors`  
Tabs: Overview, Capabilities, Permissions, Versions, Help  
Actions: Connect, test, view docs, request capability  
Edge: Read and publish scopes clearly differentiated

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Authorization preview | drawer | `src/applications/connect/index.tsx:165` | GC |  |  |
| scope explanation | drawer | `src/applications/connect/index.tsx:166` |  |  |  |
| provider limits | modal | `src/applications/connect/index.tsx:167` | F |  |  |

## ARL-CONNECT-003 · Connection Wizard  
Route `/o/:org/connect/connect/:id` · sample `nl-connectors-001` · archetype wizard · collection `connectors`  
Tabs: Account, Permissions, Test, Confirm  
Actions: Authorize, choose targets, test, cancel  
Edge: Failed OAuth must not leave phantom connected status

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| External OAuth | ? | `not found` |  |  |  |
| scope review | drawer | `src/applications/connect/index.tsx:189` |  |  |  |
| consent status | drawer | `src/applications/connect/index.tsx:190` |  |  |  |

## ARL-CONNECT-004 · Installed Connections  
Route `/o/:org/connect/connections` · sample `nl-connectors-001` · archetype table · collection `connectors`  
Tabs: All, Healthy, Needs action, Disabled  
Actions: Inspect, reconnect, suspend, transfer owner  
Edge: Revocation terminates new calls and invalidates cached grants

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Account inspector | drawer | `src/applications/connect/index.tsx:215` |  |  |  |
| scope change | modal | `src/applications/connect/index.tsx:216` | F |  |  |
| revoke grant | modal | `src/applications/connect/index.tsx:217` | F |  |  |

## ARL-CONNECT-005 · Connection Detail  
Route `/o/:org/connect/connections/:id` · sample `nl-connectors-001` · archetype record · collection `connectors`  
Tabs: Overview, Capabilities, Sync, Activity, Security  
Actions: Test, limit agents, rotate auth, disable  
Edge: Stale authorization cannot be used for queued mission

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Permission matrix | drawer | `src/applications/connect/index.tsx:238` |  |  |  |
| health run | modal | `src/applications/connect/index.tsx:239` | F |  |  |
| reconnect dialog | modal | `src/applications/connect/index.tsx:240` | F |  |  |

## ARL-CONNECT-006 · Capability Registry  
Route `/o/:org/connect/capabilities` · sample `nl-connectors-001` · archetype directory · collection `connectors`  
Tabs: Actions, Reads, Webhooks, Versions  
Actions: Inspect schema, test mock, retire, compare  
Edge: Provider-specific unsupported operation blocked

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Capability inspector | drawer | `src/applications/connect/index.tsx:262` |  |  |  |
| schema diff | modal | `src/applications/connect/index.tsx:263` | F |  |  |
| version impact | ? | `not found` |  |  |  |

## ARL-CONNECT-007 · Synchronization Centre  
Route `/o/:org/connect/sync` · sample `nl-connectors-001` · archetype table · collection `connectors`  
Tabs: Jobs, Conflicts, Schedules, Data mapping  
Actions: Retry safe sync, inspect conflict, change mapping  
Edge: Out-of-order webhooks and duplicate events deduplicated

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Mapping editor | modal | `src/applications/connect/index.tsx:282` | F |  |  |
| conflict resolver | ? | `not found` |  |  |  |
| run receipt | ? | `not found` |  |  |  |

## ARL-CONNECT-008 · Connector Health  
Route `/o/:org/connect/health` · sample `nl-connectors-001` · archetype dashboard · collection `connectors`  
Tabs: Overview, Outages, Rate limits, Deprecations  
Actions: Run health test, open incident, contact owner  
Edge: Provider outages not falsely marked internally repairable

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Health report | modal | `src/applications/connect/index.tsx:302` | F |  |  |
| reconnect request | modal | `src/applications/connect/index.tsx:303` | F |  |  |
| mitigation | drawer | `src/applications/connect/index.tsx:304` |  |  |  |

## ARL-CONNECT-009 · Custom Connectors  
Route `/o/:org/connect/custom` · sample `nl-connectors-001` · archetype builder · collection `connectors`  
Tabs: Projects, Editor, Tests, Publish  
Actions: Create adapter, register action, test, submit for use  
Edge: Third-party tool instructions treated as untrusted

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Secret setup | modal | `src/applications/connect/index.tsx:325` | F |  |  |
| capability validation | ? | `not found` |  |  |  |
| approval | ? | `not found` |  |  |  |

## ARL-CONNECT-010 · Action Receipts  
Route `/o/:org/connect/receipts` · sample `nl-connectors-001` · archetype table · collection `connectors`  
Tabs: All, Confirmed, Pending, Failed, Blocked  
Actions: Inspect, export, reconcile, open mission  
Edge: Provider request accepted is not automatically success

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Receipt detail | drawer | `src/applications/connect/index.tsx:361` |  |  |  |
| provider evidence | modal | `src/applications/connect/index.tsx:362` | F |  |  |
| retry review | modal | `src/applications/connect/index.tsx:363` | F |  |  |
