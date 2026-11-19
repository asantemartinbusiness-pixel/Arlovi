# Northline Collective — Flagship Simulation

## Scope

This is a **fictional** Arlovi reference business and portfolio/showcase. Its core operating environment is the existing `northline` local workspace, where the historic Northline Atelier fixtures remain unchanged. `harbor` remains an entirely separate USD demo tenant and is **not** reclassified as a subsidiary. The Harbor Supply Studio **brand concept** in the flagship is an illustrative division, not the existing Harbor tenant.

This delivery creates a separate, additive `flagship-collective` seed contributor, explicitly loaded by the HQ seed loader. It inserts new IDs in the `nl-<collection>-900+` namespace so previous work is never overwritten. Seed contributor rehydration is handled by the existing local DB. Records are browser-local per device, not server-synchronised.

## Creative direction

**Positioning:** Material. Space. Experience.  
**Voice:** warm, editorial, confident, understated; no generic AI claims.  
**Colour system:** mineral ink `#192421`, natural paper `#eeeae1`, oxidised bronze `#ba6b4c`, muted sage, pale clay.  
**Typography:** high-contrast classical serif for storytelling plus restrained sans-serif for utility labels.  
**Art direction:** architectural light, tactile objects, original composition, asymmetric pacing, intentional whitespace, editorial layouts, reduced-motion support.

### Two complementary website surfaces

1. **Native Web app** — seven editable, accessible draft pages seeded under `nl-sites-900`, with themes, navigations, blocks, CMS concepts and native form references. This uses the real capabilities of Arlovi's present web block renderer.
2. **Standalone editorial art showcase** — `public/northline-collective/index.html`, served at `/northline-collective/`. The page has art-directed original SVG architectural and product illustrations, responsive layouts, layered typography, reduced-motion support, a keyboard accessible mobile menu and a local-only downloadable enquiry form. This does **not** imply that the native Web builder supports every custom interaction used on this bespoke public HTML page.

## Application representation

The contributor adds company concepts, departments, locations, goals, product concepts, customer accounts, opportunities, Lighthouse Hotels tasks and a project, a quote, unissued invoice, unaccepted contract, customer portal draft, customer case, website, two forms, campaign, audience, presentation, motion composition, video **production plan**, asset brief, services, booking request, supplier, purchase request, risk, approval, mission, knowledge, automation, analytics, and technical concept. It also seeds modest placeholder records for additional native collections; these do not claim feature-complete production data.

The presentation has six editable slides built with native presentation model helpers. The motion file contains keyframed original wordmark layers. The video record is a storyboard/production plan, **not a finished motion picture or generated footage**.

## Data integrity and honest states

- Financial values are clearly fictional, **draft** and **not posted**. No faked bank reconciliation, supplier payment, tax filing, or accepted invoice.
- Website deployment is not connected. CMS entries are drafts with noindex markers. No real domain is claimed.
- Forms do not send email or reserve slots. Standalone form exports a local text file.
- External integrations are explicitly not connected; no fake publication receipts or external customer notifications.
- Legal company numbers, addresses and customer emails are not manufactured.
- AI mission execution is paused by default; there are no fabricated AI work receipts.
- Examples intentionally cover cross-app references but do not constitute verification that every native editor can parse every object shape.

## Verification and outstanding work

Run `npm run qa`, `npm run test:e2e`, and manual browser reviews for:
- flagship contributor loads on first boot and on an existing seeded workspace without overwriting user edits;
- namespaced IDs do not collide;
- internal Lighthouse project, opportunity, quote, client, task and portal links resolve;
- the six-slide deck and form drafts open in their respective editors;
- Studio Motion and Video surfaces parse and display flagship drafts without crashes;
- the native website preview and bespoke showcase function on desktop, mobile and keyboard-only navigation;
- contrast, reflow, reduced-motion and empty/error states;
- accurate role and multi-tenant isolation.

**Remaining to be created:** original licensed photographic footage and imagery; polished media renders; fully populated 12-month transactional histories; real intercompany consolidation; all 82 employee records and 18 fully trained/evaluated AI agents; dedicated native website custom components and visual publishing parity; production integration and domain verification; independently signed-off 316-screen functionality. The previously discussed target volumes and £9.6M revenue profile remain illustrative, not genuine recorded transactions.

## Release safety

Do not merge this into production without CI and browser verification. Do not overwrite the existing `nl-sites-020` Atelier site or reassign the independently scoped `harbor` demo organization.


## Native Studio expansion and discovery hub (continuation)

A second contributor `flagship-studio` is loaded alongside `flagship-collective` with isolated `nl-<collection>-910+` identifiers. This adds two native Design Studio files (five editable editorial artboards), an eight-page native publication with text stories, two layered Photo studies and a four-chapter 60-second Film Editor timeline with generated storyboard proxies. Native vector objects can be selected and modified, and layout frames are proper publication elements. These are not screenshots posing as editable work.

The **native showcase hub** is accessible at `/o/northline/workspace/showcase` through an optional panel on Northline's My Workspace. It links to the true native record detail routes and to the standalone showcase at `/northline-collective/`. The route refuses to show the flagship within the Harbor demo organisation. Metrics derive from records currently available in the browser rather than being presented as real company achievements.

`tests/unit/flagship-studio.test.ts` checks structural integrity, editable scene graphs, publication stories, video source references, and rights status. `e2e/flagship-showcase.spec.ts` exercises native navigation, cross-tenant denial, responsive reflow and the local download-only form.

**Independent sign-off remains required.** Confirm that the Video Studio generated source preview behaves correctly and that the layout's print preflight reports rather than conceals overset. Visual review in browser and quality gates are not replaced by the existence of fixtures. The production site is unchanged until reviewed and merged.
