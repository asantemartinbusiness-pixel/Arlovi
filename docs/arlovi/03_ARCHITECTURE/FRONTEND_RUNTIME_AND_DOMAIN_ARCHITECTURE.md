# Arlovi — Frontend Architecture, Local Runtime & Future Service Ports

## Boundary
Build the entire working frontend. No backend, no server API, no production database. A browser-local operational model should implement all feasible workflows and persist in IndexedDB. Everything external requires explicit capability adapters with honest connection states. Dev server/tooling does not count as backend feature implementation.

## Suggested stack
TypeScript + React + Vite, an established typed router, Tailwind/design tokens, Radix accessible primitives, Zustand or analogous scoped stores, Dexie/IndexedDB, TanStack Table, dnd-kit, React Flow, Tiptap/ProseMirror, Monaco, production-suitable SVG/vector and raster editing, licensed formula engine, WebAudio/WebCodecs/FFmpeg.wasm when viable. Select based on stable current package API/licenses, bundle size, compatibility and real behaviour. Test dependencies before deciding.

## Application layering
1. `app` routes: organization-scoped deep links, shell, navigation state, error boundaries.
2. `design-system`: semantic tokens, shell, dialogs, tables, controls, editor primitives, motion.
3. `domains`: canonical typed entities and domain rules; no app creates parallel inconsistent customer or product records.
4. `runtime`: IndexedDB migrations, repository adapters, event bus, local workflow/task processor, audit trail, permission simulations, export/reset.
5. `applications`: app-owned layouts, pages, tabs, overlays, editor configuration and typed actions.
6. `editor-engines`: persistent structured media/document schemas, undo/versioning/import/export and local preview.
7. `integrations`: future service boundaries and provider capability metadata; no embedded production keys.
8. `tests`: feature, cross-app, screen registry, a11y, browser, visual/performance.

## Core local entities
Organization, Brand, Department, Member, HumanEmployee, AiEmployee, Role, Policy, Capability, AgentContract, Conversation, Message, KnowledgeSource, CanonicalEntity, Fact, FactReview, Mission, Task, Approval, ActionReceipt, AppRecord, Customer, Company, Lead, Deal, Product, StockMovement, Order, Invoice, Journal, JournalLine, Account, Appointment, BookingResource, Campaign, MediaAsset, Document, DesignFile, Presentation, Workbook, Workflow, WorkflowRun, Incident, Notification, AuditEvent.

Every record carries `id`, `organizationId`, timestamps, `createdBy`, `updatedBy`, `revision`, `state` and source/provenance as relevant. Internal local link IDs should be stable across applications. Use schema migrations and deterministic seed data. Use integer minor units or decimal-safe library for money; no floating rounding for ledger. Asset blobs reside in IndexedDB (storage quota/eviction handling), with export/backup mechanisms.

## Event and action model
Typed domain events carry unique ID, entity, organization scope, actor, correlation ID, timestamp, payload version and cause. Operations validate input, check local role/policy, apply local transaction consistently, append an audit event, publish update and return success/partial/blocked/failed with evidence. Idempotency keys prevent duplicate local writes on retries and refreshes.

Example local events: `crm.lead.created`, `finance.invoice.drafted`, `finance.journal.posted_local`, `commerce.order.created_local`, `booking.reservation.held_local`, `mission.plan.approved_local`, `workflow.run.started_local`, `notification.action_required`, `studio.artifact.exported`. Avoid naming external successful effects without actual verified provider evidence.

## Service capability adapter
```ts
type CapabilityState =
  | 'not_connected'
  | 'configuration_required'
  | 'ready_local'
  | 'queued_local'
  | 'awaiting_external_confirmation'
  | 'verified_external'
  | 'blocked'
  | 'failed';

type CapabilityResult<T> = {
  state: CapabilityState;
  localRecordId?: string;
  data?: T;
  explanation: string;
  evidence?: { source: string; at: string; receiptId?: string };
};
```
Future server adapters may implement OAuth, payment, delivery, banking, AI inference, multiuser collaboration and real cloud deployment. Browser-only wrappers must never set `verified_external` or store production provider tokens. Scope all data and cache operations to the selected organization. This is a UX model, **not actual security enforcement**.

## Local AI and agent UX
Implement agent profiles and task-routing UI, structured missions, Team Rooms, planned actions, source context and agent handoffs. Functional deterministic task generators can operate on actual local business data and create/edit artifacts with clear source records. A browser-local language model may be used when supported, but must not require exposed keys or be represented as live service when absent. Unknown natural language requests can generate bounded guided task choices instead of fictitious arbitrary reasoning.

## Cross-application state
Use stable canonical IDs and shared domain repositories, not copying records into each app. E.g. lead -> deal -> quote -> customer -> invoice -> local journal; commerce product -> order -> inventory; customer care ticket -> booking/service. Maintain source and version. Provide error and consistency testing for conflicting edits and event replay.

## Assets and editors
Shared asset library with typed media, brand, provenance and thumbnails. Documents, sheets, presentations, design objects, photo layer stacks and video timelines stored as structured serializable schemas. Each editor supports meaningful undo/redo, save status, import/export and migration handling. Use worker threads for heavy browser processing where feasible; provide progress/cancellation without false success.

## Threat model
Local browser role switching is not genuine cross-user security; treat all local data as owned by current browser. Never store secret API keys or claim encrypted enterprise tenancy. Sandbox user code/previews; escape untrusted HTML and markdown; consider prompt injection from imported content. CSP, dependency scan, license audit, accessible overlays. External portal and sharing UI is a structural frontend flow until server authorization exists.

## Browser persistence limits
IndexedDB data does not automatically synchronize across devices or people. Browser storage can be cleared and files may exceed quotas. Offer local backup/export and explicit warnings where relevant. Browser-only background execution cannot continue reliably after the tab closes; show accurate queued/paused semantics and resume when reopened. Real long-running cloud jobs need future backend.

## Source vs frontend-only overrides
The original 226-page specification includes future backend requirements such as actual server authorization, durable workers and verified external connectors. Retain full **UI contracts** for these features now; use local adapters, explicitly mark backend enforcement absent, and never counterfeit it. Do not delete the future target design.
