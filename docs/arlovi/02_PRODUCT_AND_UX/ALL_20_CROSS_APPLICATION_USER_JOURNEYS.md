# 20 Mandatory Cross-Application User Journeys

Every scenario below requires real browser UI navigation, shared record references and Playwright E2E tests. The target design contract comes from the full 226-page source. For external actions, stop at a truthful connection boundary.

## WF-01 — Company onboarding

**Canonical workflow:** Owner creates organization -> validates website or files -> optionally connects providers -> approves Company Brain profile -> assigns AI team -> configures authority -> creates first mission.

**Shared constraints:** Organization identity, source provenance, plan approvals, no unauthorized connector access.

**Frontend completion evidence:** Create local org and role, import a file, review extracted/entered knowledge, create AI employee, create and activate a local mission; tests verify linked identities and persistence.

**Required E2E assertions:** respective pages route properly; records update durably; role/permission UI behaves; approval and event history captures action; no false third-party verified state; mobile/narrow layout is usable; a failure or blocked branch is tested.

## WF-02 — Cross-department campaign

**Canonical workflow:** Chief of Staff researches commerce/finance -> Marketing and Creative produce plan/assets -> Finance checks margin -> owner approves -> tools publish -> receipts verify -> Insights reports.

**Shared constraints:** Spend reservation, publishing scopes, consent, asset rights, provider confirmation, rollback limitations.

**Frontend completion evidence:** Draft campaign and assets, cross-link products/budget, approve local plan, create scheduled channel drafts and clear nonconnected provider status; verified publication is not faked.

**Required E2E assertions:** respective pages route properly; records update durably; role/permission UI behaves; approval and event history captures action; no false third-party verified state; mobile/narrow layout is usable; a failure or blocked branch is tested.

## WF-03 — Revenue decline investigation

**Canonical workflow:** Owner asks -> Finance reconciles actuals -> Commerce/Marketing/Sales compare drivers -> report separates fact/hypothesis -> plan with assumptions -> explicit change approvals.

**Shared constraints:** Source freshness, double-count prevention, attribution uncertainty.

**Frontend completion evidence:** Derive reports from local Finance/Commerce/CRM records, compare source periods, show provenance, create a recommendation mission; evidence-based results, no fabricated data.

**Required E2E assertions:** respective pages route properly; records update durably; role/permission UI behaves; approval and event history captures action; no false third-party verified state; mobile/narrow layout is usable; a failure or blocked branch is tested.

## WF-04 — Customer request to resolution

**Canonical workflow:** Request enters Service -> contact verified -> AI answers from approved KB or escalates -> order/booking/finance updates if authorized -> customer notified -> case closed with evidence.

**Shared constraints:** Identity, privacy, service SLA and no double-refund.

**Frontend completion evidence:** Local inbound case and customer record, AI/human assignment, draft response, authorized local booking/order action, close with history; no fake external reply.

**Required E2E assertions:** respective pages route properly; records update durably; role/permission UI behaves; approval and event history captures action; no false third-party verified state; mobile/narrow layout is usable; a failure or blocked branch is tested.

## WF-05 — Sales-to-cash

**Canonical workflow:** Lead -> CRM qualify -> proposal -> quote approval -> customer acceptance -> project/order -> invoice -> bank reconciliation -> reporting.

**Shared constraints:** Canonical customer ID, accepted price version, financial posting and audit.

**Frontend completion evidence:** Lead -> deal -> generated quote -> project or order -> invoice -> local journal -> reports; enforce references and balanced ledger.

**Required E2E assertions:** respective pages route properly; records update durably; role/permission UI behaves; approval and event history captures action; no false third-party verified state; mobile/narrow layout is usable; a failure or blocked branch is tested.

## WF-06 — Hire-to-onboard

**Canonical workflow:** HR opens position -> candidate reviews -> approved offer -> employee record -> IT access request -> training/calendar -> payroll inputs -> manager signoff.

**Shared constraints:** Applicant retention, discrimination safeguards, identity and payroll approvals.

**Frontend completion evidence:** Candidate -> offer -> employee -> tasks and calendar -> local provisioning request -> manager review; payroll only local configuration/input.

**Required E2E assertions:** respective pages route properly; records update durably; role/permission UI behaves; approval and event history captures action; no false third-party verified state; mobile/narrow layout is usable; a failure or blocked branch is tested.

## WF-07 — Design-to-publish

