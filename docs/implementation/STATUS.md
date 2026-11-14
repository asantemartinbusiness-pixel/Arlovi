# Implementation status

The registry still has 35 applications, 316 screens, 1,323 tabs, 956 overlays, and 1,328 actions. Every screen has a route that renders. That is not the same as a verified specialist application.

| Status | Meaning | Screens |
|---|---|---|
| verified | A browser journey exercised the screen's main local mutation | 12 |
| implemented | Route, tabs, and action buttons render. Actions call the local reducer | 304 |
| not-started | No route | 0 |

`docs/implementation/ledger.json` is the screen-by-screen record. Only `verified` counts toward completion.

## What is actually verified

- Finance: create an invoice, edit a line, issue it into a balanced local ledger, see it on Awaiting payment after reload, and open a second draft from a CRM deal.
- Ledger: post the seeded wage journal and see the issued-invoice journal.
- Projects: move a task on the project board; the stage survives reload and shows on the project overview.
- Design: create a file, add a rectangle, reload, and find the rectangle.
- AI workforce: generate a contract, open the profile, see the person in the directory and on the organization chart. No model is connected.

## What is still shared

Most of the other 304 screens use one workspace shell. Tabs filter the local register. Overlay buttons open one title-and-summary form, or a create form when the overlay name is a create action. Editors for documents, sheets, decks, design, photo, layout, video, motion, sites, apps, forms, and workflows are real structured editors when the record has a body. They are not a full desktop suite for every tool panel in the registry.

External mail, card capture, bank feeds, tax filing, hosted publishing, and live model inference stay disconnected on purpose.
