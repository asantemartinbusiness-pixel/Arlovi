# BOOK · screen and overlay inventory (generated from src/generated/catalog.json + scripts/audit-native-overlays.mjs)

Regenerated 2026-11-19. Columns: source = where the overlay is declared; flags = D description, G guidance, C capability, F footer.


## ARL-BOOK-001 · Bookings Overview  
Route `/o/:org/book/home` · sample `nl-bookings-001` · archetype dashboard · collection `bookings`  
Tabs: Today, Week, Capacity, Insights  
Actions: Create booking, check in, reschedule, ask receptionist  
Edge: Unavailable slot never displayed as confirmed

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Quick booking | drawer | `src/applications/book/index.tsx:79` | F |  |  |
| booking inspector | drawer | `src/applications/book/index.tsx:80` |  |  |  |
| capacity alert | modal | `src/applications/book/index.tsx:81` |  |  |  |

## ARL-BOOK-002 · Booking Calendar  
Route `/o/:org/book/calendar` · sample `nl-bookings-001` · archetype calendar · collection `bookings`  
Tabs: Day, Week, Month, Resource, Staff  
Actions: Drag booking, create, move, cancel, confirm  
Edge: Concurrent booking attempts protected by slot reservation

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Booking form | drawer | `src/applications/book/index.tsx:110` | F |  |  |
| conflict review | drawer | `src/applications/book/index.tsx:111` |  |  |  |
| reschedule notice | modal | `src/applications/book/index.tsx:112` | F |  |  |

## ARL-BOOK-003 · Booking Detail  
Route `/o/:org/book/bookings/:id` · sample `nl-bookings-001` · archetype record · collection `bookings`  
Tabs: Overview, Payments, Messages, History  
Actions: Confirm, reschedule, take payment, send reminder  
Edge: Cancellation fees and notice policies shown before action

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Reschedule | modal | `src/applications/book/index.tsx:139` | F |  |  |
| refund rule | drawer | `src/applications/book/index.tsx:141` |  |  |  |
| customer message | modal | `src/applications/book/index.tsx:142` | F |  |  |

## ARL-BOOK-004 · Services & Pricing  
Route `/o/:org/book/services` · sample `nl-services-001` · archetype table · collection `services`  
Tabs: Services, Categories, Packages, Rules  
Actions: Create service, edit buffers, publish, archive  
Edge: Cannot archive service with unreconciled active bookings

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Service editor | drawer | `src/applications/book/index.tsx:167` | F |  |  |
| pricing review | drawer | `src/applications/book/index.tsx:168` |  |  |  |
| availability test | modal | `src/applications/book/index.tsx:169` |  |  |  |

## ARL-BOOK-005 · Staff & Resources  
Route `/o/:org/book/resources` · sample `nl-resources-001` · archetype calendar · collection `resources`  
Tabs: People, Rooms, Equipment, Availability  
Actions: Set availability, assign resource, block period  
Edge: Linked resource overlap prevents conflicting confirmed slots

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Resource editor | drawer | `src/applications/book/index.tsx:190` | F |  |  |
| conflict dialog | drawer | `src/applications/book/index.tsx:191` |  |  |  |
| recurrence | modal | `src/applications/book/index.tsx:192` | F |  |  |

## ARL-BOOK-006 · Public Booking Page  
Route `/o/:org/book/public/:slug` · sample `nl-services-001` · archetype editor · collection `services`  
Tabs: Design, Availability, Fields, Preview  
Actions: Arrange fields, preview, publish, test  
Edge: Timezone and daylight-saving conversion verified

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Form field inspector | modal | `src/applications/book/index.tsx:215` | F |  |  |
| publish | modal | `src/applications/book/index.tsx:216` |  |  |  |
| privacy policy | drawer | `src/applications/book/index.tsx:217` |  |  |  |

## ARL-BOOK-007 · Reminders & No-shows  
Route `/o/:org/book/reminders` · sample `nl-bookings-001` · archetype builder · collection `bookings`  
Tabs: Rules, Templates, History, Metrics  
Actions: Schedule reminders, edit template, test send  
Edge: Customer contact preferences honored

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Template editor | drawer | `src/applications/book/index.tsx:239` | F |  |  |
| send preview | drawer | `src/applications/book/index.tsx:240` |  |  |  |
| suppression | drawer | `src/applications/book/index.tsx:241` |  |  |  |

## ARL-BOOK-008 · Booking Reports  
Route `/o/:org/book/reports` · sample `nl-bookings-001` · archetype report · collection `bookings`  
Tabs: Utilization, Revenue, No-shows, Forecast  
Actions: Filter, compare, export, schedule  
Edge: Group booking counts reflect real seats and resources

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Metric calculation | drawer | `src/applications/book/index.tsx:266` |  |  |  |
| report design | modal | `src/applications/book/index.tsx:267` | F |  |  |
| source proof | drawer | `src/applications/book/index.tsx:268` |  |  |  |
