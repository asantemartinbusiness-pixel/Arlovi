# Arlovi — Platform-wide Notifications & Attention

Date: 18 November 2026
Status: Implemented browser-local UX and contracts; **not a hosted multi-device notification service**.

## Implemented in the frontend

- One native application registry across the existing 35 applications; no change to navigation or routes.
- Shared categories, P0–P5 prioritisation, delivery-mode policies, grouping and duplicate-event rules.
- Global Notifications bell stays distinct from Inbox & Decisions.
- Drawer views for For you, Actions, Updates, Urgent, Snoozed and Resolved; mark-visible-read, acknowledgement, one-hour snooze, an explanation of routing and a deep link to an organisation-scoped record.
- Actor-keyed, browser-local read/acknowledged/snooze receipts, with the full Inbox reading the same receipts.
- Personal browser-local notification settings: focus mode, category delivery preferences and privacy previews.
- Existing full Inbox retains bulk triage, approvals, escalation and organisation channel, category, digest and quiet-hour configuration.
- Reusable persistent banners and toasts, including actionable toast metadata, transient timeout and hover/focus pause, no notification spam on a routine save.
- Local-only event publication API accepts registered app sources, enforces organisation-relative links, checks open-event dedupe keys, and creates an in-app notification record.
- Tests: unit tests for policy / source registry / grouping / recipient isolation / event preparation; browser scenarios for drawer, personal settings persistence and mobile reflow.

## Hard security & delivery boundaries

The current Arlovi repository remains a Vite/browser-local application. Actor labels and role selectors in the frontend are **not authenticated identities or security boundaries**. Browser-local preferences and receipts do not synchronise between devices, and local storage may be cleared. The current Inbox source triage still uses browser-local backing records; it is not a server-authorised multi-user notification store.

No external email, SMS, browser push subscription delivery, server-side audit, encrypted tenant message store, webhooks or resilient background processing is provided by this change. Never show a channel as delivered until a provider confirms delivery. Do not interpret 'read' as approval, 'acknowledged' as resolved, or frontend role filtering as secure authorisation.

## Backend integration contract for full product

1. Authenticate every employee and service identity, with server-side organisation, department and resource authorisation.
2. Add durable event and recipient records: `notification_events`, `notification_recipients`, `notification_preferences`, `notification_deliveries`, `notification_escalations`, `notification_audit`. Use org/user/source IDs and an idempotency key unique to the relevant source event. RLS and server permission checks must govern both list and detail fetches.
3. Publish domain events in the same transaction or a reliable outbox as the originating business action. Deduplicate, assign recipients based on real membership and grants, evaluate category, priority, quiet hours and personal/company policies, and never route by a frontend role label alone.
4. Persist per-recipient read, acknowledgement, snooze, resolved visibility and delivery states independently from the underlying business record. Acknowledgement is not business approval; a state transition in Finance, HR etc. is authoritative.
5. Implement replayable real-time feeds with reconnect cursors, idempotent delivery retries, retention and privacy policies. Group related routine updates without merging independent decisions or security events.
6. Connect opt-in browser push and approved email delivery only after verified, authorised providers exist. Record provider acceptance separately from recipient delivery; never pretend SMTP submission means delivery.
7. Use the `NATIVE_APP_NOTIFICATION_SOURCES` registry and `publishLocalNotification` contract as the starting point for adapters for each registered app (Headquarters, Intelligence, Operations, Growth, Studio and Platform). Replace the browser-only publisher with an authenticated server event API while preserving the same UI event semantics.
8. Add real signed-in cross-device Playwright tests with two users from different organisations and roles; verify no private notifications or preview data leaks across boundaries, and test dedupe, outages, offline recovery, escalation and each of 35 app event contracts.

## Global interaction rules

- Bell = information; Inbox = decisions and assigned actions; Activity = history.
- A toast confirms the immediate UI action only. It does not create an Inbox item unless a durable underlying business event warrants one.
- Do not steal focus from a user typing. Critical modals require narrow, explicit safety justification and accessible focus management.
- Persistent operational banners stay visible while their source condition is active and disappear only when it clears.
- Default routine events to quiet feeds or digests; explicitly assigned action and direct mentions are prompt; P0 security alerts remain visible even in focus mode.
- On mobile, use the adapted overlay and the safe area, not a desktop popover that hides controls. Respect 75–150% interface scale and reduced-motion settings.