**Canonical workflow:** Creative brief -> Brand Intelligence -> editable Studio file -> human+AI reviews -> responsive/accessibility QA -> approved publish -> versioned live output.

**Shared constraints:** Editable structure, brand rules, asset licensing, provider confirmation.

**Frontend completion evidence:** Editable creative file -> review comments -> brand validation -> responsive preview -> validated download/export; external publish blocked until connected.

**Required E2E assertions:** respective pages route properly; records update durably; role/permission UI behaves; approval and event history captures action; no false third-party verified state; mobile/narrow layout is usable; a failure or blocked branch is tested.

## WF-08 — Build-to-deploy

**Canonical workflow:** App brief -> data/roles architecture -> visual+code builder -> sandbox tests -> security/UX QA -> stage -> production approval -> monitor -> rollback if warranted.

**Shared constraints:** Environment isolation, no secret exposure, release gates.

**Frontend completion evidence:** Build app with actual local data schema and interactive screens -> run tests/preview -> export frontend package; external deploy needs provider.

**Required E2E assertions:** respective pages route properly; records update durably; role/permission UI behaves; approval and event history captures action; no false third-party verified state; mobile/narrow layout is usable; a failure or blocked branch is tested.

## WF-09 — Document-to-knowledge

**Canonical workflow:** Upload -> antivirus/validation -> extract -> classify -> canonical mapping -> discrepancy review -> approve fact -> scoped retrieval -> retention and correction.

**Shared constraints:** Prompt injection, GDPR/retention, source-to-fact traceability.

**Frontend completion evidence:** Import and preview local file -> parse supported content -> classify -> review knowledge fact -> searchable cited records and correction.

**Required E2E assertions:** respective pages route properly; records update durably; role/permission UI behaves; approval and event history captures action; no false third-party verified state; mobile/narrow layout is usable; a failure or blocked branch is tested.

## WF-10 — Booking-to-service

**Canonical workflow:** Customer selects service -> real inventory/staff available -> reserve slot -> payment/deposit -> confirm -> reminders -> check-in -> completion -> invoice/service history.

**Shared constraints:** Atomic slot holds, timezone, cancellation policy and receipts.

**Frontend completion evidence:** Create service and resources -> pick available slot -> reserve locally -> record deposit intent, reminders, service and invoice; payment unconnected.

**Required E2E assertions:** respective pages route properly; records update durably; role/permission UI behaves; approval and event history captures action; no false third-party verified state; mobile/narrow layout is usable; a failure or blocked branch is tested.

## WF-11 — Replenishment-to-payment

**Canonical workflow:** Stock threshold -> forecast -> requisition -> policy approval -> PO -> supplier acknowledgment -> receipt/scan -> AP bill -> payment authorization -> reconciliation.

**Shared constraints:** Supplier identity, physical evidence, ledger consistency, spend cap.

**Frontend completion evidence:** Threshold -> PR -> approved PO -> local goods receipt and stock update -> AP bill; supplier payment not falsely confirmed.

**Required E2E assertions:** respective pages route properly; records update durably; role/permission UI behaves; approval and event history captures action; no false third-party verified state; mobile/narrow layout is usable; a failure or blocked branch is tested.

## WF-12 — Connector incident recovery

**Canonical workflow:** Health warning -> dedupe incident -> classify provider/internal -> safe retry or repair -> owner reconnect if required -> authoritative verification -> resume queued missions.

**Shared constraints:** Unknown side effects, no privilege escalation, auditable resolution.

**Frontend completion evidence:** Create connector incident in local state -> show impact -> attempt safe local recovery actions -> require reconnect UI for real provider.

**Required E2E assertions:** respective pages route properly; records update durably; role/permission UI behaves; approval and event history captures action; no false third-party verified state; mobile/narrow layout is usable; a failure or blocked branch is tested.

## WF-13 — AI workforce lifecycle

**Canonical workflow:** Create agent contract -> assign model/skill -> scoped data and actions -> evaluate scenarios -> owner activates -> mission assignments -> review metrics -> suspend/retire.

**Shared constraints:** Agent not self-authorizing, avoid unsafe model degradation.

**Frontend completion evidence:** Create/configure AI employee -> test local scenarios -> assign a mission -> evaluate results -> disable and audit changes.

**Required E2E assertions:** respective pages route properly; records update durably; role/permission UI behaves; approval and event history captures action; no false third-party verified state; mobile/narrow layout is usable; a failure or blocked branch is tested.

