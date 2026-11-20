# MISSION · screen and overlay inventory (generated from src/generated/catalog.json + scripts/audit-native-overlays.mjs)

Regenerated 2026-11-19. Columns: source = where the overlay is declared; flags = D description, G guidance, C capability, F footer.


## ARL-MISSION-001 · Mission Library  
Route `/o/:org/mission/missions` · sample `nl-missions-001` · archetype directory · collection `missions`  
Tabs: All, Proposed, Running, Waiting, Completed, Archived  
Actions: Create mission, filter, bulk tag, open, duplicate plan  
Edge: Archived missions remain auditable, not executable

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Mission quick view | drawer | `src/applications/mission/index.tsx:2812` |  |  |  |
| create mission | modal | `src/applications/mission/index.tsx:2813` |  |  |  |
| archive confirmation | modal | `src/applications/mission/index.tsx:2814` |  |  |  |

## ARL-MISSION-002 · Mission Creation  
Route `/o/:org/mission/missions/new` · sample `nl-missions-001` · archetype wizard · collection `missions`  
Tabs: Goal, Context, Team, Plan, Permissions, Review  
Actions: Describe goal, attach records, revise plan, submit for approval  
Edge: Cannot authorize unknown target accounts or unbounded spend

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Source picker | drawer | `src/applications/mission/index.tsx:2838` |  |  |  |
| team selector | drawer | `src/applications/mission/index.tsx:2839` |  |  |  |
| risk review | modal | `src/applications/mission/index.tsx:2840` |  |  |  |
| approval sheet | modal | `src/applications/mission/index.tsx:2841` |  |  |  |

## ARL-MISSION-003 · Mission Overview  
Route `/o/:org/mission/missions/:id` · sample `nl-missions-001` · archetype dashboard · collection `missions`  
Tabs: Overview, Plan, Team, Deliverables, Activity, Results  
Actions: Pause, resume, cancel, ask status, approve next step  
Edge: Completed label requires verified criteria, not merely finished agent text

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Status explanation | drawer | `src/applications/mission/index.tsx:2863` |  |  |  |
| pause dialog | modal | `src/applications/mission/index.tsx:2864` |  |  |  |
| amendment request | modal | `src/applications/mission/index.tsx:2865` | F |  |  |

## ARL-MISSION-004 · Plan & Dependencies  
Route `/o/:org/mission/missions/:id/plan` · sample `nl-missions-001` · archetype graph · collection `missions`  
Tabs: Graph, List, Timeline, Risks  
Actions: Drag dependencies, edit task, add review, compare versions  
Edge: Cycle in task graph blocked; published plan version immutable

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Task inspector | drawer | `src/applications/mission/index.tsx:2884` |  |  |  |
| plan revision | modal | `src/applications/mission/index.tsx:2885` |  |  |  |
| scope change approval | modal | `src/applications/mission/index.tsx:2886` |  |  |  |

## ARL-MISSION-005 · Mission Task Board  
Route `/o/:org/mission/missions/:id/tasks` · sample `nl-missions-001` · archetype board · collection `missions`  
Tabs: Board, List, Assignees  
Actions: Move card, delegate, attach evidence, reopen task  
Edge: Dragging card cannot bypass approval or execute irreversible action

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Task detail | drawer | `src/applications/mission/index.tsx:2905` |  |  |  |
| reassign | modal | `src/applications/mission/index.tsx:2906` |  |  |  |
| move impact | modal | `src/applications/mission/index.tsx:2907` |  |  |  |

## ARL-MISSION-006 · Execution Console  
Route `/o/:org/mission/missions/:id/execution` · sample `nl-missions-001` · archetype timeline · collection `missions`  
Tabs: Timeline, Actions, Checkpoints, Exceptions  
Actions: Inspect receipt, retry safe task, stop, continue  
Edge: Timeout with unknown side effect must reconcile before retry

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Action receipt | drawer | `src/applications/mission/index.tsx:2933` |  |  |  |
| retry confirmation | modal | `src/applications/mission/index.tsx:2934` |  |  |  |
| execution trace | drawer | `src/applications/mission/index.tsx:2935` |  |  |  |

## ARL-MISSION-007 · Mission Team Room  
Route `/o/:org/mission/missions/:id/team` · sample `nl-missions-001` · archetype chat · collection `missions`  
Tabs: Discussion, Owners, Decisions, Reviews  
Actions: Message, mention, request review, accept handoff  
Edge: Repeated circular debate halted and surfaced to coordinator

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Agent selector | drawer | `src/applications/mission/index.tsx:2953` |  |  |  |
| handoff view | modal | `src/applications/mission/index.tsx:2954` |  |  |  |
| decision record | modal | `src/applications/mission/index.tsx:2955` | F |  |  |

## ARL-MISSION-008 · Deliverables Library  
Route `/o/:org/mission/missions/:id/deliverables` · sample `nl-missions-001` · archetype directory · collection `missions`  
Tabs: All, Draft, Review, Approved, Published  
Actions: Open edit, compare, approve, export, share  
Edge: External published result is not undoable by editing the draft

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Artifact preview | drawer | `src/applications/mission/index.tsx:2975` |  |  |  |
| approval | modal | `src/applications/mission/index.tsx:2976` |  |  |  |
| version diff | modal | `src/applications/mission/index.tsx:2977` |  |  |  |
| publish verification | modal | `src/applications/mission/index.tsx:2978` |  |  |  |

## ARL-MISSION-009 · Mission Budget  
Route `/o/:org/mission/missions/:id/budget` · sample `nl-missions-001` · archetype report · collection `missions`  
Tabs: Summary, Ledger, Policies, History  
Actions: Approve adjustment, inspect cost, set alert, export  
Edge: Concurrent reservations atomic; prevent spending same headroom twice

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Budget variance | drawer | `src/applications/mission/index.tsx:2997` |  |  |  |
| limit increase approval | modal | `src/applications/mission/index.tsx:2998` |  |  |  |
| cost source | drawer | `src/applications/mission/index.tsx:2999` |  |  |  |

## ARL-MISSION-010 · Mission Results  
Route `/o/:org/mission/missions/:id/results` · sample `nl-missions-001` · archetype report · collection `missions`  
Tabs: Outcomes, Evidence, ROI, Follow-up  
Actions: View evidence, issue report, create follow-up, close mission  
Edge: No fabricated KPI uplift; causal claims flagged with limitations

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Source inspector | drawer | `src/applications/mission/index.tsx:3018` |  |  |  |
| results approval | modal | `src/applications/mission/index.tsx:3019` |  |  |  |
| reopen | modal | `src/applications/mission/index.tsx:3020` |  |  |  |

## ARL-MISSION-011 · Mission Templates  
Route `/o/:org/mission/templates` · sample `nl-templates-001` · archetype directory · collection `templates`  
Tabs: Company, Industry, My templates  
Actions: Create from, edit template, publish, simulate  
Edge: Templates never carry expired credentials or approvals forward

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Template editor | modal | `src/applications/mission/index.tsx:3039` | F |  |  |
| example data | drawer | `src/applications/mission/index.tsx:3040` |  |  |  |
| approval grant | modal | `src/applications/mission/index.tsx:3041` |  |  |  |
