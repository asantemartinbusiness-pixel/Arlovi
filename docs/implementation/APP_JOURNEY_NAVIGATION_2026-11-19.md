# Arlovi — Cross-app navigation and interaction contract

**Purpose:** Someone can leave Finance for Projects, CRM or another tool, and return to the same authorised Finance screen without re-navigating through a home page.

## Navigation behaviour

- Each organisation + role + actor has an isolated **session-tab journey**. The route history stores the path plus safe query and hash (including record URLs, selected tab and filters); it does not store form contents or documents.
- Switching apps through the global rail, recent-app switcher, workspace shortcuts or app directory can resume the last authorised screen of the destination app. Internal app navigation updates the saved location without creating a second return step.
- An explicit cross-app link anywhere inside a native tool is tracked by the shell. The compact **Back to [previous app]** control returns to the previous exact route. The regular browser back/forward history remains intact.
- The return strip lives above the content area, not as an obstructing floating overlay. The app sidebar includes a compact native disclosure menu of recent tools. No cross-company or inaccessible route may be reopened.
- The current shell remembers its main scroll-container offset by route. Nested editor canvases and their internal cursors require app-specific persistence; the shell does not promise to save them automatically.
- The storage key is specific to company, person and role, in `sessionStorage`, with a short bounded history. Never store passwords, text editor content, files or arbitrary form state in the navigation history. Restricted records continue to be checked by ScreenHost before loading.

## Working drafts

Navigation return and unsaved form persistence are **different concerns**. The platform provides an opt-in, in-memory `useWorkingField` contract that a native app can adopt, scoped to its organisation, actor and editor. Such drafts survive the same-tab detour but **not** a browser reload.

Finance's New Invoice workflow is the first use: it can restore fields after closing and reopening the invoice editor. Its payload-free overlay can be deep-linked via `?overlay=New+invoice`. The explicit **Discard draft** action clears the draft cache. The draft is cleared on successful invoice creation.

Other native editors must each define persistence, discard and unsaved-change behaviour deliberately. Do **not** claim universal draft protection simply because the shell remembers a URL.

## Button and selection behaviour

- Primary icon rail: rounded-square 44px touch target, soft selected fill and a 3px in-bounds vertical marker; never an incomplete circular stroke.
- Secondary navigation: quiet selected fill, readable label and one short vertical marker; hover does not imitate active state.
- Tabs: soft selected fill plus a flat short 2px line; never an inset pill box-shadow that curls at its ends.
- Buttons: high-contrast focus-visible state, predictable hover and small pressed response; motion is disabled when reduced motion is preferred.
- Brand accents remain Chromatic Studio; functional status colours remain semantically independent.
- Use semantic `aria-current`, `aria-selected`, `aria-pressed` and keyboard focus styles. Do not rely on colour alone.

## Verification

The unit suite verifies URL isolation, multi-app return semantics, query and hash preservation, and in-memory draft isolation. End-to-end coverage includes Finance → Projects → Finance, foreign company isolation, and active state styling. QA must inspect desktop, mobile, role changes and blocked record routes.
