# Arlovi — Identity, access, welcome, setup and guided orientation
Status: IMPLEMENTATION CONTRACT / NOT YET IMPLEMENTED
Source audit: 2026-11-16, `main` of `asantemartinbusiness-pixel/Arlovi`.

## Immutable design contract
Preserve the current visual language and token values in `src/design-system/tokens.css`, `src/app/brand.tsx`, the shared primitive and overlay components, shell/navigation structure, and the existing white/ink/blush/cobalt/papaya/aqua identity. Do not substitute a generic SaaS redesign, a new font or a standalone login design system. Audit every new screen and state against the existing application.

## Current verifiable architecture
- React 19, Vite 6, React Router 7, Zustand, Dexie/IndexedDB.
- Routes in `src/main.tsx`: `/` redirects into a last local workspace or `/setup`; `/setup` displays company onboarding; `/o/:org/*` displays an AppShell.
- `src/app/CompanyOnboarding.tsx` has 10 sections (Company, Identity, Knowledge, Departments, People, Intelligence, Applications, Collaboration, Authority, Launch), saves draft and step to localStorage, and creates local IndexedDB records.
- `src/app/FirstRunGuide.tsx` renders a real local-data-backed six-item getting-started checklist, which is dismissible and can be reopened using `?gettingStarted=1`.
- `src/app/AppShell.tsx` currently contains role-view switching expressly marked as not a security boundary.
- The README explicitly states this is a browser-local interactive frontend: no cloud account, no cross-device sync, no operational email, no connected live AI.
- Therefore none of the existing paths should be described as secure login, actual sent invitations, verified memberships, production authentication, or connected agent execution.

## Full entry architecture
Public landing -> create account / sign in -> verified identity -> join existing organization or create new organization -> workspace selection -> welcome handoff -> interactive tour -> headquarters and persistent setup checklist.

### Required routes
`/` public entry; `/sign-in`; `/sign-up`; `/verify-email`; `/forgot-password`; `/reset-password`; `/auth/callback`; `/auth/error`; `/invitation/:token`; `/workspaces`; `/setup`; `/welcome`; `/o/:org/*`. Add a real not-found screen and preserve deep links after authentication. Support safe query parameters only; forbid untrusted open redirects. Existing demo/local mode must remain distinguishable and functional, with no deceptive identity UI.

### Authentication provider and infrastructure
Integrate an explicitly configured and supported production backend/provider, not browser-only pseudo-auth. Prefer Supabase Auth if that matches the environment and future Arlovi architecture; do NOT pretend it is installed or configured. Before integrating, inspect deployment variables, connected provider, existing backend decisions and migration history; do not place service-role keys in the browser. If credentials or service infrastructure are missing, implement UI + typed adapter and explicit unconfigured states while recording unresolved deployment requirements. Never mark sign-up/sign-in as working until a real session round-trip passes.

Supported authentication lifecycle:
- Email/password sign-up and sign-in, email verification and resend, forgotten password/reset, verification expiry and error handling.
- Passkeys/WebAuthn and OAuth providers only if supported/configured and browser-tested; hide or explicitly disable unavailable options rather than showing fake working buttons.
- MFA enrolment, challenge, recovery and revocation; trusted-device semantics only with server enforcement.
- Session restore, refresh, sign-out (current/all devices), idle expiry, stale session reauthentication, change email/password, account deletion with verified confirmation.
- Safe invitation acceptance (expiry, revocation, membership already exists, wrong signed-in email), authenticated org switching, role-based authorization, tenant isolation and audit trails.
- Rate limiting, protection against email/user enumeration, CSRF/open redirects, generic recovery messages, secure cookie/session policy per chosen provider and accessibility of security flows.

