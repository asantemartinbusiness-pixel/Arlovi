#!/usr/bin/env python3
"""Fail if the running catalog drifts from the screen registry."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from build_catalog import APPROVED_TAB_EXTENSIONS

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
declared = REG["counts"]
declared_counts = (declared["tabs"], declared["primary_actions"], declared["overlays"])
actual_counts = (tabs, actions, overlays)
# Approved post-spec navigation tabs extend historical counts without allowing drift.
extension_count = sum(len(values) for values in APPROVED_TAB_EXTENSIONS.values())
registry_counts = (reg_tabs + extension_count, reg_actions, reg_overlays)
expected_counts = (declared_counts[0] + extension_count, declared_counts[1], declared_counts[2])
for screen in CAT["screens"]:
    allowed = APPROVED_TAB_EXTENSIONS.get(screen["id"], [])
    original = next((page for app in REG["applications"] for page in app["pages"] if page["id"] == screen["id"]), None)
    if original and screen["tabs"] != list(dict.fromkeys([*original["tabs"], *allowed])):
        errors.append(f"unapproved tabs in {screen['id']}")
if actual_counts != registry_counts or actual_counts != expected_counts:
    errors.append(
        f"interaction counts catalog={actual_counts}, registry={registry_counts}, declared={declared_counts}"
    )

routes = [screen["route"] for screen in CAT["screens"]]
if len(routes) != len(set(routes)):
    errors.append("duplicate routes")

def strip_comments(text: str) -> str:
    """Placeholder words in a comment are not user-facing; drop comments before matching."""
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    return re.sub(r"(?<![:\"'`])//[^\n]*", "", text)


sources = [path for pattern in ("*.tsx", "*.ts") for path in (ROOT / "src").rglob(pattern) if "generated" not in str(path)]
src = "\n".join(strip_comments(path.read_text(errors="ignore")) for path in sources)
# "prototype" is deliberately not listed: clickable prototypes are a Design feature,
# and `.prototype` is a language construct. The words below are placeholder copy.
for word in (r"\bMVP\b", r"mockup", r"coming soon", r"lorem ipsum"):
    if re.search(word, src, re.I):
        errors.append(f"user-facing source contains placeholder text matching {word}")

required = [
    "src/domain/finance.ts",
    "src/domain/engine.ts",
    "src/domain/scenarios.ts",
    "src/app/ScreenHost.tsx",
    "src/platform/registry.ts",
    "src/platform/clock.tsx",
    "src/runtime/db.ts",
]
for rel in required:
    if not (ROOT / rel).exists():
        errors.append(f"missing {rel}")

# The generic renderer was retired. Screens are owned by their application; do not bring it back.
retired = ["src/app/screen.tsx", "src/app/shell.tsx", "src/views", "src/editors", "src/styles.css"]
for rel in retired:
    if (ROOT / rel).exists():
        errors.append(f"retired path is back: {rel}")

if errors:
    print("\n".join(errors))
    sys.exit(1)
print(f"inventory ok screens={len(cat_ids)} tabs={tabs} actions={actions} overlays={overlays}")
