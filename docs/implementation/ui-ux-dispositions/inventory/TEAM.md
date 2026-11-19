# TEAM · screen and overlay inventory (generated from src/generated/catalog.json + scripts/audit-native-overlays.mjs)

Regenerated 2026-11-19. Columns: source = where the overlay is declared; flags = D description, G guidance, C capability, F footer.


## ARL-TEAM-001 · Workforce Home  
Route `/o/:org/team/home` · sample `nl-agents-001` · archetype dashboard · collection `agents`  
Tabs: Overview, Activity, Costs, Reliability  
Actions: Hire AI employee, inspect issue, pause agent, view department  
Edge: Hidden computation must not be misreported as active human-like presence

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Agent creation | modal | `src/applications/team/index.tsx:2347` |  |  |  |
| quick profile | drawer | `src/applications/team/index.tsx:2353` |  |  |  |
| cost inspector | drawer | `src/applications/team/index.tsx:2354` |  |  |  |

## ARL-TEAM-002 · AI Employee Directory  
Route `/o/:org/team/agents` · sample `nl-agents-001` · archetype directory · collection `agents`  
Tabs: All, By department, Active, Paused, Draft  
Actions: Find agent, open profile, assign work, clone tested contract  
Edge: Suspended agent excluded from tool execution and auto delegation

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Agent quick view | drawer | `src/applications/team/index.tsx:2372` |  |  |  |
| assignment | modal | `src/applications/team/index.tsx:2373` |  |  |  |
| archive confirmation | modal | `src/applications/team/index.tsx:2374` |  |  |  |

## ARL-TEAM-003 · Agent Profile  
Route `/o/:org/team/agents/:id` · sample `nl-agents-001` · archetype record · collection `agents`  
Tabs: Overview, Skills, Work, Permissions, Performance, History  
Actions: Edit role, test, reassign, pause, open chat  
Edge: Permission change must invalidate stale grants for queued tasks

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Role edit | modal | `src/applications/team/index.tsx:2395` | F |  |  |
| permission inspector | drawer | `src/applications/team/index.tsx:2396` | G |  |  |
| test panel | modal | `src/applications/team/index.tsx:2397` |  |  |  |

## ARL-TEAM-004 · Agent Builder  
Route `/o/:org/team/agents/new` · sample `nl-agents-001` · archetype wizard · collection `agents`  
Tabs: Identity, Skills, Knowledge, Tools, Autonomy, Test  
Actions: Generate contract, select templates, configure limits, test, activate  
Edge: Agent cannot activate before evaluation and explicit external grants

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Skill picker | drawer | `src/applications/team/index.tsx:2423` |  |  |  |
| connector grant | modal | `src/applications/team/index.tsx:2424` |  |  |  |
| simulation | modal | `src/applications/team/index.tsx:2425` |  |  |  |
| publish confirmation | modal | `src/applications/team/index.tsx:2426` |  |  |  |

## ARL-TEAM-005 · Organization Chart  
Route `/o/:org/team/organization` · sample `nl-members-001` · archetype graph · collection `members`  
Tabs: Hierarchy, Directory, Capacity  
Actions: Reparent agent, create department, assign lead, filter  
Edge: Cross-entity reporting cannot grant cross-entity data rights

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Employee inspector | drawer | `src/applications/team/index.tsx:2447` |  |  |  |
| transfer approval | modal | `src/applications/team/index.tsx:2448` |  |  |  |
| hierarchy impact | modal | `src/applications/team/index.tsx:2449` |  |  |  |

## ARL-TEAM-006 · Skills Library  
Route `/o/:org/team/skills` · sample `nl-skills-001` · archetype directory · collection `skills`  
Tabs: Native, Organization, Purchased, Draft  
Actions: Search, install, edit, deprecate, compare versions  
Edge: Untrusted skill bundles sandboxed and reviewed before runtime

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Skill detail | drawer | `src/applications/team/index.tsx:2470` |  |  |  |
| install permission | modal | `src/applications/team/index.tsx:2471` |  |  |  |
| compatibility test | modal | `src/applications/team/index.tsx:2472` |  |  |  |

## ARL-TEAM-007 · Agent Academy  
Route `/o/:org/team/academy` · sample `nl-skills-001` · archetype dashboard · collection `skills`  
Tabs: Training, Playbooks, Assessments, Results  
Actions: Upload SOP, demonstrate task, assign course, test  
Edge: New knowledge remains proposed until validated and scoped

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Training asset upload | modal | `src/applications/team/index.tsx:2491` | F |  |  |
| assessment builder | modal | `src/applications/team/index.tsx:2492` |  |  |  |
| publishing review | modal | `src/applications/team/index.tsx:2493` |  |  |  |

## ARL-TEAM-008 · Evaluation Lab  
Route `/o/:org/team/evaluations` · sample `nl-evaluations-001` · archetype report · collection `evaluations`  
Tabs: Scenarios, Runs, Regression, Reports  
Actions: Run evaluation, compare model, approve new version, rollback  
Edge: Model updates cannot silently lower required safety score

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Scenario editor | modal | `src/applications/team/index.tsx:2513` | F |  |  |
| detailed trace | drawer | `src/applications/team/index.tsx:2514` |  |  |  |
| promotion approval | modal | `src/applications/team/index.tsx:2515` |  |  |  |

## ARL-TEAM-009 · Agent Performance  
Route `/o/:org/team/performance` · sample `nl-evaluations-001` · archetype report · collection `evaluations`  
Tabs: Employees, Departments, Trends, Quality  
Actions: Compare agents, inspect failed task, coach, adjust resource policy  
Edge: No fabricated ROI or value-of-human-work estimates

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Metric definition | modal | `src/applications/team/index.tsx:2534` |  |  |  |
| incident trace | drawer | `src/applications/team/index.tsx:2535` |  |  |  |
| performance note | modal | `src/applications/team/index.tsx:2536` | F |  |  |

## ARL-TEAM-010 · Model Routing  
Route `/o/:org/team/models` · sample `nl-connectors-001` · archetype admin · collection `connectors`  
Tabs: Providers, Routing, Budgets, Experiments  
Actions: Set role model, test fallback, restrict data, inspect spend  
Edge: Provider outage triggers safe fallback only if allowed by data policy

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Provider setup | modal | `src/applications/team/index.tsx:2557` |  |  |  |
| routing simulator | drawer | `src/applications/team/index.tsx:2558` |  |  |  |
| policy warning | modal | `src/applications/team/index.tsx:2559` |  |  |  |
