import { describe, expect, it } from "vitest";
import type { Rec } from "@/domain/types";
import { answeredCount, readPreviewRuns, staleLabels, withPreviewRun, type PreviewRun } from "@/applications/forms/previewRuns";
import { readSite, type SiteModel } from "@/applications/web/model";
import { addPage, deletePage, duplicatePage, freePath, inboundReferences, movePage, pageProblem, slugPath, updatePage } from "@/applications/web/pages";
import { findLink, moveChild, placeLink, removeLink, targetProblem } from "@/applications/web/nav";
import { applyQuery, bindingProblems, describeQuery, readFilters, readInteraction, readLimit, readSort, type QueryFilter } from "@/applications/build/binding";
import { CONNECTOR_ENTRIES, connectorPath, connectorRecordFor, entryById } from "@/applications/connect/catalog";

function rec(partial: Partial<Rec>): Rec {
  return {
    id: "r1", organizationId: "org-northline", collection: "x", title: "Record", status: "open", ownerName: "Maya Chen",
    summary: "", currency: "GBP", tags: [], fields: {}, createdAt: "2026-11-01T09:00:00.000Z", updatedAt: "2026-11-01T09:00:00.000Z",
    revision: 1, createdBy: "Maya Chen", updatedBy: "Maya Chen", history: [], ...partial,
  };
}

const run = (id: string, at: string, answers: [string, string][] = [["Name", "Ada"], ["Notes", ""]]): PreviewRun => ({
  id, at, by: "Maya Chen", version: 2, device: "desktop", answers, hidden: 1,
});

describe("FORMS preview runs", () => {
  it("reads stored runs newest first and drops malformed entries", () => {
    const record = rec({ body: { previewRuns: [run("a", "2026-11-01T10:00:00Z"), { id: "", at: "x" }, "junk", run("b", "2026-11-02T10:00:00Z")] } });
    const runs = readPreviewRuns(record);
    expect(runs.map((item) => item.id)).toEqual(["b", "a"]);
    expect(readPreviewRuns(rec({ body: {} }))).toEqual([]);
  });

  it("keeps at most the limit and replaces a run with the same id", () => {
    let runs: PreviewRun[] = [];
    for (let n = 0; n < 12; n += 1) runs = withPreviewRun(runs, run(`r${n}`, `2026-11-${String(n + 1).padStart(2, "0")}T10:00:00Z`));
    expect(runs).toHaveLength(10);
    expect(runs[0].id).toBe("r11");
    expect(withPreviewRun(runs, { ...runs[0], hidden: 3 }).filter((item) => item.id === "r11")).toHaveLength(1);
  });

  it("counts answered questions and flags questions removed since the run", () => {
    const item = run("a", "2026-11-01T10:00:00Z");
    expect(answeredCount(item)).toBe(1);
    expect(staleLabels(item, ["Name"])).toEqual(["Notes"]);
  });
});

function site(): SiteModel {
  return readSite(rec({
    collection: "sites",
    body: {
      pages: [
        { id: "home", name: "Home", path: "/", blocks: [{ id: "b1", type: "hero", props: { title: "Hi", ctaLabel: "About us", ctaTarget: "/about" } }] },
        { id: "about", name: "About", path: "/about", blocks: [] },
        { id: "contact", name: "Contact", path: "/contact", blocks: [] },
      ],
      nav: {
        header: [
          { id: "n1", label: "Home", target: "/", kind: "page", children: [] },
          { id: "n2", label: "About", target: "/about", kind: "page", children: [{ id: "n3", label: "Contact", target: "/contact", kind: "page", children: [] }] },
        ],
        footer: [{ id: "f1", label: "About", target: "/about", kind: "page", children: [] }],
        redirects: [{ id: "r0", from: "/team", to: "/about", code: 301 }],
      },
    },
  }));
}

