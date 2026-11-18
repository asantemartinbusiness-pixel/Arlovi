# Arlovi — Visible & Editable Role Permissions Matrix

Date: 18 November 2026

## What administrators can see and edit in the frontend

Open Administration → Roles & Permissions → Roles → **Configure view & edit rights**.

The browser-local role editor supports:
- Role selection across the proposed executive, operational, external and AI identities.
- **35 native application rows**, grouped and searchable, with inherited effective View and Edit indications.
- **316 registered page rows**, filtered by application and searchable. Sensitive pages are visually flagged.
- Per application and per page tri-state **Inherit / Allow (draft) / Deny (draft)** rules for View, Create, Edit, Approve, Export, Share, Delete and Manage.
- Per-application data scope: None, Own, Assigned, Team, Department, Business unit, Organisation and Explicit sharing.
- Preview calculations that enforce application-parent view dependency and explicit deny precedence within the draft.
- Review Changes showing all exceptions before saving.
- Save and discard with browser IndexedDB storage in the existing `policies` collection, using `kind=rolePermissionDraft`, `roleId`, and serialised rule matrix.
- Existing record revision conflict detection and audit note on save; only the current **legacy frontend role with `manage_policy`** may save drafts.
- Responsive scrollable matrix with a sticky first column, keyboard-select controls and labelled form fields.

## Permission semantics and constraints

- **Drafts are not live permissions.** The current site does not authenticate a real workforce or connect to a server-side policy service. Any proposed Allow is a display-only decision. It does not make a person able to open a protected record, grant access to an external provider, or override a deny in a real backend.
- The role template is an inherited baseline. A page edit requires view at both page and application level. Explicit denied View on the app always overrides page-level allowed actions.
- Sensitive Finance, People, Legal, Communications and IT operations should be reviewed separately. An app-level allow never substitutes for classification, field redaction, approved resource sharing, or server authorisation.
- Draft data is tied to the active organisation via IndexedDB records. It is not authenticated, remotely shared or replicated between devices.
- Actual live frontend application access continues using the original six role views until a secure identity service and backend access enforcement exist.
- A manager should be able to *inspect* their role in the UI, but only a configured and authenticated access administrator may eventually *publish* a policy to employees. Do not assume that creating or saving a draft enforces it.
- For users, distinguishing View, Create, Edit, Approve, Export, Share, Delete and Manage prevents accidental broad access. Approval thresholds, department relationships and confidentiality classification must be verified by a backend.

## Security handoff for operational role changes

Backend service must provide:
1. Authenticated identity and membership/tenant binding, separately for humans, external users and AI agents.
2. Server-enforced policy endpoints and persistent employee-to-role assignments.
3. Resource and field permissions, including access to reports, search, notifications, exports, generated documents and AI tool calls.
4. A publish process with human review, risk classification, step-up verification where required, and immediate revocation.
5. A central immutable audit trail and multi-device sync; no browser-local 'admin' flag is treated as authority.
6. End-to-end tests proving access to a forbidden record fails via API/storage even if a user modifies HTML, URL or local browser state.

These constraints are mandatory before labelling the overall role system as production-grade multi-user authorisation.
