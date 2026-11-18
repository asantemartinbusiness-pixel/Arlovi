# Unified Arlovi Entry & Onboarding — Implementation Contract

## Scope

This change implements the frontend entry architecture for the full business operating environment. It preserves existing organization records, the native app registry, local role previews, Company Brain knowledge drafts, AI workforce drafts, company policies and project/mission initial state. It is deliberately not a claim that cloud authentication or shared multiuser features are implemented.

### Routes

- `/welcome`: entry page for creating a local company or resuming a local workspace.
- `/auth/sign-in`, `/auth/sign-up`, `/auth/recover`, `/auth/verify`, `/auth/security`, `/auth/invite`: polished identity experience with explicit unconnected states.
- `/choose-workspace`: locally saved companies, separated from sample environments.
- `/setup`: four-stage, resumable company blueprint.
- `/setup/company`, `/setup/organization`, `/setup/review`: compatible entry aliases that redirect to the live wizard.
- `/o/:org/workspace/setup`: persistent Company Setup Centre integrated into the existing workspace shell.
- `/o/:org/workspace/home`: first-run guidance, with distinct owner foundation tasks and role-preview onboarding.
- `/`: resume last valid local company when available; otherwise show welcome entry.

### Four-stage company blueprint

1. Company identity: name, owner, description, region, workspace slug, currency, timezone and brand accent.
2. Operating model: business activity, organization scale, selectable departments, native application favorites.
3. People and intelligence: invitation drafts, unreviewed Company Brain text, AI specialist drafts, team channels, briefing preferences and human approval defaults.
4. Review and create: inspect data before saving, optionally provide a business objective, then create company and related records in one IndexedDB transaction.

All ten prior setup capabilities remain accessible within these four stages. Existing stored draft data uses its current shape and a new stage-progress key, minimizing the risk of data loss during the redesign. Browser refresh restores the current stage and edits; failed creation preserves the draft. Created company recovery uses IndexedDB if localStorage's catalog is lost.

### Operational truth and security boundary

- Company setup writes browser-local records. It does **not** create a cloud identity.
- Sign-in forms do not collect passwords; no account email submission is claimed successful while the provider is unconnected.
- Invitation URLs do not grant company membership; their tokens are neither trusted nor exposed.
- Role previews are an interface demonstration, **not** authentication or server-enforced authorization.
- AI employees are local drafts; external execution starts disabled and no model is connected.
- Team invite records are explicitly `invitation_draft` and `invitationSent: false`.
- Knowledge sources are `awaiting_review`; entered text is not verified company knowledge.
- External provider accounts, email delivery, cross-device data sync, verified membership and MFA/SSO must be integrated through a trusted backend and verified separately.

### Backend readiness contract (not implemented here)

Integrate a durable identity/session service with verified OAuth/SSO/passkey methods as configured. Resolve organization access from **server-verified membership**, never an email domain, route slug or local UI role setting. Persist onboarding checkpoints per user and organization. Handle invite expiry/replay/revocation, authenticated session expiration, membership changes, safe return paths, and GDPR/compliance obligations. Enforce row-level tenant boundaries and audit consequential actions independently of AI recommendations. Plan migration of local company records with owner verification, safe deduplication and consent.

### Verification

- `npm run qa`: registry inventory, TypeScript, ESLint, unit tests and production build.
- `npm run test:e2e`: new company setup, interruption recovery, duplicate names, local organization recovery and native app entry points.
- `e2e/entry-experience.spec.ts`: identity-provider honesty and company chooser behavior.
- Test desktop, tablet and mobile viewports, keyboard use, screen reader names, display scaling, low-motion mode and long content.
- No release claims until workflow checks and a real deployment record confirm a ready build.

### Next security gate

Do **not** turn on cloud sign-in, password recovery, invitation acceptance, MFA, SSO, external email or autonomous work by merely enabling frontend actions. Implement secure providers, tenant policies and actual execution services first.