describe("WEB page management", () => {
  it("derives free, valid addresses from names", () => {
    expect(slugPath("Opening hours & Café")).toBe("/opening-hours-cafe");
    expect(freePath(site(), "/about")).toBe("/about-2");
    expect(pageProblem(site(), "About again", "/about")).toMatch(/already used/);
    expect(pageProblem(site(), "Bad", "/Bad Path")).toMatch(/lower case/);
    expect(pageProblem(site(), "Ok", "/ok")).toBeUndefined();
  });

  it("adds a draft page and optionally a header link", () => {
    const change = addPage(site(), "Services", "/services", { addToMenu: true });
    expect(change.site.pages.at(-1)?.path).toBe("/services");
    expect(change.site.pages.at(-1)?.status).toBe("draft");
    expect(change.site.nav.header.at(-1)?.target).toBe("/services");
    expect(() => addPage(site(), "Dup", "/about", { addToMenu: false })).toThrow(/already used/);
  });

  it("moving a page rewrites links and buttons and keeps the old address with a 301", () => {
    const before = site();
    expect(inboundReferences(before, "/about")).toEqual({ menu: 2, buttons: 1 });
    const { site: next } = updatePage(before, "about", { name: "Our studio", path: "/studio", status: "published" });
    expect(next.pages.find((page) => page.id === "about")).toMatchObject({ name: "Our studio", path: "/studio", status: "published" });
    expect(next.nav.header[1]).toMatchObject({ target: "/studio", label: "Our studio" });
    expect(next.nav.footer[0].target).toBe("/studio");
    expect(next.pages[0].blocks[0].props.ctaTarget).toBe("/studio");
    expect(next.nav.redirects).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: "/about", to: "/studio", code: 301 }),
      expect.objectContaining({ from: "/team", to: "/studio" }),
    ]));
    expect(inboundReferences(next, "/about")).toEqual({ menu: 0, buttons: 0 });
  });

  it("duplicates as a hidden draft with fresh block ids", () => {
    const { site: next, pageId } = duplicatePage(site(), "home");
    const copy = next.pages.find((page) => page.id === pageId)!;
    expect(copy.path).toBe("/home-copy");
    expect(copy.seo.noindex).toBe(true);
    expect(copy.blocks[0].id).not.toBe("b1");
    expect(copy.blocks[0].props.title).toBe("Hi");
    expect(next.pages.findIndex((page) => page.id === pageId)).toBe(1);
  });

  it("deletes a page, removing menu links and redirecting buttons when asked", () => {
    const { site: next } = deletePage(site(), "about", { redirectTo: "/" });
    expect(next.pages.map((page) => page.id)).toEqual(["home", "contact"]);
    expect(next.nav.header.map((link) => link.id)).toEqual(["n1"]);
    expect(next.nav.footer).toEqual([]);
    expect(next.pages[0].blocks[0].props.ctaTarget).toBe("/");
    expect(next.nav.redirects).toEqual([expect.objectContaining({ from: "/about", to: "/" })]);
    const single = readSite(rec({ collection: "sites", body: { pages: [{ id: "only", name: "Home", path: "/", blocks: [] }] } }));
    expect(() => deletePage(single, "only", { redirectTo: "" })).toThrow(/at least one page/);
  });

  it("reorders pages within bounds", () => {
    expect(movePage(site(), "contact", -1).pages.map((page) => page.id)).toEqual(["home", "contact", "about"]);
    expect(movePage(site(), "home", -1).pages[0].id).toBe("home");
  });
});

