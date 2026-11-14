# Six-Workstream Engineering Organization and Decision Protocol

## Leadership
- Grok Executive Orchestrator (if installed/available): acting executive product/architecture lead, code integration owner, final QA authority. Fallback to strongest available model if Grok unavailable.
- WS1 Principal Experience Architect; WS2 Principal AI and Orchestration Architect; WS3 Principal Enterprise Applications Architect; WS4 Principal Commerce/Growth Architect; WS5 Principal Creative Technology Architect; WS6 Principal Platform/QA Architect.
- Delegate subagents for application UX, component engineering, tests, data models, accessibility, regression and design reviews as supported by actual Cursor tools. No manufactured fictional agent sessions.

## Six cross-architecture agreements
1. Single typed route and canonical entity registry.
2. Shared design tokens and component conventions; application-specific editor exceptions documented.
3. Browser-local repository/event/state/action interface; seeded test data has referential integrity.
4. Core service capability adapter for unavailable remote services; no fake completed operations.
5. Shared policy/context/authorization UX with explicit frontend-only limitation.
6. Test and traceability contract, including per-screen evidence and independent reviewers.

## Handling disagreement
Write short ADR for decisions with: options, constraints, UX effect, maintainability, security/privacy, performance, accessibility, cost/licensing and final rationale. Orchestrator chooses defaults, escalates only actual user authorization/business/legal material choices. Do not stall on arbitrary styling preference; use approved visual direction.

## Parallelism and file ownership
Build common contracts early while parallel owned features proceed. Avoid writing same shared file from multiple agents; use PR/branch discipline and cross-review. Integrate continuously and fix mismatch immediately. No agent declares "complete" solely because their local branch compiles.

## Iterative leadership loop
- Inspect coverage and blockers.
- Assign specialist tasks to agents with exact screen IDs and acceptance gates.
- Implement and exercise browser.
- Peer review distinct view, functionality, a11y and persistence.
- Reassign defects with evidence.
- Integrate, rerun tests, then advance; continue until full 316 coverage and all 20 journeys are verified.

## No deferred scope
Engineering dependencies and internal build ordering do not create MVPs or roadmap omissions. The entire native suite and every registered interaction remain in target scope. The platform can be reported complete only when all scope is verified or blockers are openly disclosed.
