# AUTO · screen and overlay inventory (generated from src/generated/catalog.json + scripts/audit-native-overlays.mjs)

Regenerated 2026-11-19. Columns: source = where the overlay is declared; flags = D description, G guidance, C capability, F footer.


## ARL-AUTO-001 · Automation Library  
Route `/o/:org/auto/workflows` · sample `nl-workflows-001` · archetype directory · collection `workflows`  
Tabs: All, Active, Draft, Paused, Failed  
Actions: Create, duplicate, activate, pause, archive  
Edge: Copy never includes stale credentials or approval grants

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Workflow quick view | drawer | `src/applications/auto/index.tsx:121` |  |  |  |
| activation review | modal | `src/applications/auto/index.tsx:122` | GC |  |  |
| archive | modal | `src/applications/auto/index.tsx:123` |  |  |  |

## ARL-AUTO-002 · Visual Workflow Builder  
Route `/o/:org/auto/workflows/:id` · sample `nl-workflows-001` · archetype graph · collection `workflows`  
Tabs: Design, Parameters, Test, History  
Actions: Drag node, connect, configure, validate, save  
Edge: Graph cycles or unbounded loops require limit/validation

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Node picker | modal | `src/applications/auto/index.tsx:182` |  |  |  |
| connector grants | drawer | `src/applications/auto/index.tsx:183` |  |  |  |
| branch editor | modal | `src/applications/auto/index.tsx:184` |  |  |  |

## ARL-AUTO-003 · Trigger Configuration  
Route `/o/:org/auto/workflows/:id/triggers` · sample `nl-workflows-001` · archetype editor · collection `workflows`  
Tabs: Events, Schedules, Filters, Tests  
Actions: Select trigger, set timezone, test, activate  
Edge: Duplicate and out-of-order event delivery handled

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Webhook setup | modal | `src/applications/auto/index.tsx:229` |  |  |  |
| schedule recurrence | modal | `src/applications/auto/index.tsx:230` |  |  |  |
| sample inspection | drawer | `src/applications/auto/index.tsx:231` |  |  |  |

## ARL-AUTO-004 · Action & AI Nodes  
Route `/o/:org/auto/workflows/:id/actions` · sample `nl-workflows-001` · archetype builder · collection `workflows`  
Tabs: Actions, AI, Approval, Control flow  
Actions: Map fields, add capability, set retries, inspect permission  
Edge: High-impact action cannot execute on test data accidentally

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Action parameter | modal | `src/applications/auto/index.tsx:251` |  |  |  |
| policy simulation | modal | `src/applications/auto/index.tsx:252` |  |  |  |
| variable selector | drawer | `src/applications/auto/index.tsx:253` |  |  |  |

## ARL-AUTO-005 · Workflow Testing  
Route `/o/:org/auto/workflows/:id/test` · sample `nl-workflows-001` · archetype report · collection `workflows`  
Tabs: Simulation, Test runs, Assertions, Failures  
Actions: Run dry-run, inspect, compare, approve  
Edge: Test mode must not send real email or transfer funds

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Fixture editor | modal | `src/applications/auto/index.tsx:274` |  |  |  |
| assertion builder | modal | `src/applications/auto/index.tsx:275` |  |  |  |
| simulated receipt | drawer | `src/applications/auto/index.tsx:276` |  |  |  |

## ARL-AUTO-006 · Run History  
Route `/o/:org/auto/runs` · sample `nl-workflowRuns-001` · archetype table · collection `workflowRuns`  
Tabs: All, Running, Failed, Completed, Waiting  
Actions: Open trace, retry safe step, cancel  
Edge: Unknown side effect reconciled before retry

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Run inspector | drawer | `src/applications/auto/index.tsx:310` |  |  |  |
| retry safety check | modal | `src/applications/auto/index.tsx:311` |  |  |  |
| incident link | modal | `src/applications/auto/index.tsx:312` |  |  |  |

## ARL-AUTO-007 · Workflow Run Detail  
Route `/o/:org/auto/runs/:id` · sample `nl-workflowRuns-001` · archetype timeline · collection `workflowRuns`  
Tabs: Timeline, Inputs, Outputs, Logs, Decisions  
Actions: Inspect node, replay safe path, export  
Edge: Sensitive tool payloads redacted from unauthorized viewers

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Node trace | drawer | `src/applications/auto/index.tsx:333` |  |  |  |
| redaction | modal | `src/applications/auto/index.tsx:334` |  |  |  |
| replay confirmation | modal | `src/applications/auto/index.tsx:335` |  |  |  |

## ARL-AUTO-008 · Schedules & Queues  
Route `/o/:org/auto/schedules` · sample `nl-workflows-001` · archetype calendar · collection `workflows`  
Tabs: Calendar, Queues, Limits, History  
Actions: Reschedule, pause, change concurrency, inspect  
Edge: Daylight-saving and duplicate schedule firings handled

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Schedule editor | modal | `src/applications/auto/index.tsx:364` |  |  |  |
| queue priority | modal | `src/applications/auto/index.tsx:365` |  |  |  |
| impact warning | drawer | `src/applications/auto/index.tsx:366` |  |  |  |

## ARL-AUTO-009 · Automation Exceptions  
Route `/o/:org/auto/exceptions` · sample `nl-workflows-001` · archetype board · collection `workflows`  
Tabs: New, Investigating, Awaiting user, Resolved  
Actions: Assign, retry, fix connection, close  
Edge: No false resolved status while provider unverified

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Incident detail | drawer | `src/applications/auto/index.tsx:385` |  |  |  |
| connector reconnect | modal | `src/applications/auto/index.tsx:386` |  |  |  |
| resolution record | modal | `src/applications/auto/index.tsx:387` |  |  |  |
