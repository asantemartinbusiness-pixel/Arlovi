# Arlovi Attention & Notifications — platform contract

**Current status:** The shared frontend experience, local per-actor preferences and the 35-application event catalogue are implemented in this branch. Server-side persistence, realtime delivery, verified email digests and browser push are **not connected**.

## One event, three responsibilities

- **Notifications:** Inform an authorised user what changed.
- **Inbox & Decisions:** Request an explicit action or decision; reading does not approve or resolve.
- **Activity:** Durable history of events and decisions.

Presentation uses a global bell drawer, contextual banners, transient toasts, inline notices and narrowly reserved critical dialogs. These are different surfaces of one event model, not independent sources of truth.

## Application events

All 35 registered native applications have event contracts in src/platform/notificationContracts.ts: source app, category, kind, default priority and event types. Native applications should emit business events, never directly spawn intrusive global popups.

Each connected event requires tenant ID, actor/initiator, event ID, event type, source record ID, recipient selector, visibility/permission policy, trace ID, timestamp, version and idempotency key. The server must validate the event vocabulary, calculate recipient users and check source record access. Sensitive Finance, People, Administration, Legal and IT data require restrictive defaults.

Priority semantics: P0 Critical, P1 Urgent, P2 High, P3 Normal, P4 Low, P5 Information. P0 security events remain accessible when focus mode is enabled and cannot be snoozed in the local experience.

## Required canonical backend

Create durable server tables/collections for:

1. notification_events: organization, source app, event type, source ID, timestamp, priority, payload, schema version, idempotency/deduplication keys and source resolution state.
2. notification_recipients: user ID, event ID, read/acknowledged/snoozed timestamps, delivery status and per-person state; uniqueness on (event,user), enforced authorisation.
3. notification_preferences: per-user per-organisation categories, channels, focus, preview privacy, timezone, quiet hours, digest settings and overrides.
4. notification_delivery_attempts: event, recipient, provider, channel, attempt, retry schedule, accepted/delivered/failed status and audit identifiers, without exposing provider credentials.
5. notification_subscriptions and notification_policy_versions: routing, following, delegation, governance and audit.

Use durable queues, idempotent processors, authorised realtime subscriptions, retry limits, provider health checks and secure deep links. When a user reconnects, reconcile missed events and individual read state. Group bursts but never collapse unrelated approvals or security incidents.

## UX policies

- Header keeps separate bell (updates) and Inbox (decisions). Opening the drawer does not mark all read.
- A message, its notification and its follow-up task share identifiers, but remain separate business objects.
- Mark read, acknowledge, snooze, resolve and approve are distinct operations.
- Personal settings include Focus, category frequency, privacy and preferred digest time. Security event visibility cannot be disabled.
- Success and informational toasts expire after roughly 5.5 seconds; failures remain until dismissed.
- Persistent banners track unresolved conditions; critical dialogs require immediate, explicit intervention and proper focus trapping.
- Responsive design must work on phone, tablet, desktop and Arlovi 75–150% scaling. Support keyboard, screen readers and reduced motion.
- Never show private HR/payroll/customer information in unauthorised previews.

## External delivery readiness

In-app browser-local notifications are available. Real user authentication, realtime multi-device state, push subscriptions, email digests and external channels are not. The application must never claim to send email, push or realtime updates without working provider connections and secure server-backed verification.

## Release acceptance

Run TypeScript, build, lint, unit and browser tests across roles, organisations, devices and display scales. Verify permissions, event deduplication, offline recovery, quiet-hour timezones and DST, action safety, critical incident handling, retention and accessibility. Vercel READY verifies the frontend build only; it does not prove backend delivery or end-to-end browser interaction.