## Account and organisation domain
Distinguish `users` (identity), `profiles` (personal preferences), `organizations` (tenants), `memberships` (roles), `invitations`, `sessions` where applicable, `onboarding_progress`, `tour_progress`, `consents`, `audit_events`. All tenant-bound data requires server-enforced ownership and membership checks, not client-only UI restrictions. Treat role-view selections as display simulation only in demo mode. Drafted colleague names in local onboarding must never be represented as invitations delivered. Define local-to-cloud migration explicitly with provenance and duplicate/conflict handling; NEVER silently upload IndexedDB records from an unrelated shared browser profile.

## Sign-in / sign-up screen specification
- Consistent Arlovi mark/wordmark, concise editorial heading, subtitle, secure method chooser, accessible email/password fields, password visibility control, caps-lock hint when relevant, form-level and field-level errors, loading/disabled states, keyboard submit, explicit sign-up/sign-in crosslink and transparent privacy/legal links.
- Individual states for untouched, focused, input, validation failure, request pending, success, throttled, offline, email unverified, account disabled, expired session and backend unavailable.
- A screen reader should hear status once; no unlabelled icons, inaccessible floating labels or visual-only requirements.
- Preserve the user's intended route after sign-in. No auth-step flicker during session restoration. Avoid exposing the presence of an account in public recovery errors.
- Sign-up: display name, work email, password/passkey option, consent decisions, verification instructions. Do not demand company information until identity exists.
- The account layer is independent from the organization layer. A user can hold multiple memberships and switch without losing personal context.

## Company setup / ten existing stages
Retain all ten stages. Introduce a readable contextual progress system, step titles, saved/unsaved indicator, review navigation, validation per step, keyboard/desktop/mobile controls, resume across sessions via authenticated progress storage, and optional back navigation without destructive resets. Preserve all app availability even if the user chooses only some apps as favourites.
- Company: legal/display name, slug, region, contact and owner intent.
- Identity: organisation visual branding constrained by design system.
- Knowledge: source drafts, consent to import, trust state and review.
- Departments: structure and responsibilities.
- People: member invitation drafts vs actual delivered invitations.
- Intelligence: AI job contracts, capabilities, approvals and model connection state.
- Applications: preferred navigation, never hidden or deleted tools.
- Collaboration: real channels, team configuration and notifications.
- Authority: human approval boundaries, scopes, spending and audit requirements.
- Launch: complete review, consent, deterministic creation, rollback and success state.
Autosave must be consistent with authenticated tenant storage; recover corrupted drafts gracefully. Disable duplicate submit and make finish idempotent.

## Welcome screen / first-run handoff
After successful new-company creation, render a one-time personalised welcome with company identity and clear explanation of available vs unconfigured features. Offer primary actions: `Explore headquarters`, `Take a guided tour`, `Continue setup`. Never auto-start intrusive fullscreen blocking dialogs. For invited members use a role-specific welcome without replaying company creation. Reentry respects persisted onboarding and tour state.

## Guided product tour (real interactive system)
Create a composable guided tour engine with:
1. Typed tour registry: key, title, description, target data attribute, optional route, predicate/permission, precondition, feature-specific completion event and fallback.
2. Target IDs in the real AppShell: organization switcher, application rail, app sidebar, global search, Ask Arlovi, attention centre, account/preferences and getting-started guide.
3. Position-aware anchored popover, spotlight/backdrop, scroll-into-view, keyboard focus management and restore, responsive bottom sheet for constrained screens, Esc/Skip/Back/Next/Finish, pause/resume, reduced-motion support.
4. Nonexistent, hidden, disconnected or permission-gated targets are skipped with an understandable fallback; never leave a dark scrim without an accessible exit.
5. `Start tour`, `Restart tour`, `Continue tour` in Help and setup centre; track started/completed/skipped and per-step progress per user+org+tour version.
6. Separate guided tours for first-time owners, invited members, admins, agents/AI operations, application-specific introductions, and optional what's-new tours. Do not show an onboarding tour every visit.
7. Respect accessible dialogs/focus traps/aria and actual UI actions; ensure no destructive production action is required just to complete a tour.

