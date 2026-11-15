#!/usr/bin/env python3
"""Build the implementation ledger from measured evidence only.

A screen is VERIFIED only when all three kinds of evidence agree:

  1. Contract   every contract tab, action and overlay is declared by the
                application that owns the screen
                (docs/implementation/registry-coverage.json, written by
                tests/unit/registry-contract.test.ts)
  2. Exercised  in a real browser, the screen loaded, every tab rendered a
                panel, every contract overlay opened and was implemented, and
                every enabled action ran, all with no console error
                (docs/implementation/deep-sweep/<APP>.json, written by
                e2e/deep.spec.ts)
  3. Semantics  each contract action was judged to perform the action it is
                named for, not routed to a related surface
                (docs/implementation/semantic-audit.json, one sign-off per
                application, recorded from the remediation reviews)

and no defect found by the cross-application journeys is still open against
it (docs/implementation/defects.json; journey results in
docs/implementation/workflow-results.json, written from e2e/workflows.spec.ts).
A screen with an open defect is reported as "defect-open", whatever else passed.

Nothing in the output is written by hand.
"""
import csv
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs" / "implementation"


def load(path, default=None):
    if not path.exists():
        return default
    return json.loads(path.read_text())


def main():
    coverage = load(DOCS / "registry-coverage.json")
    if coverage is None:
        print("missing registry-coverage.json; run: npx vitest run tests/unit/registry-contract.test.ts", file=sys.stderr)
        return 1

    sweep = {}
    sweep_dir = DOCS / "deep-sweep"
    if sweep_dir.exists():
        for file in sweep_dir.glob("*.json"):
            for result in json.loads(file.read_text()):
                sweep[result["id"]] = result

    semantic = load(DOCS / "semantic-audit.json", {"applications": {}})["applications"]
    defects = load(DOCS / "defects.json", {"defects": []})["defects"]
    workflows = load(DOCS / "workflow-results.json", {"tests": []})["tests"]
    open_by_screen = {}
    for defect in defects:
        if defect["status"] != "fixed":
            for screen_id in defect["screens"]:
                open_by_screen.setdefault(screen_id, []).append(defect["id"])

    rows = []
    for row in coverage["rows"]:
        contract_ok = (
            row["implementation"].startswith("bespoke")
            and not row["missingTabs"] and not row["missingActions"] and not row["missingOverlays"]
        )
        result = sweep.get(row["id"])
        if result:
            checks = result["checks"]
            failing = [c for c in checks if not c["ok"]]
            exercised_ok = not failing
            counts = {kind: sum(1 for c in checks if c["kind"] == kind and c["ok"]) for kind in ("tab", "overlay", "action")}
            guarded = len(result.get("guarded", []))
        else:
            failing, exercised_ok, counts, guarded = [], False, {"tab": 0, "overlay": 0, "action": 0}, 0
        signed = semantic.get(row["app"], {}).get("signedOff", False)

        open_defects = open_by_screen.get(row["id"], [])
        if open_defects:
            status = "defect-open"
        elif contract_ok and exercised_ok and signed:
            status = "verified"
        elif contract_ok and exercised_ok:
            status = "exercised"
        elif row["implementation"].startswith("bespoke"):
            status = "implemented"
        else:
            status = "not-built"

        rows.append({
            "id": row["id"],
            "application": row["app"],
            "title": row["title"],
            "route": row["route"],
            "status": status,
            "contract": "complete" if contract_ok else "incomplete",
            "swept": "yes" if result else "no",
            "tabs_exercised": f'{counts["tab"]}/{row["tabsRequired"]}',
            "overlays_exercised": f'{counts["overlay"]}/{row["overlaysRequired"]}',
            "actions_exercised": counts["action"],
            "actions_guarded": guarded,
            "semantic_signoff": "yes" if signed else "no",
            "open_defects": " ".join(open_defects),
            "failing": "; ".join(f'{c["kind"]} {c["name"]}: {c.get("note") or "failed"}' for c in failing)[:400],
            "missing": "; ".join(row["missingTabs"] + row["missingActions"] + row["missingOverlays"])[:300],
        })

    with (DOCS / "SCREEN_LEDGER.csv").open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    tally = {}
    for row in rows:
        tally[row["status"]] = tally.get(row["status"], 0) + 1
    by_app = {}
    for row in rows:
        entry = by_app.setdefault(row["application"], {"total": 0, "verified": 0, "defect-open": 0, "exercised": 0, "implemented": 0, "not-built": 0})
        entry["total"] += 1
        entry[row["status"]] += 1

    totals = coverage["totals"]
    lines = [
        "# Arlovi screen ledger",
        "",
        "Generated by `scripts/build_screen_ledger.py` from three kinds of measured evidence.",
        "Nothing in this file is written by hand.",
        "",
        "| Status | Meaning | Screens |",
        "| --- | --- | ---: |",
        f'| verified | Contract complete; every tab and every contract overlay exercised, and every action reachable without a specific selection pressed, in a browser with no console error; and the application\'s actions signed off as doing what they are named for | {tally.get("verified", 0)} |',
        f'| defect-open | A cross-application journey found a defect on this screen that is not yet fixed | {tally.get("defect-open", 0)} |',
        f'| exercised | Contract complete and exercised clean, but the semantic action audit is not signed off | {tally.get("exercised", 0)} |',
        f'| implemented | Owned by its application, but part of the contract is missing or an interaction failed in the browser | {tally.get("implemented", 0)} |',
        f'| not-built | Not yet owned by an application module | {tally.get("not-built", 0)} |',
        "",
        "## Contract coverage",
        "",
        "| Contract element | Declared | Required |",
        "| --- | ---: | ---: |",
        f'| Screens owned by their application | {totals["bespoke"]} | {totals["screens"]} |',
        f'| Tab instances | {totals["tabsDeclared"]} | {totals["tabsRequired"]} |',
        f'| Primary actions | {totals["actionsDeclared"]} | {totals["actionsRequired"]} |',
        f'| Overlays | {totals["overlaysDeclared"]} | {totals["overlaysRequired"]} |',
        "",
        "## By application",
        "",
        "| Application | Screens | Verified | Defect open | Exercised | Implemented | Not built | Semantic sign-off |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ]
    for code in sorted(by_app):
        entry = by_app[code]
        signed = "yes" if semantic.get(code, {}).get("signedOff") else "no"
        lines.append(f'| {code} | {entry["total"]} | {entry["verified"]} | {entry["defect-open"]} | {entry["exercised"]} | {entry["implemented"]} | {entry["not-built"]} | {signed} |')
    guarded_total = sum(int(row["actions_guarded"]) for row in rows)
    exercised_total = sum(int(row["actions_exercised"]) for row in rows)
    passed = [test for test in workflows if test["status"] == "passed"]
    lines += [
        "",
        "## Cross-application journeys",
        "",
        f"`e2e/workflows.spec.ts`: {len(passed)} of {len(workflows)} journeys pass in the last recorded run.",
        "",
        "| Journey | Result |",
        "| --- | --- |",
    ]
    lines += [f'| {test["title"]} | {test["status"]} |' for test in workflows]
    fixed = [d for d in defects if d["status"] == "fixed"]
    still_open = [d for d in defects if d["status"] != "fixed"]
    lines += [
        "",
        f"Defects found by the journeys: {len(defects)}; fixed and retested: {len(fixed)}; open: {len(still_open)}.",
        "",
    ]
    if still_open:
        lines += ["| Defect | Journey | Screens | Finding |", "| --- | --- | --- | --- |"]
        lines += [f'| {d["id"]} | {d["workflow"]} | {", ".join(d["screens"])} | {d["summary"]} |' for d in still_open]
        lines.append("")
    lines += [
        "",
        "## What this evidence does not cover",
        "",
        f"- **{guarded_total} actions were not pressed by the sweep.** Each needs a specific selection",
        "  the sweep could not make generically, so it stayed disabled. They were judged in the",
        "  semantic review and most were driven by hand in the remediation reviews, but this",
        f"  automated run did not exercise them. The sweep pressed {exercised_total} actions.",
        "- **Pressing an action is not the same as completing its save path.** The sweep opens what",
        "  an action opens and checks for errors; it does not fill and submit every form. Save paths",
        "  were checked selectively during remediation, and the open items below record where they",
        "  were not.",
        "- **External services are not connected.** Sending, paying, publishing, filing, calling and",
        "  model inference stop at a stated provider boundary. Verified means the boundary is",
        "  honest, not that the remote action happened.",
        "- **Visual quality is not measured here.** Layout, typography and responsive behaviour were",
        "  checked by screenshot on sampled screens, not across all 316.",
        "",
        "## Open items recorded at sign-off",
        "",
    ]
    for code in sorted(semantic):
        items = semantic[code].get("openItems", [])
        if items:
            lines.append(f"**{code}**")
            lines += [f"- {item}" for item in items]
            lines.append("")
    lines += ["Per-screen detail, including every failing check and guarded count, is in `SCREEN_LEDGER.csv`.", ""]
    (DOCS / "SCREEN_LEDGER.md").write_text("\n".join(lines))
    print(f"ledger written: {tally}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
