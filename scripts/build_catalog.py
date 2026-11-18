#!/usr/bin/env python3
"""Build the slim screen catalog consumed by the Arlovi frontend."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REG = ROOT / "docs/arlovi/07_ORIGINAL_SPECIFICATIONS/Arlovi_Complete_UX_Screen_Registry.json"
OUT = ROOT / "src/generated/catalog.json"

DEFAULT = {
    "HQ": "departments",
    "AI": "conversations",
    "BRAIN": "facts",
    "TEAM": "agents",
    "MISSION": "missions",
    "FIN": "journals",
    "CRM": "deals",
    "HR": "employees",
    "PROJECT": "projects",
    "COMMS": "channels",
    "CARE": "tickets",
    "MARKET": "campaigns",
    "COMMERCE": "products",
    "BOOK": "bookings",
    "DOCS": "documents",
    "SHEETS": "workbooks",
    "PRESENT": "decks",
    "DESIGN": "designs",
    "PHOTO": "photos",
    "LAYOUT": "publications",
    "VIDEO": "videos",
    "MOTION": "motions",
    "WEB": "sites",
    "BUILD": "appProjects",
    "FORMS": "forms",
    "AUTO": "workflows",
    "ANALYTICS": "datasets",
    "PROC": "purchaseOrders",
    "CONNECT": "connectors",
    "IT": "incidents",
    "INBOX": "notifications",
    "ADMIN": "policies",
    "LEGAL": "contracts",
    "PORTAL": "portals",
    "ASSET": "assets",
}

# Longest-prefix style: first match wins, so more specific fragments come first.
RULES: list[tuple[str, str]] = [
    ("/hq/home", "objectives"),
    ("/hq/my-work", "tasks"),
    ("/hq/company", "objectives"),
    ("/hq/departments", "departments"),
    ("/hq/organization", "members"),
    ("/hq/goals", "objectives"),
    ("/hq/locations", "locations"),
    ("/hq/timeline", "timelineEvents"),
    ("/hq/directory", "members"),
    ("/ai/chat", "conversations"),
    ("/ai/conversations", "conversations"),
    ("/ai/agents/", "agents"),
    ("/ai/rooms/", "channels"),
    ("/ai/missions/", "missions"),
    ("/ai/voice", "meetings"),
    ("/ai/meetings/", "meetings"),
    ("/ai/research/", "facts"),
    ("/ai/context", "sources"),
    ("/ai/artifacts/", "documents"),
    ("/brain/home", "facts"),
    ("/brain/sources", "sources"),
    ("/brain/graph", "facts"),
    ("/brain/facts", "facts"),
    ("/brain/conflicts", "conflicts"),
    ("/brain/decisions", "decisions"),
    ("/brain/brand", "brands"),
    ("/brain/permissions", "policies"),
    ("/brain/intake", "sources"),
    ("/team/home", "agents"),
    ("/team/agents", "agents"),
    ("/team/organization", "members"),
    ("/team/skills", "skills"),
    ("/team/academy", "skills"),
    ("/team/evaluations", "evaluations"),
    ("/team/performance", "evaluations"),
    ("/team/models", "connectors"),
    ("/mission/missions/new", "missions"),
    ("/mission/missions/", "missions"),
    ("/mission/templates", "templates"),
    ("/mission/missions", "missions"),
    ("/fin/accounts", "accounts"),
    ("/fin/ledger", "journals"),
    ("/fin/invoices", "invoices"),
    ("/fin/bills", "bills"),
    ("/fin/expenses", "expenses"),
    ("/fin/banking", "bankTransactions"),
    ("/fin/reconciliation", "bankTransactions"),
    ("/fin/budgets", "budgets"),
    ("/fin/tax", "taxCodes"),
    ("/fin/reports", "journals"),
    ("/fin/entities", "legalEntities"),
    ("/fin/home", "journals"),
    ("/crm/home", "deals"),
    ("/crm/contacts", "contacts"),
    ("/crm/companies", "companies"),
    ("/crm/leads", "leads"),
    ("/crm/deals", "deals"),
    ("/crm/quotes", "quotes"),
    ("/crm/activities", "activities"),
    ("/crm/forecasts", "deals"),
    ("/crm/automation", "workflows"),
    ("/hr/home", "employees"),
    ("/hr/employees", "employees"),
    ("/hr/recruitment", "applicants"),
    ("/hr/candidates/", "applicants"),
    ("/hr/onboarding", "employees"),
    ("/hr/leave", "leaveRequests"),
    ("/hr/scheduling", "shifts"),
    ("/hr/payroll", "payrollRuns"),
    ("/hr/performance", "reviews"),
    ("/hr/learning", "policies"),
    ("/project/portfolios", "projects"),
    ("/project/projects/", "projects"),
    ("/project/projects", "projects"),
    ("/project/tasks/", "tasks"),
    ("/project/workload", "tasks"),
    ("/project/templates", "templates"),
    ("/project/goals", "objectives"),
    ("/project/time", "shifts"),
    ("/comms/home", "channels"),
    ("/comms/channels", "channels"),
    ("/comms/messages", "messages"),
    ("/comms/email/", "emailThreads"),
    ("/comms/email", "emailThreads"),
    ("/comms/calendar", "meetings"),
    ("/comms/meetings/", "meetings"),
    ("/comms/calls", "calls"),
    ("/comms/announcements", "announcements"),
    ("/comms/preferences", "preferences"),
    ("/care/home", "tickets"),
    ("/care/inbox", "tickets"),
    ("/care/tickets", "tickets"),
    ("/care/customers/", "contacts"),
    ("/care/knowledge", "articles"),
    ("/care/automation", "macros"),
    ("/care/slas", "slas"),
    ("/care/quality", "tickets"),
    ("/market/home", "campaigns"),
    ("/market/campaigns", "campaigns"),
    ("/market/calendar", "socialPosts"),
    ("/market/social", "socialPosts"),
    ("/market/email", "campaigns"),
    ("/market/audiences", "audiences"),
    ("/market/ads", "campaigns"),
    ("/market/seo", "sites"),
    ("/market/pages", "sites"),
    ("/market/analytics", "campaigns"),
    ("/market/templates", "templates"),
    ("/commerce/home", "orders"),
    ("/commerce/products", "products"),
    ("/commerce/inventory", "stockMoves"),
    ("/commerce/orders", "orders"),
    ("/commerce/storefront", "products"),
    ("/commerce/checkout", "orders"),
    ("/commerce/fulfilment", "orders"),
    ("/commerce/returns", "returns"),
    ("/commerce/promotions", "promotions"),
    ("/commerce/analytics", "orders"),
    ("/book/home", "bookings"),
    ("/book/calendar", "bookings"),
    ("/book/bookings/", "bookings"),
    ("/book/services", "services"),
    ("/book/resources", "resources"),
    ("/book/public/", "services"),
    ("/book/reminders", "bookings"),
    ("/book/reports", "bookings"),
    ("/docs/files", "documents"),
    ("/docs/documents/", "documents"),
    ("/docs/templates", "templates"),
    ("/sheets/workbooks", "workbooks"),
    ("/present/decks", "decks"),
    ("/design/files", "designs"),
    ("/design/components", "designs"),
    ("/design/libraries", "assets"),
    ("/photo/", "photos"),
    ("/layout/", "publications"),
    ("/video/", "videos"),
    ("/motion/", "motions"),
    ("/web/", "sites"),
    ("/build/", "appProjects"),
    ("/forms/", "forms"),
    ("/auto/runs", "workflowRuns"),
    ("/auto/", "workflows"),
    ("/analytics/", "datasets"),
    ("/proc/suppliers", "suppliers"),
    ("/proc/requisitions", "purchaseOrders"),
    ("/proc/orders", "purchaseOrders"),
    ("/proc/receipts", "receipts"),
    ("/proc/receiving", "receipts"),
    ("/proc/warehouses", "warehouses"),
    ("/proc/movements", "stockMoves"),
    ("/proc/stock", "stockMoves"),
    ("/proc/", "purchaseOrders"),
    ("/connect/", "connectors"),
    ("/it/", "incidents"),
    ("/inbox/approvals", "approvals"),
    ("/inbox/", "notifications"),
    ("/admin/members", "members"),
    ("/admin/audit", "timelineEvents"),
    ("/admin/", "policies"),
    ("/legal/risks", "risks"),
    ("/legal/obligations", "obligations"),
    ("/legal/", "contracts"),
    ("/portal/", "portals"),
    ("/asset/", "assets"),
]


# Approved post-spec navigation refinements. Keep generated contracts aligned with
# the live application registry without rewriting the historical 1.8MB registry.
APPROVED_TAB_EXTENSIONS = {
    "ARL-COMMS-005": ["Shared inboxes", "Accounts & domains", "Sender identities"],
}


def collection_for(app: str, route: str) -> str:
    for frag, col in RULES:
        if frag in route:
            return col
    return DEFAULT[app]


def main() -> None:
    data = json.loads(REG.read_text())
    apps = []
    screens = []
    for app in data["applications"]:
        apps.append(
            {
                "code": app["code"],
                "name": app["name"],
                "purpose": app["purpose"],
                "roles": app["roles"],
                "entities": app["entities"],
            }
        )
        for pg in app["pages"]:
            col = collection_for(app["code"], pg["route"])
            screens.append(
                {
                    "id": pg["id"],
                    "title": pg["title"],
                    "route": pg["route"],
                    "archetype": pg["archetype"],
                    "applicationCode": app["code"],
                    "applicationName": app["name"],
                    "purpose": app["purpose"],
                    "regions": pg["regions"],
                    "tabs": list(dict.fromkeys([*pg["tabs"], *APPROVED_TAB_EXTENSIONS.get(pg["id"], [])])),
                    "actions": pg["actions"],
                    "overlays": pg["overlays"],
                    "ai": pg["ai"],
                    "edge": pg["edge"],
                    "collection": col,
                    "sampleId": f"nl-{col}-001",
                }
            )
    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "applications": apps,
        "screens": screens,
        "counts": data["counts"],
        "globalStates": data["global_states"],
        "globalSurfaces": [
            (s[0] if isinstance(s, list) else s if isinstance(s, str) else str(s))
            for s in data["global_surfaces"]
        ],
    }
    OUT.write_text(json.dumps(payload, indent=2))
    print(f"wrote {OUT} screens={len(screens)} apps={len(apps)}")


if __name__ == "__main__":
    main()
