# COMMS · screen and overlay inventory (generated from src/generated/catalog.json + scripts/audit-native-overlays.mjs)

Regenerated 2026-11-19. Columns: source = where the overlay is declared; flags = D description, G guidance, C capability, F footer.


## ARL-COMMS-001 · Communications Home  
Route `/o/:org/comms/home` · sample `nl-channels-001` · archetype dashboard · collection `channels`  
Tabs: Overview, Channels, DMs, Calls, Calendar  
Actions: Join meeting, reply, browse, ask summary  
Edge: Restricted channels not included in AI summaries

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Compose | modal | `src/applications/comms/index.tsx:459` | F |  |  |
| quick switcher | modal | `src/applications/comms/index.tsx:460` |  |  |  |
| notification preferences | modal | `src/applications/comms/index.tsx:461` | F |  |  |

## ARL-COMMS-002 · Channels  
Route `/o/:org/comms/channels` · sample `nl-channels-001` · archetype directory · collection `channels`  
Tabs: All, My channels, Departments, Archived  
Actions: Create channel, join, mute, search  
Edge: Private channel messages never leak to wider company search

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Channel creation | modal | `src/applications/comms/index.tsx:481` | F |  |  |
| member management | drawer | `src/applications/comms/index.tsx:482` |  |  |  |
| channel archive | modal | `src/applications/comms/index.tsx:483` |  |  |  |

## ARL-COMMS-003 · Channel Conversation  
Route `/o/:org/comms/channels/:id` · sample `nl-channels-001` · archetype chat · collection `channels`  
Tabs: Conversation, Files, Pinned, Tasks  
Actions: Reply, thread, mention, pin, create task  
Edge: Mention does not grant tool or file access

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Thread drawer | drawer | `src/applications/comms/index.tsx:506` |  |  |  |
| file preview | drawer | `src/applications/comms/index.tsx:507` |  |  |  |
| moderation report | modal | `src/applications/comms/index.tsx:508` | F |  |  |

## ARL-COMMS-004 · Direct Messages  
Route `/o/:org/comms/messages` · sample `nl-messages-001` · archetype chat · collection `messages`  
Tabs: Recent, Unread, Groups, Archived  
Actions: Send, attach, audio message, call, search  
Edge: Differentiate AI and human sender unmistakably

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Conversation info | drawer | `src/applications/comms/index.tsx:534` |  |  |  |
| add member | modal | `src/applications/comms/index.tsx:535` | F |  |  |
| message actions | modal | `src/applications/comms/index.tsx:536` |  |  |  |

## ARL-COMMS-005 · Email Inbox  
Route `/o/:org/comms/email` · sample `nl-emailThreads-001` · archetype table · collection `emailThreads`  
Tabs: Inbox, Sent, Drafts, Archive, Spam, Shared inboxes, Accounts & domains, Sender identities  
Actions: Compose, reply, forward, label, archive  
Edge: Send requires recipient confirmation for sensitive or bulk cases

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Compose window | modal | `src/applications/comms/index.tsx:559` | F |  |  |
| send confirmation | modal | `src/applications/comms/index.tsx:560` | G |  |  |
| rule editor | modal | `src/applications/comms/index.tsx:561` | F |  |  |

## ARL-COMMS-006 · Email Thread  
Route `/o/:org/comms/email/:id` · sample `nl-emailThreads-001` · archetype record · collection `emailThreads`  
Tabs: Messages, Related records, Activity  
Actions: Reply, add CC, attach, turn into task, block sender  
Edge: External email instructions cannot override agent policies

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Reply editor | modal | `src/applications/comms/index.tsx:598` | F |  |  |
| contact inspector | drawer | `src/applications/comms/index.tsx:599` |  |  |  |
| report phishing | modal | `src/applications/comms/index.tsx:600` |  |  |  |

## ARL-COMMS-007 · Calendar  
Route `/o/:org/comms/calendar` · sample `nl-meetings-001` · archetype calendar · collection `meetings`  
Tabs: Day, Week, Month, Agenda, Team  
Actions: Create event, invite, move, reschedule, find time  
Edge: Provider invite status not assumed accepted

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Event editor | modal | `src/applications/comms/index.tsx:623` | F |  |  |
| conflict inspector | drawer | `src/applications/comms/index.tsx:625` |  |  |  |
| attendee status | drawer | `src/applications/comms/index.tsx:626` |  |  |  |

## ARL-COMMS-008 · Meeting Room  
Route `/o/:org/comms/meetings/:id` · sample `nl-meetings-001` · archetype media · collection `meetings`  
Tabs: Call, Chat, Notes, Participants  
Actions: Mute, share, raise hand, record consent, end  
Edge: Recording law and participant permission enforced

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Device permissions | modal | `src/applications/comms/index.tsx:648` |  |  |  |
| invite | modal | `src/applications/comms/index.tsx:649` | F |  |  |
| recording consent | modal | `src/applications/comms/index.tsx:650` |  |  |  |

## ARL-COMMS-009 · Calls & Voicemail  
Route `/o/:org/comms/calls` · sample `nl-calls-001` · archetype table · collection `calls`  
Tabs: Recent, Missed, Voicemail, Queues  
Actions: Call, return call, attach CRM, play voicemail  
Edge: Emergency calling capabilities never implied unless provided

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Dialer | modal | `src/applications/comms/index.tsx:673` |  |  |  |
| recording notice | modal | `src/applications/comms/index.tsx:674` |  |  |  |
| call transcript | drawer | `src/applications/comms/index.tsx:675` |  |  |  |

## ARL-COMMS-010 · Announcements  
Route `/o/:org/comms/announcements` · sample `nl-announcements-001` · archetype directory · collection `announcements`  
Tabs: All, Draft, Scheduled, Published  
Actions: Draft, target audience, preview, publish  
Edge: Large distribution and sensitive communications require review

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Audience selector | modal | `src/applications/comms/index.tsx:693` | F |  |  |
| post preview | modal | `src/applications/comms/index.tsx:694` |  |  |  |
| publish review | modal | `src/applications/comms/index.tsx:695` |  |  |  |

## ARL-COMMS-011 · Communication Preferences  
Route `/o/:org/comms/preferences` · sample `nl-preferences-001` · archetype settings · collection `preferences`  
Tabs: Identity, Availability, Notifications, Privacy  
Actions: Edit signature, set schedule, connect mailbox  
Edge: Cross-user settings protected by role

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Signature editor | modal | `src/applications/comms/index.tsx:712` | F |  |  |
| account setup | modal | `src/applications/comms/index.tsx:713` |  |  |  |
| privacy warning | modal | `src/applications/comms/index.tsx:714` |  |  |  |
