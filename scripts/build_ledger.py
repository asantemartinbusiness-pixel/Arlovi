#!/usr/bin/env python3
"""Write an honest screen ledger. Rendered routes are not marked verified."""

import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
catalog = json.loads((root / "src/generated/catalog.json").read_text())

VERIFIED = {
    "ARL-FIN-003": "Posted a draft wage journal and saw an issued invoice journal in the ledger.",
    "ARL-FIN-004": "Created an invoice from the list and found it again on Awaiting payment after reload.",
    "ARL-FIN-005": "Edited a line and issued the draft into the local ledger. Drafted another invoice from a deal.",
    "ARL-CRM-007": "Draft invoice from the open deal opens in Finance.",
    "ARL-DESIGN-001": "New file opens the canvas.",
    "ARL-DESIGN-002": "Added a rectangle and it remained after reload.",
    "ARL-TEAM-002": "New specialist is listed in the directory.",
    "ARL-TEAM-003": "Generated contract opens the agent profile.",
    "ARL-TEAM-004": "Generate contract creates the agent and a directory member.",
    "ARL-HQ-006": "AI employees tab shows the new specialist.",
    "ARL-PROJECT-003": "Project overview shows the task stage after a board move.",
    "ARL-PROJECT-004": "Moved Photograph Arc Lamp to doing; the column survived reload.",
}

WS = {
    "HQ": "WS1", "INBOX": "WS1", "ADMIN": "WS1", "ASSET": "WS1",
    "AI": "WS2", "BRAIN": "WS2", "TEAM": "WS2", "MISSION": "WS2", "AUTO": "WS2", "ANALYTICS": "WS2",
    "FIN": "WS3", "CRM": "WS3", "HR": "WS3", "PROJECT": "WS3", "COMMS": "WS3", "CARE": "WS3", "LEGAL": "WS3",
    "MARKET": "WS4", "COMMERCE": "WS4", "BOOK": "WS4", "PROC": "WS4", "PORTAL": "WS4",
    "DOCS": "WS5", "SHEETS": "WS5", "PRESENT": "WS5", "DESIGN": "WS5", "PHOTO": "WS5", "LAYOUT": "WS5", "VIDEO": "WS5", "MOTION": "WS5",
    "WEB": "WS6", "BUILD": "WS6", "FORMS": "WS6", "CONNECT": "WS6", "IT": "WS6",
}

AXE = {
    "ARL-HQ-001": "No serious or critical axe findings on Executive Home.",
    "ARL-FIN-001": "No serious or critical axe findings on Finance Home.",
    "ARL-DOCS-002": "No serious or critical axe findings on the document editor.",
    "ARL-CRM-006": "No serious or critical axe findings on the deal board.",
}

rows = []
for screen in catalog["screens"]:
    code = screen["applicationCode"]
    verified = screen["id"] in VERIFIED
    rows.append({
        "id": screen["id"],
        "title": screen["title"],
        "route": screen["route"],
        "application": code,
        "workstream": WS.get(code, "WS6"),
        "status": "verified" if verified else "implemented",
        "source": [
            "src/app/screen.tsx",
            "src/domain/engine.ts",
            "src/generated/catalog.json",
        ],
        "functionality": VERIFIED.get(screen["id"], "Route, tabs, action buttons, and overlay buttons render. Actions call the local reducer. Specialist layout is still the shared archetype unless a desk is listed in HANDOFF.md."),
        "tests": "e2e/screens.spec.ts journey" if verified else "e2e/screens.spec.ts render pass (title, first tab, first action)",
        "visualReview": "journey" if verified else "render-only",
        "accessibilityReview": AXE.get(screen["id"], "not-reviewed"),
        "dependencies": [screen["collection"]],
        "defects": [] if verified else [
            "Shared archetype. Tabs filter records, but most overlays still use one form. Not every action has its own browser assertion."
        ],
    })

counts = {}
for row in rows:
    counts[row["status"]] = counts.get(row["status"], 0) + 1

out = {
    "asOf": "2026-11-14",
    "rule": "Only status verified counts as complete. A rendered route is implemented, not verified.",
    "registry": {
        "screens": len(catalog["screens"]),
        "tabs": sum(len(screen["tabs"]) for screen in catalog["screens"]),
        "actions": sum(len(screen["actions"]) for screen in catalog["screens"]),
        "overlays": sum(len(screen["overlays"]) for screen in catalog["screens"]),
    },
    "counts": counts,
    "screens": rows,
}
path = root / "docs/implementation/ledger.json"
path.write_text(json.dumps(out, indent=2) + "\n")
print(path, counts)
