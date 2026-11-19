# INBOX · screen and overlay inventory (generated from src/generated/catalog.json + scripts/audit-native-overlays.mjs)

Regenerated 2026-11-19. Columns: source = where the overlay is declared; flags = D description, G guidance, C capability, F footer.


## ARL-INBOX-001 · Unified Inbox  
Route `/o/:org/inbox/inbox` · sample `nl-notifications-001` · archetype directory · collection `notifications`  
Tabs: For You, Approvals, Messages, Updates, Activity  
Actions: Open record, mark read, snooze, assign, bulk triage  
Edge: Read does not equal approve or resolve

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Notification detail | drawer | `src/applications/inbox/index.tsx:2734` |  |  |  |
| snooze picker | modal | `src/applications/inbox/index.tsx:2735` |  |  |  |
| action preview | modal | `src/applications/inbox/index.tsx:2736` |  |  |  |

## ARL-INBOX-002 · Approvals  
Route `/o/:org/inbox/approvals` · sample `nl-approvals-001` · archetype table · collection `approvals`  
Tabs: Mine, Delegated, Pending, History  
Actions: Review, approve, deny, ask changes, delegate  
Edge: Approval bound to exact action/plan version

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Approval review | drawer | `src/applications/inbox/index.tsx:2756` | G |  |  |
| step-up auth | modal | `src/applications/inbox/index.tsx:2757` |  |  |  |
| scope diff | modal | `src/applications/inbox/index.tsx:2758` |  |  |  |

## ARL-INBOX-003 · Messages Inbox  
Route `/o/:org/inbox/messages` · sample `nl-notifications-001` · archetype chat · collection `notifications`  
Tabs: Unread, Assigned, Mentions, Escalated  
Actions: Reply, open thread, assign, convert to task  
Edge: Message routing honors restricted channel access

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Message inspector | drawer | `src/applications/inbox/index.tsx:2785` |  |  |  |
| reassignment | modal | `src/applications/inbox/index.tsx:2786` |  |  |  |
| mute | modal | `src/applications/inbox/index.tsx:2787` |  |  |  |

## ARL-INBOX-004 · Notifications Feed  
Route `/o/:org/inbox/notifications` · sample `nl-notifications-001` · archetype directory · collection `notifications`  
Tabs: All, Milestones, Routine, Archived  
Actions: Filter, follow source, clear read, open deep-link  
Edge: Broken deep-link shows safe record unavailable page

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Event detail | drawer | `src/applications/inbox/index.tsx:2810` |  |  |  |
| grouped items | modal | `src/applications/inbox/index.tsx:2811` |  |  |  |
| preference quick view | drawer | `src/applications/inbox/index.tsx:2812` |  |  |  |

## ARL-INBOX-005 · Incident Alerts  
Route `/o/:org/inbox/incidents` · sample `nl-notifications-001` · archetype board · collection `notifications`  
Tabs: Urgent, Waiting, Resolved, Security  
Actions: Acknowledge, assign, inspect impact, escalate  
Edge: Platform critical alert delivery respects OS authorization

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Incident summary | drawer | `src/applications/inbox/index.tsx:2837` |  |  |  |
| owner handoff | modal | `src/applications/inbox/index.tsx:2838` |  |  |  |
| emergency pause | modal | `src/applications/inbox/index.tsx:2839` |  |  |  |

## ARL-INBOX-006 · Notification Preferences  
Route `/o/:org/inbox/settings` · sample `nl-notifications-001` · archetype settings · collection `notifications`  
Tabs: Channels, Categories, Schedule, Delegation  
Actions: Toggle, test preview, set digest, mute mission  
Edge: Security escalation policy independent from casual muting

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Delivery test | modal | `src/applications/inbox/index.tsx:2879` |  |  |  |
| quiet-hour rules | modal | `src/applications/inbox/index.tsx:2880` | F |  |  |
| exception explanation | drawer | `src/applications/inbox/index.tsx:2881` |  |  |  |

## ARL-INBOX-007 · Digest Centre  
Route `/o/:org/inbox/digests` · sample `nl-notifications-001` · archetype report · collection `notifications`  
Tabs: Daily, Weekly, Custom, History  
Actions: Schedule, preview, export, send test  
Edge: No fabricated action count or stale financial totals

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Digest editor | modal | `src/applications/inbox/index.tsx:2909` | F |  |  |
| audience | modal | `src/applications/inbox/index.tsx:2910` |  |  |  |
| schedule | modal | `src/applications/inbox/index.tsx:2911` |  |  |  |

## ARL-INBOX-008 · Escalations & Delegation  
Route `/o/:org/inbox/escalations` · sample `nl-notifications-001` · archetype admin · collection `notifications`  
Tabs: Rules, Coverage, History, Conflicts  
Actions: Assign backup, set condition, simulate, revoke  
Edge: Delegated user never exceeds approval authority

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Delegation grant | modal | `src/applications/inbox/index.tsx:2935` | F |  |  |
| simulation | drawer | `src/applications/inbox/index.tsx:2936` |  |  |  |
| escalation conflict | modal | `src/applications/inbox/index.tsx:2937` |  |  |  |