## WF-14 — Notification and approval

**Canonical workflow:** Event -> attention policy -> eligible recipients -> bundled notice -> inspect exact scope -> step-up where needed -> approve/deny -> mission update -> receipt.

**Shared constraints:** Read != resolved, organization isolation, delivery receipts.

**Frontend completion evidence:** Event -> dedupe and prioritize -> deliver locally -> inspect -> approve local mission within policy -> update receipt.

**Required E2E assertions:** respective pages route properly; records update durably; role/permission UI behaves; approval and event history captures action; no false third-party verified state; mobile/narrow layout is usable; a failure or blocked branch is tested.

## WF-15 — Monthly executive reporting

**Canonical workflow:** Data freshness checks -> ledger/CRM/operations aggregation -> finance reconciliation -> AI insight drafting -> reviewer approval -> on-brand Docs/Present output -> authorized distribution.

**Shared constraints:** No fabricated statistics, recipients, version and audit controls.

**Frontend completion evidence:** Aggregate source figures -> reconcile or flag conflict -> create on-brand editable Docs/Present report -> export; no false email delivery.

**Required E2E assertions:** respective pages route properly; records update durably; role/permission UI behaves; approval and event history captures action; no false third-party verified state; mobile/narrow layout is usable; a failure or blocked branch is tested.

## WF-16 — External client collaboration

**Canonical workflow:** Project share grant -> portal invitation -> client authenticates -> accesses only scoped records -> comments/approves/pays -> native tasks and audit sync.

**Shared constraints:** No cross-client leakage or arbitrary sharing inheritance.

**Frontend completion evidence:** Create scoped external access record -> local portal view in preview role -> comments/approvals stored -> state sync; do not claim actual security.

**Required E2E assertions:** respective pages route properly; records update durably; role/permission UI behaves; approval and event history captures action; no false third-party verified state; mobile/narrow layout is usable; a failure or blocked branch is tested.

## WF-17 — Multi-entity organization

**Canonical workflow:** Owner changes legal entity or brand -> UI scopes route, currency, locale and records -> AI context reset -> transactions remain within entity.

**Shared constraints:** Cross-tenant and cross-entity access cannot be assumed.

**Frontend completion evidence:** Switch legal entities, currency and brand; prevent cross-entity local records showing; revocation resets context; backend enforcement future.

**Required E2E assertions:** respective pages route properly; records update durably; role/permission UI behaves; approval and event history captures action; no false third-party verified state; mobile/narrow layout is usable; a failure or blocked branch is tested.

## WF-18 — Personal-device continuation

**Canonical workflow:** Begin on desktop -> autosaved document/mission -> mobile authenticated session -> responsive state restores -> action approver confirms -> desktop reflects update.

**Shared constraints:** Concurrent change detection, private device notifications.

**Frontend completion evidence:** Save in IndexedDB -> refresh/restored same profile -> mobile viewport -> edit and approve -> desktop viewport verifies; cross-device requires backend.

**Required E2E assertions:** respective pages route properly; records update durably; role/permission UI behaves; approval and event history captures action; no false third-party verified state; mobile/narrow layout is usable; a failure or blocked branch is tested.

## WF-19 — Sensitive data deletion/export

**Canonical workflow:** Authorized request -> retention/legal hold review -> scoped export or deletion jobs -> downstream connector requests -> verification -> evidence certificate.

**Shared constraints:** Deletion cannot break legally required immutable audits.

**Frontend completion evidence:** Review local data export and deletion scope, retention policy UI, execute local export/delete, retain evidence where configured; third-party deletion pending.

**Required E2E assertions:** respective pages route properly; records update durably; role/permission UI behaves; approval and event history captures action; no false third-party verified state; mobile/narrow layout is usable; a failure or blocked branch is tested.

## WF-20 — Company emergency pause

**Canonical workflow:** Authorized owner triggers pause -> execution dispatch prevented -> queued jobs checkpoint -> external side effects listed -> targeted revoke/escalation -> safe resume.

**Shared constraints:** Cannot falsely claim that accepted third-party actions were reversed.

**Frontend completion evidence:** Authorized local pause prevents new dispatch; show in-flight local tasks and any uncertain provider effects, safe resume after review.

**Required E2E assertions:** respective pages route properly; records update durably; role/permission UI behaves; approval and event history captures action; no false third-party verified state; mobile/narrow layout is usable; a failure or blocked branch is tested.
