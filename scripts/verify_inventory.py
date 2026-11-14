#!/usr/bin/env python3
"""Fail if the running catalog drifts from the screen registry."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REG = json.loads((ROOT / "docs/arlovi/07_ORIGINAL_SPECIFICATIONS/Arlovi_Complete_UX_Screen_Registry.json").read_text())
CAT = json.loads((ROOT / "src/generated/catalog.json").read_text())

errors: list[str] = []
reg_ids = []
reg_tabs = reg_actions = reg_overlays = 0
for app in REG["applications"]:
    for page in app["pages"]:
        reg_ids.append(page["id"])
        reg_tabs += len(page["tabs"])
        reg_actions += len(page["actions"])
        reg_overlays += len(page["overlays"])

cat_ids = [screen["id"] for screen in CAT["screens"]]
if cat_ids != reg_ids:
    errors.append(f"screen id mismatch catalog={len(cat_ids)} registry={len(reg_ids)}")
if len(CAT["applications"]) != 35 or len(CAT["screens"]) != 316:
    errors.append("application or screen count is not 35/316")
tabs = sum(len(screen["tabs"]) for screen in CAT["screens"])
actions = sum(len(screen["actions"]) for screen in CAT["screens"])
overlays = sum(len(screen["overlays"]) for screen in CAT["screens"])
if (tabs, actions, overlays) != (reg_tabs, reg_actions, reg_overlays) or (tabs, actions, overlays) != (1323, 1328, 956):
    errors.append(f"interaction counts tabs={tabs} actions={actions} overlays={overlays}")

routes = [screen["route"] for screen in CAT["screens"]]
if len(routes) != len(set(routes)):
    errors.append("duplicate routes")

src = "\n".join(path.read_text(errors="ignore") for path in (ROOT / "src").rglob("*.tsx"))
src += "\n".join(path.read_text(errors="ignore") for path in (ROOT / "src").rglob("*.ts") if "generated" not in str(path))
for word in ("MVP", "prototype", "mockup", "coming soon", "lorem ipsum"):
    if re.search(word, src, re.I):
        errors.append(f"user-facing source contains {word}")

required = [
    "src/domain/finance.ts",
    "src/domain/engine.ts",
    "src/domain/scenarios.ts",
    "src/editors/studio.tsx",
    "src/app/screen.tsx",
    "src/runtime/db.ts",
]
for rel in required:
    if not (ROOT / rel).exists():
        errors.append(f"missing {rel}")

if errors:
    print("\n".join(errors))
    sys.exit(1)
print(f"inventory ok screens={len(cat_ids)} tabs={tabs} actions={actions} overlays={overlays}")
