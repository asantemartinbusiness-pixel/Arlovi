# BUILD · screen and overlay inventory (generated from src/generated/catalog.json + scripts/audit-native-overlays.mjs)

Regenerated 2026-11-19. Columns: source = where the overlay is declared; flags = D description, G guidance, C capability, F footer.


## ARL-BUILD-001 · App Project Library  
Route `/o/:org/build/projects` · sample `nl-appProjects-001` · archetype directory · collection `appProjects`  
Tabs: Recent, Team, Templates, Archived  
Actions: Create, import repo, clone, open  
Edge: Imported code scanned and sandboxed

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Project setup | modal | `src/applications/build/index.tsx:615` | F |  |  |
| Git import | ? | `not found` |  |  |  |
| environment config | drawer | `src/applications/build/index.tsx:617` |  |  |  |

## ARL-BUILD-002 · Application Overview  
Route `/o/:org/build/projects/:id` · sample `nl-appProjects-001` · archetype dashboard · collection `appProjects`  
Tabs: Overview, Pages, Data, Tests, Deployments  
Actions: Open builder, ask engineer, run tests, create issue  
Edge: Environment labels prevent production/staging confusion

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Incident inspector | drawer | `src/applications/build/index.tsx:647` |  |  |  |
| release preview | modal | `src/applications/build/index.tsx:648` | G |  |  |
| task creation | modal | `src/applications/build/index.tsx:649` | F |  |  |

## ARL-BUILD-003 · Visual App Builder  
Route `/o/:org/build/projects/:id/builder` · sample `nl-appProjects-001` · archetype canvas · collection `appProjects`  
Tabs: Design, Logic, Data, Responsive, Preview  
Actions: Add component, edit styles, bind record, simulate  
Edge: AI modifications shown as diff and reversible

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Component inspector | drawer | `src/applications/build/index.tsx:678` |  |  |  |
| expression editor | modal | `src/applications/build/index.tsx:679` | F |  |  |
| binding test | drawer | `src/applications/build/index.tsx:680` |  |  |  |

## ARL-BUILD-004 · Code Editor  
Route `/o/:org/build/projects/:id/code` · sample `nl-appProjects-001` · archetype editor · collection `appProjects`  
Tabs: Files, Source control, Problems, Tests  
Actions: Edit, search, branch, commit, run safe command  
Edge: No unrestricted secrets or filesystem access from prompt content

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| File search | modal | `src/applications/build/index.tsx:704` | F |  |  |
| diff review | drawer | `src/applications/build/index.tsx:705` |  |  |  |
| command authorization | modal | `src/applications/build/index.tsx:706` | F |  |  |

## ARL-BUILD-005 · Database Designer  
Route `/o/:org/build/projects/:id/database` · sample `nl-appProjects-001` · archetype graph · collection `appProjects`  
Tabs: Schema, Data, Migrations, Policies  
Actions: Create table, alter schema, seed, validate policy  
Edge: Destructive migrations demand backup and explicit authorization

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Column editor | modal | `src/applications/build/index.tsx:742` | F |  |  |
| migration diff | drawer | `src/applications/build/index.tsx:743` |  |  |  |
| access policy | drawer | `src/applications/build/index.tsx:744` |  |  |  |

## ARL-BUILD-006 · API & Functions  
Route `/o/:org/build/projects/:id/api` · sample `nl-appProjects-001` · archetype editor · collection `appProjects`  
Tabs: Endpoints, Functions, Contracts, Runs  
Actions: Define endpoint, test, deploy, inspect trace  
Edge: Authorization cannot be silently removed by AI patch

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Request builder | modal | `src/applications/build/index.tsx:769` | F |  |  |
| auth inspector | drawer | `src/applications/build/index.tsx:770` |  |  |  |
| function diff | drawer | `src/applications/build/index.tsx:771` |  |  |  |

## ARL-BUILD-007 · Authentication & Roles  
Route `/o/:org/build/projects/:id/auth` · sample `nl-appProjects-001` · archetype admin · collection `appProjects`  
Tabs: Users, Roles, Sessions, Providers  
Actions: Create role, revoke session, configure provider  
Edge: New user does not inherit organization owner rights

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Role editor | modal | `src/applications/build/index.tsx:792` | F |  |  |
| policy simulator | drawer | `src/applications/build/index.tsx:793` |  |  |  |
| authentication issue | modal | `src/applications/build/index.tsx:794` | F |  |  |

## ARL-BUILD-008 · Testing & QA  
Route `/o/:org/build/projects/:id/tests` · sample `nl-appProjects-001` · archetype report · collection `appProjects`  
Tabs: Suites, Runs, Coverage, Issues  
Actions: Run suite, inspect failure, approve fix, export  
Edge: Green UI not sufficient for unverified backend effects

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Test report | drawer | `src/applications/build/index.tsx:815` |  |  |  |
| AI patch review | ? | `not found` |  |  |  |
| flaky test tracker | modal | `src/applications/build/index.tsx:817` | F |  |  |

## ARL-BUILD-009 · Deployments & Environments  
Route `/o/:org/build/projects/:id/deploy` · sample `nl-appProjects-001` · archetype admin · collection `appProjects`  
Tabs: Environments, Releases, Logs, Rollbacks  
Actions: Promote, rollback, inspect config, pause  
Edge: No automatic production promotion after failed gates

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Release approval | modal | `src/applications/build/index.tsx:852` |  |  |  |
| diff | drawer | `src/applications/build/index.tsx:853` |  |  |  |
| rollback impact | modal | `src/applications/build/index.tsx:854` | F |  |  |

## ARL-BUILD-010 · Integrations & Secrets  
Route `/o/:org/build/projects/:id/integrations` · sample `nl-appProjects-001` · archetype admin · collection `appProjects`  
Tabs: Connections, Secrets, Webhooks, Health  
Actions: Attach integration, rotate secret, test, revoke  
Edge: Secrets never rendered in AI chat or logs

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Secret input | modal | `src/applications/build/index.tsx:877` | F |  |  |
| webhook test | modal | `src/applications/build/index.tsx:893` | F |  |  |
| revocation | modal | `src/applications/build/index.tsx:902` | F |  |  |

## ARL-BUILD-011 · App Analytics & Monitoring  
Route `/o/:org/build/projects/:id/monitor` · sample `nl-appProjects-001` · archetype report · collection `appProjects`  
Tabs: Errors, Performance, Usage, Costs  
Actions: Inspect event, create incident, tune monitor, export  
Edge: PII redacted from trace summaries

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Trace viewer | drawer | `src/applications/build/index.tsx:936` |  |  |  |
| alert rule | ? | `not found` |  |  |  |
| budget panel | drawer | `src/applications/build/index.tsx:939` |  |  |  |
