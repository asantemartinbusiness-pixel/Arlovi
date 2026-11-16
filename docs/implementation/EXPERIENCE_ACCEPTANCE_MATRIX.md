# Arlovi — Independent UX and Feature Acceptance Matrix

**Basis:** complete approved 316-screen catalogue at `src/generated/catalog.json`. **Scope:** each screen's unique regions, tabs, overlays, named actions, AI/provenance and edge states.

**Do not confuse this independent visual/functional acceptance gate with `SCREEN_LEDGER.md`.** The legacy registry tests report all routes, tabs, overlays and named action declarations. They do not establish that every form was submitted, each canvas/editing operation verified, all accessibility states inspected, or each visual layout signed off. Existing implementation should be preserved while completing the outstanding axes.

**Approval requires every axis:** visual screenshot inspected on desktop/mobile, named action side effect persisted, every form submit and validation path exercised, keyboard focus and escape tested, zoom/reflow responsive, WCAG tests, edge/empty/error state and independent reviewer sign-off.

| Workstream | Screen ID | App | Page | Tabs | Actions | Overlays | Visual | Form/Actions | Keyboard | Responsive | A11y | Independent |
|---|---|---|---|---:|---:|---:|---|---|---|---|---|---|
| WS1 | `ARL-HQ-001` | HQ | Executive Home | 3 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS1 | `ARL-HQ-002` | HQ | My Workspace | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS1 | `ARL-HQ-003` | HQ | Company Overview | 4 | 3 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS1 | `ARL-HQ-004` | HQ | Departments Directory | 3 | 4 | 2 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS1 | `ARL-HQ-005` | HQ | Department Workspace | 6 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS1 | `ARL-HQ-006` | HQ | Organization Chart | 3 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS1 | `ARL-HQ-007` | HQ | Company Goals | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS1 | `ARL-HQ-008` | HQ | Locations & Entities | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS1 | `ARL-HQ-009` | HQ | Company Timeline | 5 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS1 | `ARL-HQ-010` | HQ | Workplace Directory | 4 | 4 | 2 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-AI-001` | AI | Chief of Staff Chat | 3 | 6 | 4 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-AI-002` | AI | Conversation Library | 4 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-AI-003` | AI | Specialist Chat | 3 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-AI-004` | AI | Team Room | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-AI-005` | AI | Mission Room | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-AI-006` | AI | Voice Workspace | 3 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-AI-007` | AI | AI Meeting Room | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-AI-008` | AI | Research Workspace | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-AI-009` | AI | Context Manager | 3 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-AI-010` | AI | Conversation Artifacts | 4 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-BRAIN-001` | BRAIN | Knowledge Home | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-BRAIN-002` | BRAIN | Source Library | 4 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-BRAIN-003` | BRAIN | Source Detail | 5 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-BRAIN-004` | BRAIN | Business Graph | 3 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-BRAIN-005` | BRAIN | Fact Registry | 4 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-BRAIN-006` | BRAIN | Knowledge Conflicts | 3 | 3 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-BRAIN-007` | BRAIN | Decision Register | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-BRAIN-008` | BRAIN | Brand Intelligence | 6 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-BRAIN-009` | BRAIN | Knowledge Permissions | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-BRAIN-010` | BRAIN | Intake Centre | 5 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-TEAM-001` | TEAM | Workforce Home | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-TEAM-002` | TEAM | AI Employee Directory | 5 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-TEAM-003` | TEAM | Agent Profile | 6 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-TEAM-004` | TEAM | Agent Builder | 6 | 5 | 4 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-TEAM-005` | TEAM | Organization Chart | 3 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-TEAM-006` | TEAM | Skills Library | 4 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-TEAM-007` | TEAM | Agent Academy | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-TEAM-008` | TEAM | Evaluation Lab | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-TEAM-009` | TEAM | Agent Performance | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-TEAM-010` | TEAM | Model Routing | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-MISSION-001` | MISSION | Mission Library | 6 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-MISSION-002` | MISSION | Mission Creation | 6 | 4 | 4 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-MISSION-003` | MISSION | Mission Overview | 6 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-MISSION-004` | MISSION | Plan & Dependencies | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-MISSION-005` | MISSION | Mission Task Board | 3 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-MISSION-006` | MISSION | Execution Console | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-MISSION-007` | MISSION | Mission Team Room | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-MISSION-008` | MISSION | Deliverables Library | 5 | 5 | 4 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-MISSION-009` | MISSION | Mission Budget | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-MISSION-010` | MISSION | Mission Results | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-MISSION-011` | MISSION | Mission Templates | 3 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-FIN-001` | FIN | Finance Overview | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-FIN-002` | FIN | Chart of Accounts | 6 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-FIN-003` | FIN | General Ledger | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-FIN-004` | FIN | Invoice List | 5 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-FIN-005` | FIN | Invoice Detail | 4 | 6 | 4 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-FIN-006` | FIN | Bills & Payables | 5 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-FIN-007` | FIN | Expenses | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-FIN-008` | FIN | Banking & Feeds | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-FIN-009` | FIN | Bank Reconciliation | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-FIN-010` | FIN | Budgets & Forecasts | 4 | 3 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-FIN-011` | FIN | Tax & Compliance | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-FIN-012` | FIN | Financial Reports | 4 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-FIN-013` | FIN | Multi-Entity Finance | 4 | 3 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-CRM-001` | CRM | CRM Overview | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-CRM-002` | CRM | Contacts | 4 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-CRM-003` | CRM | Contact Profile | 5 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-CRM-004` | CRM | Companies | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-CRM-005` | CRM | Leads & Qualification | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-CRM-006` | CRM | Deals Pipeline | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-CRM-007` | CRM | Deal Detail | 5 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-CRM-008` | CRM | Quotes & Proposals | 5 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-CRM-009` | CRM | Activities & Scheduling | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-CRM-010` | CRM | Sales Forecasts | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-CRM-011` | CRM | Sales Automation | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-HR-001` | HR | People Overview | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-HR-002` | HR | Employee Directory | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-HR-003` | HR | Employee Profile | 6 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-HR-004` | HR | Recruitment Pipeline | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-HR-005` | HR | Applicant Profile | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-HR-006` | HR | Onboarding Centre | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-HR-007` | HR | Leave & Absence | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-HR-008` | HR | Scheduling & Time | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-HR-009` | HR | Payroll | 4 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-HR-010` | HR | Performance Reviews | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-HR-011` | HR | Learning & Policies | 4 | 3 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-PROJECT-001` | PROJECT | Project Portfolio | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-PROJECT-002` | PROJECT | Project Directory | 4 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-PROJECT-003` | PROJECT | Project Overview | 6 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-PROJECT-004` | PROJECT | Task Board | 4 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-PROJECT-005` | PROJECT | Task Detail | 4 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-PROJECT-006` | PROJECT | Timeline & Dependencies | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-PROJECT-007` | PROJECT | Resource Workload | 4 | 3 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-PROJECT-008` | PROJECT | Project Templates | 3 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-PROJECT-009` | PROJECT | Goals & OKRs | 4 | 3 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-PROJECT-010` | PROJECT | Time & Cost | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-COMMS-001` | COMMS | Communications Home | 5 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-COMMS-002` | COMMS | Channels | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-COMMS-003` | COMMS | Channel Conversation | 4 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-COMMS-004` | COMMS | Direct Messages | 4 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-COMMS-005` | COMMS | Email Inbox | 5 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-COMMS-006` | COMMS | Email Thread | 3 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-COMMS-007` | COMMS | Calendar | 5 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-COMMS-008` | COMMS | Meeting Room | 4 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-COMMS-009` | COMMS | Calls & Voicemail | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-COMMS-010` | COMMS | Announcements | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-COMMS-011` | COMMS | Communication Preferences | 4 | 3 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-CARE-001` | CARE | Service Overview | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-CARE-002` | CARE | Omnichannel Inbox | 5 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-CARE-003` | CARE | Ticket List | 5 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-CARE-004` | CARE | Ticket Detail | 5 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-CARE-005` | CARE | Customer Context | 4 | 3 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-CARE-006` | CARE | Knowledge Base | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-CARE-007` | CARE | Macros & Automation | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-CARE-008` | CARE | Service SLAs | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-CARE-009` | CARE | Quality & Satisfaction | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS4 | `ARL-MARKET-001` | MARKET | Marketing Overview | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS4 | `ARL-MARKET-002` | MARKET | Campaign Library | 5 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS4 | `ARL-MARKET-003` | MARKET | Campaign Detail | 6 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS4 | `ARL-MARKET-004` | MARKET | Content Calendar | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS4 | `ARL-MARKET-005` | MARKET | Social Publishing | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS4 | `ARL-MARKET-006` | MARKET | Email Campaigns | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS4 | `ARL-MARKET-007` | MARKET | Audience Segments | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS4 | `ARL-MARKET-008` | MARKET | Advertising | 5 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS4 | `ARL-MARKET-009` | MARKET | SEO & Content | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS4 | `ARL-MARKET-010` | MARKET | Landing Pages | 4 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS4 | `ARL-MARKET-011` | MARKET | Attribution & Analytics | 5 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS4 | `ARL-MARKET-012` | MARKET | Marketing Templates | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS4 | `ARL-COMMERCE-001` | COMMERCE | Commerce Overview | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS4 | `ARL-COMMERCE-002` | COMMERCE | Products | 5 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS4 | `ARL-COMMERCE-003` | COMMERCE | Product Detail | 6 | 4 | 4 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS4 | `ARL-COMMERCE-004` | COMMERCE | Inventory | 4 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS4 | `ARL-COMMERCE-005` | COMMERCE | Orders | 5 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS4 | `ARL-COMMERCE-006` | COMMERCE | Order Detail | 5 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS4 | `ARL-COMMERCE-007` | COMMERCE | Storefront Builder | 5 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS4 | `ARL-COMMERCE-008` | COMMERCE | Checkout & Payments | 4 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS4 | `ARL-COMMERCE-009` | COMMERCE | Fulfilment & Shipping | 5 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS4 | `ARL-COMMERCE-010` | COMMERCE | Returns & Refunds | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS4 | `ARL-COMMERCE-011` | COMMERCE | Promotions & Pricing | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS4 | `ARL-COMMERCE-012` | COMMERCE | Commerce Analytics | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS4 | `ARL-BOOK-001` | BOOK | Bookings Overview | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS4 | `ARL-BOOK-002` | BOOK | Booking Calendar | 5 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS4 | `ARL-BOOK-003` | BOOK | Booking Detail | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS4 | `ARL-BOOK-004` | BOOK | Services & Pricing | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS4 | `ARL-BOOK-005` | BOOK | Staff & Resources | 4 | 3 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS4 | `ARL-BOOK-006` | BOOK | Public Booking Page | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS4 | `ARL-BOOK-007` | BOOK | Reminders & No-shows | 4 | 3 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS4 | `ARL-BOOK-008` | BOOK | Booking Reports | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-DOCS-001` | DOCS | Document Library | 5 | 5 | 4 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-DOCS-002` | DOCS | Document Editor | 4 | 6 | 5 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-DOCS-003` | DOCS | Outline & Navigation | 3 | 4 | 2 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-DOCS-004` | DOCS | Review & Comments | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-DOCS-005` | DOCS | Templates | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-DOCS-006` | DOCS | Publishing & Export | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-DOCS-007` | DOCS | Document Insights | 4 | 3 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-SHEETS-001` | SHEETS | Workbook Library | 4 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-SHEETS-002` | SHEETS | Grid Editor | 5 | 7 | 4 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-SHEETS-003` | SHEETS | Formula Manager | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-SHEETS-004` | SHEETS | Data Tables | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-SHEETS-005` | SHEETS | Charts & Dashboards | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-SHEETS-006` | SHEETS | Import & Export | 4 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-SHEETS-007` | SHEETS | Collaboration & Versioning | 4 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-PRESENT-001` | PRESENT | Presentation Library | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-PRESENT-002` | PRESENT | Slide Editor | 5 | 6 | 4 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-PRESENT-003` | PRESENT | Master & Theme Editor | 4 | 3 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-PRESENT-004` | PRESENT | Charts & Data | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-PRESENT-005` | PRESENT | Transitions & Animation | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-PRESENT-006` | PRESENT | Presenter Mode | 3 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-PRESENT-007` | PRESENT | Review & Publish | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-DESIGN-001` | DESIGN | Design Files | 4 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-DESIGN-002` | DESIGN | Design Canvas | 4 | 8 | 4 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-DESIGN-003` | DESIGN | Layers & Pages | 4 | 6 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-DESIGN-004` | DESIGN | Vector Path Editor | 4 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-DESIGN-005` | DESIGN | Auto Layout & Responsive | 4 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-DESIGN-006` | DESIGN | Components & Variants | 4 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-DESIGN-007` | DESIGN | Typography & Styles | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-DESIGN-008` | DESIGN | Prototype & Interactions | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-DESIGN-009` | DESIGN | Assets & Export | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-DESIGN-010` | DESIGN | Design Review | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-PHOTO-001` | PHOTO | Photo Library | 4 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-PHOTO-002` | PHOTO | Raster Editor | 4 | 6 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-PHOTO-003` | PHOTO | Selections & Masks | 4 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-PHOTO-004` | PHOTO | Adjustments & Colour | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-PHOTO-005` | PHOTO | Compositing & Layers | 4 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-PHOTO-006` | PHOTO | Batch Processing | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-PHOTO-007` | PHOTO | Photo Export | 3 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-LAYOUT-001` | LAYOUT | Publication Library | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-LAYOUT-002` | LAYOUT | Publication Editor | 4 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-LAYOUT-003` | LAYOUT | Master Pages | 3 | 4 | 2 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-LAYOUT-004` | LAYOUT | Typography & Flow | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-LAYOUT-005` | LAYOUT | Print & Preflight | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-VIDEO-001` | VIDEO | Video Projects | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-VIDEO-002` | VIDEO | Video Timeline | 5 | 6 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-VIDEO-003` | VIDEO | Media Bin | 4 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-VIDEO-004` | VIDEO | Audio Mixer | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-VIDEO-005` | VIDEO | Captions & Transcript | 4 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-VIDEO-006` | VIDEO | Colour & Effects | 4 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-VIDEO-007` | VIDEO | Video Export & Render | 4 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-VIDEO-008` | VIDEO | Video Review | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-MOTION-001` | MOTION | Motion Projects | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-MOTION-002` | MOTION | Composition Editor | 4 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-MOTION-003` | MOTION | Easing & Timing | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-MOTION-004` | MOTION | Interactive Motion | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS5 | `ARL-MOTION-005` | MOTION | Motion Export | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS6 | `ARL-WEB-001` | WEB | Website Directory | 4 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS6 | `ARL-WEB-002` | WEB | Site Dashboard | 5 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS6 | `ARL-WEB-003` | WEB | Visual Page Builder | 4 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS6 | `ARL-WEB-004` | WEB | Component Library | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS6 | `ARL-WEB-005` | WEB | CMS Editor | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS6 | `ARL-WEB-006` | WEB | Site Navigation | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS6 | `ARL-WEB-007` | WEB | Forms & Integrations | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS6 | `ARL-WEB-008` | WEB | SEO & Accessibility | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS6 | `ARL-WEB-009` | WEB | Domains & Publishing | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS6 | `ARL-WEB-010` | WEB | Web Analytics | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS6 | `ARL-BUILD-001` | BUILD | App Project Library | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS6 | `ARL-BUILD-002` | BUILD | Application Overview | 5 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS6 | `ARL-BUILD-003` | BUILD | Visual App Builder | 5 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS6 | `ARL-BUILD-004` | BUILD | Code Editor | 4 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS6 | `ARL-BUILD-005` | BUILD | Database Designer | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS6 | `ARL-BUILD-006` | BUILD | API & Functions | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS6 | `ARL-BUILD-007` | BUILD | Authentication & Roles | 4 | 3 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS6 | `ARL-BUILD-008` | BUILD | Testing & QA | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS6 | `ARL-BUILD-009` | BUILD | Deployments & Environments | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS6 | `ARL-BUILD-010` | BUILD | Integrations & Secrets | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS6 | `ARL-BUILD-011` | BUILD | App Analytics & Monitoring | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS6 | `ARL-FORMS-001` | FORMS | Forms Directory | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS6 | `ARL-FORMS-002` | FORMS | Visual Form Builder | 5 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS6 | `ARL-FORMS-003` | FORMS | Conditional Logic | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS6 | `ARL-FORMS-004` | FORMS | Form Submissions | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS6 | `ARL-FORMS-005` | FORMS | Form Design & Publish | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS6 | `ARL-FORMS-006` | FORMS | Form Analytics | 4 | 3 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-AUTO-001` | AUTO | Automation Library | 5 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-AUTO-002` | AUTO | Visual Workflow Builder | 4 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-AUTO-003` | AUTO | Trigger Configuration | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-AUTO-004` | AUTO | Action & AI Nodes | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-AUTO-005` | AUTO | Workflow Testing | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-AUTO-006` | AUTO | Run History | 5 | 3 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-AUTO-007` | AUTO | Workflow Run Detail | 5 | 3 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-AUTO-008` | AUTO | Schedules & Queues | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-AUTO-009` | AUTO | Automation Exceptions | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-ANALYTICS-001` | ANALYTICS | Insights Overview | 5 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-ANALYTICS-002` | ANALYTICS | Dashboard Directory | 4 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-ANALYTICS-003` | ANALYTICS | Dashboard Editor | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-ANALYTICS-004` | ANALYTICS | Report Builder | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-ANALYTICS-005` | ANALYTICS | Dataset Catalogue | 4 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-ANALYTICS-006` | ANALYTICS | Metric Definitions | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-ANALYTICS-007` | ANALYTICS | Data Modelling | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-ANALYTICS-008` | ANALYTICS | Forecasts & Scenarios | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS2 | `ARL-ANALYTICS-009` | ANALYTICS | Reports & Distribution | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS4 | `ARL-PROC-001` | PROC | Procurement Overview | 4 | 3 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS4 | `ARL-PROC-002` | PROC | Suppliers | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS4 | `ARL-PROC-003` | PROC | Supplier Detail | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS4 | `ARL-PROC-004` | PROC | Purchase Requisitions | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS4 | `ARL-PROC-005` | PROC | Purchase Orders | 5 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS4 | `ARL-PROC-006` | PROC | Warehouse Locations | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS4 | `ARL-PROC-007` | PROC | Receiving & Scanning | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS4 | `ARL-PROC-008` | PROC | Stock Movements | 4 | 3 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS4 | `ARL-PROC-009` | PROC | Replenishment | 4 | 3 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS4 | `ARL-PROC-010` | PROC | Procurement Analytics | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS6 | `ARL-CONNECT-001` | CONNECT | Integration Marketplace | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS6 | `ARL-CONNECT-002` | CONNECT | Connector Detail | 5 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS6 | `ARL-CONNECT-003` | CONNECT | Connection Wizard | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS6 | `ARL-CONNECT-004` | CONNECT | Installed Connections | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS6 | `ARL-CONNECT-005` | CONNECT | Connection Detail | 5 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS6 | `ARL-CONNECT-006` | CONNECT | Capability Registry | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS6 | `ARL-CONNECT-007` | CONNECT | Synchronization Centre | 4 | 3 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS6 | `ARL-CONNECT-008` | CONNECT | Connector Health | 4 | 3 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS6 | `ARL-CONNECT-009` | CONNECT | Custom Connectors | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS6 | `ARL-CONNECT-010` | CONNECT | Action Receipts | 5 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS6 | `ARL-IT-001` | IT | IT Operations Home | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS6 | `ARL-IT-002` | IT | Incident Queue | 4 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS6 | `ARL-IT-003` | IT | Incident Detail | 5 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS6 | `ARL-IT-004` | IT | System Health | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS6 | `ARL-IT-005` | IT | Logs & Tracing | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS6 | `ARL-IT-006` | IT | Automated Remediation | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS6 | `ARL-IT-007` | IT | Release Management | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS6 | `ARL-IT-008` | IT | Security Centre | 5 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS6 | `ARL-IT-009` | IT | Reliability Reports | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS1 | `ARL-INBOX-001` | INBOX | Unified Inbox | 5 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS1 | `ARL-INBOX-002` | INBOX | Approvals | 4 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS1 | `ARL-INBOX-003` | INBOX | Messages Inbox | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS1 | `ARL-INBOX-004` | INBOX | Notifications Feed | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS1 | `ARL-INBOX-005` | INBOX | Incident Alerts | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS1 | `ARL-INBOX-006` | INBOX | Notification Preferences | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS1 | `ARL-INBOX-007` | INBOX | Digest Centre | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS1 | `ARL-INBOX-008` | INBOX | Escalations & Delegation | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS1 | `ARL-ADMIN-001` | ADMIN | Organization Settings | 4 | 3 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS1 | `ARL-ADMIN-002` | ADMIN | Members & Invitations | 4 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS1 | `ARL-ADMIN-003` | ADMIN | Roles & Permissions | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS1 | `ARL-ADMIN-004` | ADMIN | Autonomy Centre | 5 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS1 | `ARL-ADMIN-005` | ADMIN | Budget & AI Usage | 5 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS1 | `ARL-ADMIN-006` | ADMIN | Security & Sessions | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS1 | `ARL-ADMIN-007` | ADMIN | Audit Trail | 5 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS1 | `ARL-ADMIN-008` | ADMIN | Privacy & Data Controls | 5 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS1 | `ARL-ADMIN-009` | ADMIN | Billing & Subscription | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS1 | `ARL-ADMIN-010` | ADMIN | Backups & Recovery | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS1 | `ARL-ADMIN-011` | ADMIN | Environment & Developer Access | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-LEGAL-001` | LEGAL | Governance Overview | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-LEGAL-002` | LEGAL | Contract Library | 5 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-LEGAL-003` | LEGAL | Contract Detail | 5 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-LEGAL-004` | LEGAL | Policy Register | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-LEGAL-005` | LEGAL | Obligation Calendar | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-LEGAL-006` | LEGAL | Risk Register | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS3 | `ARL-LEGAL-007` | LEGAL | Audit & Evidence | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS4 | `ARL-PORTAL-001` | PORTAL | Portal Directory | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS4 | `ARL-PORTAL-002` | PORTAL | Portal Builder | 5 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS4 | `ARL-PORTAL-003` | PORTAL | External Dashboard | 5 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS4 | `ARL-PORTAL-004` | PORTAL | Shared Documents | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS4 | `ARL-PORTAL-005` | PORTAL | External Messaging | 3 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS4 | `ARL-PORTAL-006` | PORTAL | Portal Billing & Requests | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS4 | `ARL-PORTAL-007` | PORTAL | Portal Access & Analytics | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS1 | `ARL-ASSET-001` | ASSET | Asset Library | 5 | 5 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS1 | `ARL-ASSET-002` | ASSET | Asset Detail | 5 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS1 | `ARL-ASSET-003` | ASSET | Brand Kits | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS1 | `ARL-ASSET-004` | ASSET | Media Transformations | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |
| WS1 | `ARL-ASSET-005` | ASSET | Asset Usage & Governance | 4 | 4 | 3 | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting | Awaiting |

## How to use

1. Run `VISUAL_SWEEP=1 npm run test:visual`; the screenshots are evidence, not approvals. To examine a broader device matrix use `VISUAL_VIEWPORTS=320x640,390x844,768x1024,1024x768,1366x768,1440x900,1920x1080`.
2. Review each screen against `src/generated/catalog.json` and the full `docs/arlovi` specification. Every visible named action must carry its intended side effect; every dialog must submit, fail and recover as appropriate.
3. Attach screenshots, tests, and human reviewer sign-off to the separate JSON acceptance register. Only change `awaiting` to `passed` on independent evidence. A bounded external service remains explicitly `not_connected` and may not be represented as a completed real action.
4. All six workstreams are mandatory simultaneously. Do not interpret the workstream ownership as an MVP or an exclusion.
