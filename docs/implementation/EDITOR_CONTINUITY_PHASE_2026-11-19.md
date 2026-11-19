# Arlovi — Cross-app editor continuity (phase 3)

## Implemented
- CRM **Contact form**: working fields (name, email, phone, role, account, tax status, consent, suppression and notes) are kept in memory per organisation, actor and record. On successful create/update, clear the matching draft. Closing without saving retains it; **Discard draft** clears it. No outbound message is sent.
- People **Position editor**: role title, department, salary range and role description are retained in the same-tab working draft. Record updates still use the underlying revision checks. Successful save clears the draft; explicit discard clears it.
- Docs **New document**: title, template, folder and confidentiality are retained per organisation, actor and template entry point; successful creation and explicit discard clear them. The existing full document editor has a separate debounced autosave system.
- For opted-in payload-free create overlays, `ScreenHost` includes the overlay ID in the URL so an app journey can restore the editor. Edit dialogs with record payloads are not encoded into URLs.
- Docs full editor: if a user switches screens before its 800ms autosave debounce, the editor now requests a final flush when unmounted. The mutation still uses revision checks; async storage is not guaranteed through a hard browser crash or immediate tab close.

## Boundaries and safety
- Draft values are never placed into query strings or persisted in localStorage/sessionStorage. The in-memory cache lasts for the current tab's runtime and must not be represented as server-saved or durable.
- Do not store passwords, private file bytes or raw credentials in working drafts; existing People document-reference workflows are deliberately not auto-persisted.
- Navigation and record visibility still go through the existing app access policy and organisation checks; client-side policy is not a substitute for authenticated server enforcement.
- The current implementation is targeted, **not universal** to every editor; complex visual/design/doc collaboration may require versioned server drafts, explicit save barriers, conflict UI and multi-device sync.
- Verify browser QA, desktop/tablet/mobile, role changes, company changes, accidental navigation, save failure, and the return journey before calling the phase fully tested.