describe("WEB menu tree", () => {
  it("finds, places, nests and removes links one level deep", () => {
    const links = site().nav.header;
    expect(findLink(links, "n3")).toMatchObject({ parentId: "n2" });
    const moved = placeLink(links, { ...findLink(links, "n3")!.link }, "");
    expect(moved.map((link) => link.id)).toEqual(["n1", "n2", "n3"]);
    expect(moved[1].children).toEqual([]);
    const nested = placeLink(moved, { id: "n4", label: "Blog", target: "https://example.com", kind: "external", children: [] }, "n1");
    expect(nested[0].children.map((link) => link.id)).toEqual(["n4"]);
    // A link that has its own submenu stays at the top level.
    const parentWithChildren = { ...links[1] };
    expect(placeLink(links, parentWithChildren, "n1").map((link) => link.id)).toEqual(["n1", "n2"]);
    expect(removeLink(links, "n3")[1].children).toEqual([]);
  });

  it("reorders children and validates targets", () => {
    const links = placeLink(site().nav.header, { id: "n5", label: "Map", target: "#map", kind: "anchor", children: [] }, "n2");
    expect(moveChild(links, "n2", "n5", -1)[1].children.map((link) => link.id)).toEqual(["n5", "n3"]);
    expect(targetProblem(site(), "page", "/nowhere")).toMatch(/not a page/);
    expect(targetProblem(site(), "anchor", "map")).toMatch(/#/);
    expect(targetProblem(site(), "external", "example.com")).toMatch(/scheme/);
    expect(targetProblem(site(), "external", "javascript:alert(1)")).toMatch(/https/);
    expect(targetProblem(site(), "external", "mailto:hello@example.com")).toBeUndefined();
  });
});

describe("BUILD data binding", () => {
  const rows = [
    { id: "1", status: "open", amount: "120", due: "2026-11-20" },
    { id: "2", status: "closed", amount: "80", due: "" },
    { id: "3", status: "open", amount: "15", due: "2026-11-02" },
    { id: "4", status: "waiting", amount: "300", due: "2026-12-01" },
  ];
  const read = (row: (typeof rows)[number], fieldId: string) => String(row[fieldId as keyof typeof row] ?? "");
  const known = ["status", "amount", "due"];
  const filter = (fieldId: string, operator: QueryFilter["operator"], value = ""): QueryFilter => ({ id: `${fieldId}${operator}`, fieldId, operator, value });

  it("filters with AND, compares numbers numerically and sorts empties last", () => {
    const open = applyQuery(rows, { filters: [filter("status", "not_equals", "closed"), filter("amount", "greater_than", "100")], sort: null, limit: 0 }, read, known);
    expect(open.rows.map((row) => row.id)).toEqual(["1", "4"]);
    expect(open).toMatchObject({ matched: 2, total: 4 });
    const byDue = applyQuery(rows, { filters: [], sort: { fieldId: "due", direction: "desc" }, limit: 0 }, read, known);
    expect(byDue.rows.map((row) => row.id)).toEqual(["4", "1", "3", "2"]);
    const limited = applyQuery(rows, { filters: [filter("due", "not_empty")], sort: { fieldId: "amount", direction: "asc" }, limit: 2 }, read, known);
    expect(limited.rows.map((row) => row.id)).toEqual(["3", "1"]);
    expect(limited.matched).toBe(3);
  });

  it("skips filters on missing fields or without a value instead of hiding everything", () => {
    const result = applyQuery(rows, { filters: [filter("gone", "equals", "x"), filter("status", "equals", "")], sort: { fieldId: "gone", direction: "asc" }, limit: 0 }, read, known);
    expect(result.rows).toHaveLength(4);
  });

  it("reads stored bindings defensively and describes them", () => {
    expect(readFilters([{ fieldId: "status", operator: "bogus", value: 3 }])).toEqual([{ id: "f1", fieldId: "status", operator: "equals", value: "3" }]);
    expect(readSort({ fieldId: "" })).toBeNull();
    expect(readSort({ fieldId: "due", direction: "desc" })).toEqual({ fieldId: "due", direction: "desc" });
    expect(readLimit(-3)).toBe(0);
    expect(readLimit(9999)).toBe(500);
    expect(readInteraction({ kind: "teleport", screenId: "s" })).toEqual({ kind: "none", screenId: "" });
    const names: Record<string, string> = { status: "Status", amount: "Amount" };
    expect(describeQuery({ filters: [filter("status", "equals", "open")], sort: { fieldId: "amount", direction: "desc" }, limit: 10 }, (id) => names[id]))
      .toBe('where Status is "open", sorted by Amount descending, first 10');
    expect(describeQuery({ filters: [], sort: null, limit: 0 }, (id) => names[id])).toBe("all records");
  });

  it("reports stale fields and broken interaction targets", () => {
    const screens = [{ id: "s1", name: "List" }, { id: "s2", name: "Detail" }];
    const base = { title: "Quotes", kind: "table", filters: [filter("gone", "equals", "x")], sort: { fieldId: "gone", direction: "asc" as const }, interaction: { kind: "open_record" as const, screenId: "missing" } };
    const problems = bindingProblems(base, known, screens, "s1");
    expect(problems.map((problem) => problem.level)).toEqual(["fail", "fail", "fail"]);
    expect(bindingProblems({ ...base, filters: [], sort: null, interaction: { kind: "open_screen", screenId: "s1" } }, known, screens, "s1")[0].level).toBe("warn");
    expect(bindingProblems({ ...base, filters: [], sort: null, interaction: { kind: "open_record", screenId: "s2" } }, known, screens, "s1")).toEqual([]);
  });
});

describe("CONNECT connector routes", () => {
  it("routes by the organisation's own connector record, preferring an exact capability id", () => {
    const email = entryById("email.send")!;
    const records = [
      rec({ id: "nl-connectors-002", collection: "connectors", fields: { provider: "email" } }),
      rec({ id: "nl-connectors-031", collection: "connectors", fields: { capabilityId: "email.send", kind: "capability" } }),
      rec({ id: "nl-connectors-030", collection: "connectors", fields: { provider: "email", kind: "custom" } }),
    ];
    expect(connectorRecordFor(records, email)?.id).toBe("nl-connectors-031");
    expect(connectorRecordFor(records.slice(0, 1), email)?.id).toBe("nl-connectors-002");
    expect(connectorRecordFor(records.slice(2), email)).toBeUndefined();
    expect(connectorPath("northline", records, email, "marketplace")).toBe("/o/northline/connect/marketplace/nl-connectors-031");
    const other = CONNECTOR_ENTRIES.find((entry) => entry.capability.id !== "email.send")!;
    expect(connectorPath("northline", records, other, "connect")).toBeUndefined();
  });
});
