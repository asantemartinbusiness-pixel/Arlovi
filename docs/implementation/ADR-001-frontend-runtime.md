# ADR 001 — Browser-local runtime

## Decision

One IndexedDB database (`arlovi-workspace`) holds every organization record. Screen routes come from the registry catalog. Actions go through a pure reducer (`reduceAction`) that returns the next record set, an audit event, and an honest capability state. Dexie persists that result.

Money is integer minor units. A journal posts only when debits equal credits. Reports are derived from posted journals, not stored balances.

Editors store structured JSON (cells, nodes, layers, slides, blocks) on the record, with a history stack for undo.

Provider actions (`send`, `publish`, `pay`, `connect`, `deploy`) update the local record and return `not_connected`. They never set `verified_external`.

## Consequences

The app works offline after load and survives reload. It does not sync across devices or people. Role switching is a local view, documented in Administration, and is not enforcement. A future service can implement the same action result shape without rewriting the screens.
