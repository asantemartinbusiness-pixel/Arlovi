# Arlovi

Arlovi is the local operating workspace for a company: headquarters, finance, customers, people, commerce, studio tools, and the agent desk. This repository is the interactive frontend. Records live in the browser (IndexedDB). External providers are represented honestly as not connected.

## Run

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. The first organization is Northline Atelier (`/o/northline/hq/home`). Harbor Supply (`/o/harbor/hq/home`) is a second entity with its own currency and records.

```bash
npm run qa          # inventory, types, lint, unit tests, production build
npm run test:e2e    # browser coverage of all 316 screens
npm run test:a11y
```

## What is local

Creating and editing records, double-entry journals, invoices, stock, bookings, documents, sheets, slides, vector and photo canvases, timelines, site and form models, and mission state all persist in this browser. Exports download real files (CSV, HTML, SVG, PNG, SRT).

Sending mail, taking cards, publishing to a network, filing tax, and calling a language model stop at a provider boundary. The screen says the service is not connected and keeps the local draft.

The role control changes what the interface will do. It is not an account security boundary. Another device will not see this workspace until a future sync service exists.

## Layout

- `src/domain` — ledger, formulas, bookings, stock, policies, screen actions, and the twenty cross-application workflows
- `src/applications` are routed from `src/generated/catalog.json`, built from the screen registry
- `src/editors` — document, sheet, slide, design, photo, layout, video, motion, web, app, form, workflow, storefront, and booking surfaces
- `docs/arlovi` — the original specification package
- `docs/implementation` — decisions and verification
