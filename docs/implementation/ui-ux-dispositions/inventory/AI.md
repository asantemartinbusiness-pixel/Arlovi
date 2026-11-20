# AI · screen and overlay inventory (generated from src/generated/catalog.json + scripts/audit-native-overlays.mjs)

Regenerated 2026-11-19. Columns: source = where the overlay is declared; flags = D description, G guidance, C capability, F footer.


## ARL-AI-001 · Chief of Staff Chat  
Route `/o/:org/ai/chat` · sample `nl-conversations-001` · archetype chat · collection `conversations`  
Tabs: Chat, Attachments, Related missions  
Actions: Send text, dictate, attach, mention record, open artifact, create mission  
Edge: Ambiguous target account requires clarification before any external action

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Source selector | drawer | `src/applications/ai/index.tsx:2847` |  |  |  |
| upload review | modal | `src/applications/ai/index.tsx:2848` |  |  |  |
| message action menu | drawer | `src/applications/ai/index.tsx:2849` |  |  |  |
| task authorization | modal | `src/applications/ai/index.tsx:2850` | F |  |  |

## ARL-AI-002 · Conversation Library  
Route `/o/:org/ai/conversations` · sample `nl-conversations-001` · archetype directory · collection `conversations`  
Tabs: Recent, Pinned, Shared, Archived  
Actions: Open, rename, archive, delete, search transcript  
Edge: Archived conversations remain subject to legal retention and RBAC

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Thread preview | drawer | `src/applications/ai/index.tsx:2869` |  |  |  |
| delete confirmation | modal | `src/applications/ai/index.tsx:2870` |  |  |  |
| sharing dialog | modal | `src/applications/ai/index.tsx:2871` |  |  |  |

## ARL-AI-003 · Specialist Chat  
Route `/o/:org/ai/agents/:id/chat` · sample `nl-agents-001` · archetype chat · collection `agents`  
Tabs: Conversation, Work, Sources  
Actions: Message specialist, attach record, request handoff, review tool scope  
Edge: Agent unavailable transfers to authorized coordinator without inventing progress

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Agent profile drawer | drawer | `src/applications/ai/index.tsx:2892` |  |  |  |
| permission explainer | drawer | `src/applications/ai/index.tsx:2893` |  |  |  |
| mission escalation | modal | `src/applications/ai/index.tsx:2894` | F |  |  |

## ARL-AI-004 · Team Room  
Route `/o/:org/ai/rooms/:id` · sample `nl-channels-001` · archetype chat · collection `channels`  
Tabs: Discussion, Decisions, Files, Tasks  
Actions: Mention participant, assign task, pin decision, host review  
Edge: Do not allow group chat mentions to override external tool policies

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Participant selector | modal | `src/applications/ai/index.tsx:2915` |  |  |  |
| decision recorder | modal | `src/applications/ai/index.tsx:2916` | F |  |  |
| topic thread | drawer | `src/applications/ai/index.tsx:2917` |  |  |  |

## ARL-AI-005 · Mission Room  
Route `/o/:org/ai/missions/:id/room` · sample `nl-missions-001` · archetype chat · collection `missions`  
Tabs: Discussion, Agents, Tasks, Reviews  
Actions: Request status, assign reviewer, resolve disagreement, link evidence  
Edge: Agent loops and circular delegation detected and stopped

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Task handoff drawer | drawer | `src/applications/ai/index.tsx:2938` |  |  |  |
| evidence inspector | drawer | `src/applications/ai/index.tsx:2939` |  |  |  |
| review dialog | modal | `src/applications/ai/index.tsx:2940` |  |  |  |

## ARL-AI-006 · Voice Workspace  
Route `/o/:org/ai/voice` · sample `nl-meetings-001` · archetype media · collection `meetings`  
Tabs: Live, Transcript, Settings  
Actions: Start stop, mute, change voice, view transcript, correct text  
Edge: No autonomous irreversible action based on misheard transcription

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Mic permission | modal | `src/applications/ai/index.tsx:2963` |  |  |  |
| voice settings | modal | `src/applications/ai/index.tsx:2964` |  |  |  |
| sensitive-action confirmation | modal | `src/applications/ai/index.tsx:2965` |  |  |  |

## ARL-AI-007 · AI Meeting Room  
Route `/o/:org/ai/meetings/:id` · sample `nl-meetings-001` · archetype media · collection `meetings`  
Tabs: Meeting, Transcript, Decisions, Actions  
Actions: Invite agent, request specialist report, create action, end meeting  
Edge: Participant consent and regional recording restrictions enforced

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Recording consent | modal | `src/applications/ai/index.tsx:2984` |  |  |  |
| meeting notes | modal | `src/applications/ai/index.tsx:2985` | F |  |  |
| follow-up approval | modal | `src/applications/ai/index.tsx:2986` | F |  |  |

## ARL-AI-008 · Research Workspace  
Route `/o/:org/ai/research/:id` · sample `nl-facts-001` · archetype report · collection `facts`  
Tabs: Findings, Sources, Methods, Citations  
Actions: Refine question, inspect source, request independent review, publish report  
Edge: Missing private data clearly reported; never infer unverifiable figures as facts

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Source inspector | drawer | `src/applications/ai/index.tsx:3004` |  |  |  |
| confidence note | modal | `src/applications/ai/index.tsx:3005` | F |  |  |
| save report | modal | `src/applications/ai/index.tsx:3006` |  |  |  |

## ARL-AI-009 · Context Manager  
Route `/o/:org/ai/context` · sample `nl-sources-001` · archetype admin · collection `sources`  
Tabs: This chat, Team context, Connected sources  
Actions: Add remove context, inspect grants, redact selection, switch entity  
Edge: Context switch must invalidate cached records from prior organization

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Context picker | drawer | `src/applications/ai/index.tsx:3024` |  |  |  |
| permission explanation | drawer | `src/applications/ai/index.tsx:3025` |  |  |  |
| sensitive data warning | modal | `src/applications/ai/index.tsx:3026` | F |  |  |

## ARL-AI-010 · Conversation Artifacts  
Route `/o/:org/ai/artifacts/:id` · sample `nl-documents-001` · archetype editor · collection `documents`  
Tabs: Preview, Versions, Comments, Sources  
Actions: Open in native app, revise with AI, comment, share, export  
Edge: External publication requires separate mission scope and verification

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Version comparison | modal | `src/applications/ai/index.tsx:3045` |  |  |  |
| share dialog | modal | `src/applications/ai/index.tsx:3046` |  |  |  |
| export dialog | modal | `src/applications/ai/index.tsx:3047` |  |  |  |
