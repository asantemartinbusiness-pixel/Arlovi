# HQ · screen and overlay inventory (generated from src/generated/catalog.json + scripts/audit-native-overlays.mjs)

Regenerated 2026-11-19. Columns: source = where the overlay is declared; flags = D description, G guidance, C capability, F footer.


## ARL-HQ-001 · Executive Home  
Route `/o/:org/hq/home` · sample `nl-objectives-001` · archetype dashboard · collection `objectives`  
Tabs: Today, Week, Saved views  
Actions: Ask Chief of Staff, rearrange cards, drill into metric, dismiss recommendation  
Edge: Unknown or stale KPI must show age and unavailable source, not a fabricated value

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Widget picker | drawer | `src/applications/hq/index.tsx:1297` | DF |  |  |
| metric inspector | drawer | `src/applications/hq/index.tsx:1299` |  |  |  |
| save view dialog | modal | `src/applications/hq/index.tsx:1300` | F |  |  |

## ARL-HQ-002 · My Workspace  
Route `/o/:org/hq/my-work` · sample `nl-tasks-001` · archetype dashboard · collection `tasks`  
Tabs: Today, Upcoming, Saved, History  
Actions: Prioritize task, open draft, request help, pin item  
Edge: Rescinded assignment disappears without exposing prior confidential content

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Quick task | modal | `src/applications/hq/index.tsx:1322` | F |  |  |
| work item inspector | drawer | `src/applications/hq/index.tsx:1337` |  |  |  |
| personal preferences | modal | `src/applications/hq/index.tsx:1339` |  |  |  |

## ARL-HQ-003 · Company Overview  
Route `/o/:org/hq/company` · sample `nl-objectives-001` · archetype dashboard · collection `objectives`  
Tabs: Business, Performance, Operations, Compliance  
Actions: Inspect metric, open department, create company objective  
Edge: Parent/subsidiary totals must not double count intercompany transactions

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| KPI builder | modal | `src/applications/hq/index.tsx:1362` | F |  |  |
| executive note | drawer | `src/applications/hq/index.tsx:1363` |  |  |  |
| data freshness inspector | drawer | `src/applications/hq/index.tsx:1374` |  |  |  |

## ARL-HQ-004 · Departments Directory  
Route `/o/:org/hq/departments` · sample `nl-departments-001` · archetype directory · collection `departments`  
Tabs: All, My departments, Pinned  
Actions: Open department, create department, assign leader, reorder directory  
Edge: Department deletion blocked while active ownership or protected records unresolved

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Create department | modal | `src/applications/hq/index.tsx:1393` | F |  |  |
| organizational impact preview | drawer | `src/applications/hq/index.tsx:1397` |  |  |  |

## ARL-HQ-005 · Department Workspace  
Route `/o/:org/hq/departments/:id` · sample `nl-departments-001` · archetype dashboard · collection `departments`  
Tabs: Overview, People, Work, Discussions, Files, Performance  
Actions: Assign work, message team, add resource, open department app  
Edge: Human staff sees no other department private records

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Department settings | modal | `src/applications/hq/index.tsx:1424` |  |  |  |
| invite member | modal | `src/applications/hq/index.tsx:1425` |  |  |  |
| permission inspector | drawer | `src/applications/hq/index.tsx:1431` |  |  |  |

## ARL-HQ-006 · Organization Chart  
Route `/o/:org/hq/organization` · sample `nl-members-001` · archetype graph · collection `members`  
Tabs: People, Departments, AI employees  
Actions: Pan zoom, focus node, modify reporting line, switch tree/list  
Edge: Cycle in management graph rejected; accessible non-spatial list required

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Member inspector | drawer | `src/applications/hq/index.tsx:1452` |  |  |  |
| change manager | modal | `src/applications/hq/index.tsx:1453` | F |  |  |
| impact confirmation | modal | `src/applications/hq/index.tsx:1454` |  |  |  |

## ARL-HQ-007 · Company Goals  
Route `/o/:org/hq/goals` · sample `nl-objectives-001` · archetype board · collection `objectives`  
Tabs: Active, Proposed, Achieved, Archived  
Actions: Create objective, link mission, update measure, review goal  
Edge: Do not mark achieved from model text without target-data confirmation

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Goal editor | modal | `src/applications/hq/index.tsx:1474` | F |  |  |
| target change review | modal | `src/applications/hq/index.tsx:1475` | F |  |  |
| related work inspector | drawer | `src/applications/hq/index.tsx:1476` |  |  |  |

## ARL-HQ-008 · Locations & Entities  
Route `/o/:org/hq/locations` · sample `nl-locations-001` · archetype directory · collection `locations`  
Tabs: Locations, Legal entities, Brands, Operating calendars  
Actions: Add location, set primary office, choose scope, edit local details  
Edge: Cross-location transfers require correct local dates and authorized data access

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Location form | modal | `src/applications/hq/index.tsx:1498` | F |  |  |
| scope preview | drawer | `src/applications/hq/index.tsx:1499` | F |  |  |
| duplicate checker | modal | `src/applications/hq/index.tsx:1510` |  |  |  |

## ARL-HQ-009 · Company Timeline  
Route `/o/:org/hq/timeline` · sample `nl-timelineEvents-001` · archetype timeline · collection `timelineEvents`  
Tabs: All, Decisions, Financial, People, Technology  
Actions: Filter, inspect source, add milestone, export history  
Edge: Restricted events remain hidden from unauthorized timeline viewers

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Event inspector | drawer | `src/applications/hq/index.tsx:1532` |  |  |  |
| add annotation | modal | `src/applications/hq/index.tsx:1536` | F |  |  |
| export selection | modal | `src/applications/hq/index.tsx:1559` |  |  |  |

## ARL-HQ-010 · Workplace Directory  
Route `/o/:org/hq/directory` · sample `nl-members-001` · archetype directory · collection `members`  
Tabs: Humans, AI, Departments, Skills  
Actions: Find colleague, start conversation, assign task, view profile  
Edge: Personal contact details governed by member privacy settings

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Profile quick view | drawer | `src/applications/hq/index.tsx:1578` |  |  |  |
| presence settings | modal | `src/applications/hq/index.tsx:1582` |  |  |  |