Tour sequence: company home -> global application rail -> active application sidebar -> command search -> AI workforce/Ask Arlovi with explicit status -> communications/collaboration -> notifications/attention -> personalization -> setup checklist -> finish. Support route changes, scroll positioning, refresh, deep-link and mobile navigation.

## Dialog / toast / confirmation catalogue
Use shared Arlovi overlay primitives consistently for: verification notice, password reset sent, invalid/expired invitation, sign-out confirmation, session expired, unsaved setup, setup completion, invitation delivered or failed, connection-required, MFA recovery, workspace switch, tour welcome/complete, profile updated and destructive account/org changes. Prefer inline validation over modal overload. Triggers must correspond to actual events, not simulations. All dialogs have accessible heading, dismissal strategy, focus return, escape handling where safe, and deterministic error recovery.

## UI geometry and content
Keep `src/design-system/tokens.css` authoritative. Preserve existing Hanken Grotesk/Inter font decisions from the loaded design system, ink-heavy controls, near-white surfaces, the original `ArloviMark` and provenance semantics. Avoid arbitrary gradients, new palette, default AI dashboards, huge pill badges and unapproved new layouts. Maintain comfortable 44px minimum target areas for mobile, responsive 320px and larger viewports, 200% zoom and clear step hierarchy. Respect `prefers-reduced-motion` and RTL-safe geometry where practical. Animations: 120-220ms subtle opacity/transform only, no mandatory parallax or layout shifts. Use concise, calm, precise product copy; do not claim connected features that are not active.

## Implementation map
- New `src/features/identity/*` for screens, session state, provider adapter and guards.
- New `src/features/welcome/*` for welcome, setup orchestration and persistence.
- New `src/features/tours/*` for typed registry, overlay, state, anchor targets and context.
- New authenticated data model/migrations and server-side authorization policies in the selected backend.
- Update `src/main.tsx` and `src/app/AppShell.tsx` for routes, route guards, nav targets and account menu.
- Enhance (do not replace) `src/app/CompanyOnboarding.tsx`, `src/app/FirstRunGuide.tsx`, existing CSS and shared design-system components.
- Include secrets/config validation and explicit backend-not-connected behaviour.

## QA acceptance contract
1. A new user can create, verify and authenticate an account through a genuinely connected provider; incorrect or expired credentials do not grant a session.
2. An invited user joins only the authorised organisation; other organisations remain inaccessible at both API/database layer and UI.
3. Existing user sign-in preserves deep link; session restoration has no flashes or redirect loops; sign-out invalidates access as designed.
4. Workspace creation completes once only, draft can resume after refresh/device switch when cloud sync exists, and success reflects persisted records.
5. Welcome appears to the appropriate persona once (unless explicitly reopened).
6. Tour steps highlight live controls, survive route changes, work with keyboard and screen readers, and can be restarted or skipped.
7. Popovers, alerts, form errors, responsive layouts, overlay stacking, tab order, contrast and reduced-motion pass automated and manual checks.
8. Existing local demo and all existing application screens remain functional; role simulation is never marketed as tenant security.
9. Playwright E2E: sign-up/sign-in/verification/recovery, expired invitations, multiple organisations, MFA or passkey when configured, setup resume, interrupted creation, tour desktop/mobile, tenant-isolation negative tests, and visual regressions.
10. Run `npm run qa`, `npm run test:e2e`, `npm run test:a11y`, relevant backend/RLS tests and deploy preview smoke tests; report exact commands and failures rather than claiming success without execution.

## Deliverables required before signoff
Full implementation, data and migrations, route map, user-flow/state diagrams, accessibility checklist, responsive screenshots, E2E evidence, session/authorization threat review, copy audit, design-token diff (ideally none), deployment configuration/rollback guide, and a matrix of working / provider-not-configured / verified / unverified. No staged MVP or intentionally partial rollout: all specified experiences are in scope, with honest external-provider blockers.
