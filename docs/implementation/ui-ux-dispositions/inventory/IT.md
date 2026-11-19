# IT · screen and overlay inventory (generated from src/generated/catalog.json + scripts/audit-native-overlays.mjs)

Regenerated 2026-11-19. Columns: source = where the overlay is declared; flags = D description, G guidance, C capability, F footer.


## ARL-IT-001 · IT Operations Home  
Route `/o/:org/it/home` · sample `nl-incidents-001` · archetype dashboard · collection `incidents`  
Tabs: Health, Incidents, Changes, Capacity  
Actions: Inspect service, open issue, run check, acknowledge  
Edge: Third-party incident clearly differentiated from owned infrastructure

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Service inspector | drawer | `src/applications/it/index.tsx:173` |  |  |  |
| incident create | modal | `src/applications/it/index.tsx:174` | F |  |  |
| health test | modal | `src/applications/it/index.tsx:175` | F |  |  |

## ARL-IT-002 · Incident Queue  
Route `/o/:org/it/incidents` · sample `nl-incidents-001` · archetype table · collection `incidents`  
Tabs: Active, Awaiting user, Resolved, Postmortems  
Actions: Assign, escalate, merge, resolve, page owner  
Edge: Multiple symptoms merged only with evidence

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Incident detail | drawer | `src/applications/it/index.tsx:209` |  |  |  |
| severity change | modal | `src/applications/it/index.tsx:212` | F |  |  |
| escalation rules | drawer | `src/applications/it/index.tsx:213` |  |  |  |

## ARL-IT-003 · Incident Detail  
Route `/o/:org/it/incidents/:id` · sample `nl-incidents-001` · archetype record · collection `incidents`  
Tabs: Overview, Timeline, Evidence, Remediation, Postmortem  
Actions: Acknowledge, assign, approve repair, close  
Edge: Incident cannot resolve until health verified

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Remediation approval | ? | `not found` |  |  |  |
| affected work | drawer | `src/applications/it/index.tsx:243` |  |  |  |
| mitigation note | modal | `src/applications/it/index.tsx:244` | F |  |  |

## ARL-IT-004 · System Health  
Route `/o/:org/it/health` · sample `nl-incidents-001` · archetype dashboard · collection `incidents`  
Tabs: Services, Workers, Storage, Provider status  
Actions: Drill down, add monitor, alert threshold, export  
Edge: Privacy-safe telemetry; no sensitive payload exposure

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Service health detail | drawer | `src/applications/it/index.tsx:265` |  |  |  |
| monitor rule | ? | `not found` |  |  |  |
| scale request | modal | `src/applications/it/index.tsx:270` | F |  |  |

## ARL-IT-005 · Logs & Tracing  
Route `/o/:org/it/traces` · sample `nl-incidents-001` · archetype table · collection `incidents`  
Tabs: Traces, Logs, Metrics, Sampling  
Actions: Filter, inspect, bookmark, share authorized  
Edge: Secrets and personal data never surfaced by default

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Trace waterfall | drawer | `src/applications/it/index.tsx:298` |  |  |  |
| redaction rules | modal | `src/applications/it/index.tsx:299` | F |  |  |
| saved filter | modal | `src/applications/it/index.tsx:300` | F |  |  |

## ARL-IT-006 · Automated Remediation  
Route `/o/:org/it/remediation` · sample `nl-incidents-001` · archetype builder · collection `incidents`  
Tabs: Runbooks, Proposals, Runs, Failures  
Actions: Test runbook, approve, execute, pause  
Edge: No autonomous privilege escalation or blind production patch

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Runbook editor | ? | `not found` |  |  |  |
| remediation impact | modal | `src/applications/it/index.tsx:329` | F |  |  |
| verify result | modal | `src/applications/it/index.tsx:338` | F |  |  |

## ARL-IT-007 · Release Management  
Route `/o/:org/it/releases` · sample `nl-incidents-001` · archetype admin · collection `incidents`  
Tabs: Planned, Staging, Production, Rollbacks  
Actions: Approve release, deploy, test, rollback  
Edge: Failing security and functional gates block promotion

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Diff review | drawer | `src/applications/it/index.tsx:358` |  |  |  |
| release gates | modal | `src/applications/it/index.tsx:359` | F |  |  |
| rollback confirmation | ? | `not found` |  |  |  |

## ARL-IT-008 · Security Centre  
Route `/o/:org/it/security` · sample `nl-incidents-001` · archetype dashboard · collection `incidents`  
Tabs: Alerts, Access, Secrets, Policy, Audit  
Actions: Investigate, revoke, isolate, export  
Edge: AI never becomes self-authorizing security administrator

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Security incident | modal | `src/applications/it/index.tsx:382` | F |  |  |
| session revoke | modal | `src/applications/it/index.tsx:383` | F |  |  |
| policy simulation | drawer | `src/applications/it/index.tsx:384` |  |  |  |

## ARL-IT-009 · Reliability Reports  
Route `/o/:org/it/reports` · sample `nl-incidents-001` · archetype report · collection `incidents`  
Tabs: Trends, Root causes, Capacity, Costs  
Actions: Generate, compare, propose remediation, export  
Edge: Numbers sourced from real incidents, never model estimate alone

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Report builder | drawer | `src/applications/it/index.tsx:413` |  |  |  |
| incident comparison | modal | `src/applications/it/index.tsx:414` | F |  |  |
| proposal | ? | `not found` |  |  |  |
