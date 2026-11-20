# PROJECT · screen and overlay inventory (generated from src/generated/catalog.json + scripts/audit-native-overlays.mjs)

Regenerated 2026-11-19. Columns: source = where the overlay is declared; flags = D description, G guidance, C capability, F footer.


## ARL-PROJECT-001 · Project Portfolio  
Route `/o/:org/project/portfolios` · sample `nl-projects-001` · archetype dashboard · collection `projects`  
Tabs: Overview, Departments, Timeline, Risks  
Actions: Create project, filter, inspect health, portfolio report  
Edge: Rollups never count duplicated linked tasks twice

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Portfolio filter | drawer | `src/applications/project/index.tsx:902` |  |  |  |
| initiative detail | drawer | `src/applications/project/index.tsx:903` |  |  |  |
| priority change | modal | `src/applications/project/index.tsx:904` | F |  |  |

## ARL-PROJECT-002 · Project Directory  
Route `/o/:org/project/projects` · sample `nl-projects-001` · archetype directory · collection `projects`  
Tabs: All, Mine, Following, Archived  
Actions: Create, pin, search, duplicate, archive  
Edge: Archived project retained in linked audit and mission histories

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Project template | modal | `src/applications/project/index.tsx:924` | F |  |  |
| archive impact | modal | `src/applications/project/index.tsx:925` |  |  |  |
| quick detail | drawer | `src/applications/project/index.tsx:926` |  |  |  |

## ARL-PROJECT-003 · Project Overview  
Route `/o/:org/project/projects/:id` · sample `nl-projects-001` · archetype dashboard · collection `projects`  
Tabs: Overview, Tasks, Timeline, Files, Activity, Metrics  
Actions: Change status, assign owner, request update, attach file  
Edge: Paused project stops configured automation, not unrelated tasks

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Milestone editor | modal | `src/applications/project/index.tsx:952` | F |  |  |
| project settings | modal | `src/applications/project/index.tsx:953` | F |  |  |
| status note | modal | `src/applications/project/index.tsx:954` | F |  |  |

## ARL-PROJECT-004 · Task Board  
Route `/o/:org/project/projects/:id/board` · sample `nl-projects-001` · archetype board · collection `projects`  
Tabs: Board, List, By owner, By sprint  
Actions: Drag task, create, assign, bulk move, filter  
Edge: Stage move cannot bypass review or produce unknown side effects

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Task drawer | drawer | `src/applications/project/index.tsx:977` |  |  |  |
| stage rule | modal | `src/applications/project/index.tsx:978` |  |  |  |
| batch action review | modal | `src/applications/project/index.tsx:979` |  |  |  |

## ARL-PROJECT-005 · Task Detail  
Route `/o/:org/project/tasks/:id` · sample `nl-tasks-001` · archetype record · collection `tasks`  
Tabs: Details, Discussion, Subtasks, History  
Actions: Edit, comment, link, delegate AI, complete  
Edge: Changing owner preserves attribution and source links

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Assignee picker | modal | `src/applications/project/index.tsx:1003` | F |  |  |
| dependency selector | modal | `src/applications/project/index.tsx:1004` | F |  |  |
| completion check | modal | `src/applications/project/index.tsx:1005` |  |  |  |

## ARL-PROJECT-006 · Timeline & Dependencies  
Route `/o/:org/project/projects/:id/timeline` · sample `nl-projects-001` · archetype timeline · collection `projects`  
Tabs: Timeline, Critical path, Baseline, Risks  
Actions: Reschedule, drag duration, link task, compare baseline  
Edge: Cycles or impossible dependency dates block publication

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Date edit | modal | `src/applications/project/index.tsx:1027` | F |  |  |
| conflict review | drawer | `src/applications/project/index.tsx:1028` |  |  |  |
| dependency graph | drawer | `src/applications/project/index.tsx:1029` |  |  |  |

## ARL-PROJECT-007 · Resource Workload  
Route `/o/:org/project/workload` · sample `nl-tasks-001` · archetype report · collection `tasks`  
Tabs: People, AI, Departments, Calendar  
Actions: Reassign, adjust estimates, view capacity  
Edge: Human absence and AI throughput modeled differently

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Workload detail | drawer | `src/applications/project/index.tsx:1045` |  |  |  |
| allocation editor | modal | `src/applications/project/index.tsx:1046` | F |  |  |
| over-capacity alert | drawer | `src/applications/project/index.tsx:1047` |  |  |  |

## ARL-PROJECT-008 · Project Templates  
Route `/o/:org/project/templates` · sample `nl-templates-001` · archetype directory · collection `templates`  
Tabs: Company, Industry, Personal  
Actions: Create, apply, duplicate, publish  
Edge: Cloned project does not inherit confidential prior attachments

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Template editor | modal | `src/applications/project/index.tsx:1066` | F |  |  |
| preview | modal | `src/applications/project/index.tsx:1067` |  |  |  |
| revision confirm | modal | `src/applications/project/index.tsx:1068` |  |  |  |

## ARL-PROJECT-009 · Goals & OKRs  
Route `/o/:org/project/goals` · sample `nl-objectives-001` · archetype report · collection `objectives`  
Tabs: Company, Team, Personal, Check-ins  
Actions: Set target, report progress, link project  
Edge: Avoid subjective automated performance evaluation

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Metric source | drawer | `src/applications/project/index.tsx:1086` |  |  |  |
| check-in dialog | modal | `src/applications/project/index.tsx:1087` | F |  |  |
| goal revision | modal | `src/applications/project/index.tsx:1088` | F |  |  |

## ARL-PROJECT-010 · Time & Cost  
Route `/o/:org/project/time` · sample `nl-shifts-001` · archetype table · collection `shifts`  
Tabs: My time, Team, Costs, Approvals  
Actions: Log time, approve, edit, export  
Edge: AI computation spend is not represented as employee billable hours

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Timer | modal | `src/applications/project/index.tsx:1107` | F |  |  |
| timesheet correction | modal | `src/applications/project/index.tsx:1108` | F |  |  |
| billing link | drawer | `src/applications/project/index.tsx:1109` |  |  |  |
