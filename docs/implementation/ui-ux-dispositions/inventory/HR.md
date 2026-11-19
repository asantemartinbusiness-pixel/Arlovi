# HR · screen and overlay inventory (generated from src/generated/catalog.json + scripts/audit-native-overlays.mjs)

Regenerated 2026-11-19. Columns: source = where the overlay is declared; flags = D description, G guidance, C capability, F footer.


## ARL-HR-001 · People Overview  
Route `/o/:org/hr/home` · sample `nl-employees-001` · archetype dashboard · collection `employees`  
Tabs: Overview, My team, HR tasks, Trends  
Actions: View employee, approve request, start hire, inspect metric  
Edge: Sensitive HR metrics aggregated by privacy policy

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Staffing alert | drawer | `src/applications/hr/index.tsx:359` |  |  |  |
| leave approval | drawer | `src/applications/hr/index.tsx:360` |  |  |  |
| new position | modal | `src/applications/hr/index.tsx:361` | F |  |  |

## ARL-HR-002 · Employee Directory  
Route `/o/:org/hr/employees` · sample `nl-employees-001` · archetype directory · collection `employees`  
Tabs: People, Teams, Contractors, Alumni  
Actions: Search, invite, filter, open profile  
Edge: Personal contact details protected against broad AI retrieval

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Invite employee | modal | `src/applications/hr/index.tsx:380` |  |  |  |
| directory card | drawer | `src/applications/hr/index.tsx:438` |  |  |  |
| export permissions | modal | `src/applications/hr/index.tsx:439` |  |  |  |

## ARL-HR-003 · Employee Profile  
Route `/o/:org/hr/employees/:id` · sample `nl-employees-001` · archetype record · collection `employees`  
Tabs: Overview, Job, Documents, Leave, Performance, Access  
Actions: Update profile, request change, upload document, offboard  
Edge: Terminated employee access revoked and queued grants rescinded

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Contract upload | modal | `src/applications/hr/index.tsx:469` | F |  |  |
| access request | modal | `src/applications/hr/index.tsx:472` | F |  |  |
| offboarding confirmation | modal | `src/applications/hr/index.tsx:473` | GC |  |  |

## ARL-HR-004 · Recruitment Pipeline  
Route `/o/:org/hr/recruitment` · sample `nl-applicants-001` · archetype board · collection `applicants`  
Tabs: Positions, Candidates, Interviews, Offers  
Actions: Create role, review applicant, schedule, issue offer  
Edge: Hiring decisions reserved for accountable humans with bias controls

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Job spec editor | modal | `src/applications/hr/index.tsx:493` | F |  |  |
| candidate profile | drawer | `src/applications/hr/index.tsx:494` |  |  |  |
| offer approval | modal | `src/applications/hr/index.tsx:495` |  |  |  |

## ARL-HR-005 · Applicant Profile  
Route `/o/:org/hr/candidates/:id` · sample `nl-applicants-001` · archetype record · collection `applicants`  
Tabs: Overview, Documents, Interviews, Decisions  
Actions: Review, message, schedule, record assessment  
Edge: Retention/consent controls on applicant data

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Applicant communications | drawer | `src/applications/hr/index.tsx:519` |  |  |  |
| interviewer scorecard | drawer | `src/applications/hr/index.tsx:529` |  |  |  |
| rejection preview | modal | `src/applications/hr/index.tsx:530` |  |  |  |

## ARL-HR-006 · Onboarding Centre  
Route `/o/:org/hr/onboarding` · sample `nl-employees-001` · archetype board · collection `employees`  
Tabs: Incoming, In progress, Waiting, Completed  
Actions: Launch checklist, assign mentor, grant request, verify completion  
Edge: Access grant never silently inferred from employment status

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Onboarding template | modal | `src/applications/hr/index.tsx:561` | F |  |  |
| IT access | drawer | `src/applications/hr/index.tsx:562` |  |  |  |
| welcome preview | modal | `src/applications/hr/index.tsx:563` |  |  |  |

## ARL-HR-007 · Leave & Absence  
Route `/o/:org/hr/leave` · sample `nl-leaveRequests-001` · archetype calendar · collection `leaveRequests`  
Tabs: My leave, Team calendar, Approvals, Policy  
Actions: Request leave, approve, decline, adjust balance  
Edge: No private health details exposed in team calendars

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Leave form | modal | `src/applications/hr/index.tsx:594` | F |  |  |
| policy explanation | drawer | `src/applications/hr/index.tsx:595` |  |  |  |
| conflict review | drawer | `src/applications/hr/index.tsx:596` |  |  |  |

## ARL-HR-008 · Scheduling & Time  
Route `/o/:org/hr/scheduling` · sample `nl-shifts-001` · archetype calendar · collection `shifts`  
Tabs: Roster, Timesheets, Availability, Exceptions  
Actions: Drag shift, approve hours, swap, export  
Edge: Time zone and employment rule checks on cross-location shift

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Shift edit | modal | `src/applications/hr/index.tsx:617` | F |  |  |
| time correction | modal | `src/applications/hr/index.tsx:619` | F |  |  |
| overtime approval | drawer | `src/applications/hr/index.tsx:621` |  |  |  |

## ARL-HR-009 · Payroll  
Route `/o/:org/hr/payroll` · sample `nl-payrollRuns-001` · archetype table · collection `payrollRuns`  
Tabs: Runs, Inputs, Approvals, Payslips  
Actions: Prepare run, validate, approve, export, reconcile  
Edge: Jurisdiction-specific compliance cannot be assumed without validation

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Payroll review | drawer | `src/applications/hr/index.tsx:642` | G |  |  |
| exception report | modal | `src/applications/hr/index.tsx:643` |  |  |  |
| submission signoff | modal | `src/applications/hr/index.tsx:644` | GC |  |  |

## ARL-HR-010 · Performance Reviews  
Route `/o/:org/hr/performance` · sample `nl-reviews-001` · archetype report · collection `reviews`  
Tabs: Cycles, My reviews, Team, Templates  
Actions: Create review, assign reviewer, submit, acknowledge  
Edge: AI-generated ratings flagged and human review required

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Review form | modal | `src/applications/hr/index.tsx:666` | F |  |  |
| calibration panel | drawer | `src/applications/hr/index.tsx:667` |  |  |  |
| confidentiality control | modal | `src/applications/hr/index.tsx:668` |  |  |  |

## ARL-HR-011 · Learning & Policies  
Route `/o/:org/hr/learning` · sample `nl-policies-001` · archetype directory · collection `policies`  
Tabs: Courses, Policies, Compliance, My learning  
Actions: Assign course, complete module, acknowledge policy  
Edge: Policy edits versioned, existing acknowledgments preserved

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Course builder | modal | `src/applications/hr/index.tsx:698` | F |  |  |
| quiz | modal | `src/applications/hr/index.tsx:699` |  |  |  |
| policy publication | modal | `src/applications/hr/index.tsx:700` |  |  |  |
