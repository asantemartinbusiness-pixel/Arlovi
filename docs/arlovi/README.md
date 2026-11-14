# ARLOVI — COMPLETE INTERACTIVE FRONTEND EXECUTION PACKAGE

**Target:** all 35 native app/workspace domains, 316 screen specs, 1323 tab instances, 956 overlays, 1328 action instances and 20 cross-app workflows.

**Execution environment:** empty Git repository, Cursor Agent with Grok preferred as orchestration model where available, six coordinated executive workstreams. **Scope:** full interactive frontend only; absolutely no backend development at this stage. No MVP or reduced product scope.

## How to use
1. Extract the ZIP into the empty repository under `docs/arlovi/` (or copy the folder there). Preserve all file paths.
2. Copy the included `.cursor/rules/arlovi-complete-frontend.mdc` to the repository's `.cursor/rules/` directory. Optionally copy `01_CURSOR_PROMPTS/ARLOVI_CURSOR_BOOTSTRAP.txt` as a small paste prompt.
3. Open the repository in Cursor and paste `01_CURSOR_PROMPTS/ARLOVI_MASTER_CURSOR_GROK_PROMPT.md` into Agent. Set Grok as orchestrator if installed/available, with available subagents for the six workstreams.
4. Let Cursor read `07_ORIGINAL_SPECIFICATIONS/Arlovi_Complete_UX_Screen_Registry.json` and the detailed source spec. Insist on code, working app, tests and evidence, not plans only.
5. Run package audit `python docs/arlovi/06_MACHINE_READABLE/validate_package.py` to check source baseline. The Cursor team must add an implementation-coverage checker that fails on missing real code/tests.

## Files
- `01_CURSOR_PROMPTS/ARLOVI_MASTER_CURSOR_GROK_PROMPT.md`: detailed copy-and-paste executive execution directive.
- `01_CURSOR_PROMPTS/ARLOVI_CURSOR_BOOTSTRAP.txt`: shorter pointer prompt when pasting a large prompt is inconvenient.
- `02_PRODUCT_AND_UX/CONVERSATION_AND_DECISION_RECORD.md`: consolidated conversation requirements, including brand, AI, notifications, visuals and user directives (not a verbatim transcript).
- `02_PRODUCT_AND_UX/COMPLETE_SCOPE_CONTRACT.md`: no-MVP, whole-product and frontend-only boundaries.
- `02_PRODUCT_AND_UX/UX_DESIGN_SYSTEM_AND_INTERACTION_CONTRACT.md`: tokens, motion, responsive, tabs/drawers/dialogs, data visualization, density.
- `02_PRODUCT_AND_UX/ALL_20_CROSS_APPLICATION_USER_JOURNEYS.md`: full workflow contracts and browser-local completion evidence.
- `03_ARCHITECTURE/FRONTEND_RUNTIME_AND_DOMAIN_ARCHITECTURE.md`: component, state, IndexedDB, events, agent ports, security boundary.
- `03_ARCHITECTURE/FRONTEND_CAPABILITY_PARITY_AND_TRUTHFUL_STATUS.md`: real browser functionality vs external provider limitations.
- `03_ARCHITECTURE/TEAM_PROTOCOL_AND_EXECUTIVE_DECISION_LOG.md`: workstream coordination, decision governance and reviews.
- `04_WORKSTREAMS/WS*.md`: exact owned app and page IDs, layouts, interactions, AI, edge cases and acceptance for each of six streams.
- `05_QUALITY_AND_ACCEPTANCE/QUALITY_GATES_AND_PEER_REVIEW.md`: evidence, test matrix and ship gates.
- `06_MACHINE_READABLE/`: complete route/owner/coverage CSV, JSON, manifests, validation script.
- `07_ORIGINAL_SPECIFICATIONS/`: the original full Word engineering handoff, Markdown specification and machine-readable screen registry (source of truth).
- `.cursor/rules/`: Cursor persistent instructions.

## Evidence and honesty
The user expects a finished-looking product. This package is an **implementation directive**, not the implemented frontend. The frontend must be real and interactable in-browser; provider-dependent effects cannot truthfully occur without future connections. User-facing screens must not be labelled MVP/demo/prototype; local service states must remain honest.

## Existing specification status
The retained Word document is the original comprehensive handoff (226 pages as previously reported). Source Markdown and JSON preserve the detailed 35-domain/316-screen registry. This package synthesizes the visible conversation decisions; it does **not** claim to include a literal byte-for-byte export of private chat message history.
