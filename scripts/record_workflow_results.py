#!/usr/bin/env python3
"""Record the journey results from a Playwright JSON report.

    npx playwright test e2e/workflows.spec.ts --reporter=json > report.json
    python3 scripts/record_workflow_results.py report.json

Writes docs/implementation/workflow-results.json, which the screen ledger reads.
A test with any failed soft assertion is recorded as failed.
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]


def walk(suite, prefix=""):
    title = suite.get("title", "")
    here = f"{prefix} › {title}" if prefix and title and not title.endswith(".ts") else (title if not title.endswith(".ts") else prefix)
    for spec in suite.get("specs", []):
        results = [result for test in spec.get("tests", []) for result in test.get("results", [])]
        last = results[-1] if results else {}
        status = "passed" if spec.get("ok") and last.get("status") == "passed" else "failed"
        errors = [error.get("message", "").split("\n")[0][:300] for error in last.get("errors", [])]
        yield {"title": f"{here} › {spec['title']}".strip(" ›"), "status": status, "errors": errors}
    for child in suite.get("suites", []):
        yield from walk(child, here)


JOURNEYS = {"Journey: posted journal": "posted journal survive", "Journey: storefront order": "storefront order", "Journey: invoice": "an invoice can be created"}


def resolve_defects(tests):
    """A defect is fixed when its journey ran and its DEFECT message no longer fires.

    A defect with no message of its own is fixed only when its whole journey passes.
    Unasserted findings are never changed here.
    """
    path = ROOT / "docs" / "implementation" / "defects.json"
    if not path.exists():
        return
    register = json.loads(path.read_text())
    for defect in register["defects"]:
        key = JOURNEYS.get(defect["workflow"], defect["workflow"])
        test = next((t for t in tests if key in t["title"]), None)
        if test is None:
            continue
        if defect["match"]:
            fires = any(defect["match"] in error for error in test["errors"])
            # A hard failure (any error that is not a DEFECT soft assertion) stops the
            # journey, so a later message not firing is no evidence it was fixed.
            ran_to_end = all("DEFECT:" in error for error in test["errors"])
            defect["status"] = "fixed" if not fires and ran_to_end else "open"
        else:
            defect["status"] = "fixed" if test["status"] == "passed" else "open"
    path.write_text(json.dumps(register, indent=1) + "\n")


def main(path):
    report = json.loads(pathlib.Path(path).read_text())
    tests = [test for suite in report.get("suites", []) for test in walk(suite)]
    out = ROOT / "docs" / "implementation" / "workflow-results.json"
    out.write_text(json.dumps({"source": "e2e/workflows.spec.ts", "tests": tests}, indent=1) + "\n")
    resolve_defects(tests)
    passed = sum(1 for test in tests if test["status"] == "passed")
    print(f"{passed}/{len(tests)} journeys passed; written {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1]))
