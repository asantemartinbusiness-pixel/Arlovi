# Arlovi — What Can Truly Work Without a Backend?

This is a mandatory reality contract, not a scope-reduction document. Every product screen and workflow is required; some real-world external effects are impossible to complete without a provider/server. The frontend must provide complete UI, typed capability boundaries, and useful browser-local editing and state.

| Capability | Must work now in browser | Must not be misrepresented |
|---|---|---|
| Organization setup | Create local workspace, departments, member roles, preferences, brand | Remote identity and cross-device sync |
| Finance | Valid local journal accounting, invoice/bill records, reconciliation of imported/local transactions, financial reports, export | Real banking, payments, HMRC tax filing, statutory payroll |
| CRM | Contact/deal CRUD, pipelines, quotes, activities, record linking, filters/export | Actual sent outreach or provider-owned records |
| HR | Employee records, forms, onboarding tasks, leave and scheduling | Legally compliant payroll remittance, real device provisioning |
| Communications | Local channels, messages, comments, meeting scheduler UI, voice input where supported | Remote messaging/calling/email delivery; real participant presence |
| Marketing | Campaign plan, scheduled records, creative assets, audiences, reports from local data | Posts/ads/newsletters published on remote providers |
| Commerce | Local product editor, storefront, variants, cart, orders, inventory, returns | Real card charges, merchant acquiring, live carrier tracking |
| Bookings | Capacity, local availability, appointment holds and conflicts | Cross-device reservation guarantee without server coordination |
| Procurement | POs, goods receipts, stock transactions, supplier records | Actually emailing suppliers or transferring money |
| Docs | Rich-text edit, comments, templates, files, valid exports | Remote concurrent editing or cloud storage |
| Sheets | Formula calculations, charts, sorting, validation, CSV/XLSX where supported | Every Excel macro or server computation |
| Present | Slides, object edit, themes, presentation view, selected exports | Remote live presentation broadcasting |
| Design/Photo | Vector/raster object editing, layers, masking, local rendering/exports | Proprietary Adobe engine parity for all formats |
| Video/Motion | Browser-feasible timeline edits, captions, local previews and exports | Cloud rendering at arbitrary scale, model-generated video without connected model |
| Websites | Visual layout, responsive previews, CMS local entries, static HTML/site export | Live hosting/domain DNS/SSL provisioning |
| App Builder | Schema-based local app runtime, visual/code editing, packaged exports | Hosted backend database/auth and live public deployment |
| AI | Configured agents, team rooms, executable deterministic local workflows, contextual model when truly available | Fake autonomous model inference, false source-grounded fact claims |
| Integrations | Provider catalogue, status UX, authorization explanation, contract adapter | OAuth connection confirmed or actual remote API calls without service |
| IT | Local errors, incident UI, diagnostics, resumption within browser | Remote infrastructure repair or 24/7 cloud monitoring |
| Security | Permission and autonomy configuration UI, local UX checks, audit history | Tamper-resistant backend authorization/secret storage |
| External portal | Scoping and portal interface, local role preview, client feedback stored locally | Actual securely isolated external access or invitations delivered |
| Device continuation | Persist across reloads in same browser/profile, export/import backup | Automatic sync across browsers/devices |

**Acceptance:** A capability is either fully implemented within frontend capability, or its complete frontend flow terminates in a precise true external-dependency state. It must not be an inert button or a false statement of real-world completion. Do not add demo/prototype badges in product UI; instead use accurate action labels and state language.
