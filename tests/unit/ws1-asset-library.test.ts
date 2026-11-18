import { describe, expect, it } from "vitest";
import type { Rec } from "@/domain/types";
import {
  ALL_FOLDERS, EMPTY_FILTER, UNFILED, addTags, duplicatesOf, filterAssets, folderCounts, hexDigest, kindForFile,
  licence, linkedIds, parseTags, sortAssets, tagCounts, titleFromFileName, validateUpload, withLink, withoutLink,
  UPLOAD_LIMIT_BYTES,
} from "@/applications/asset/library-model";

const NOW = new Date("2026-11-14T09:30:00Z");
let n = 0;
function asset(title: string, fields: Rec["fields"] = {}, extra: Partial<Rec> = {}): Rec {
  n += 1;
  return {
    id: `a-${n}`, organizationId: "org", collection: "assets", title, status: "approved", ownerName: "Maya Chen", summary: "",
    currency: "GBP", tags: [], fields, createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z", revision: 1,
    createdBy: "Maya Chen", updatedBy: "Maya Chen", history: [], ...extra,
  };
}

describe("asset tags", () => {
  it("normalises, de-duplicates and keeps order", () => {
    expect(parseTags("Press, Winter 2026, press,  hero!!\nwinter 2026")).toEqual(["press", "winter-2026", "hero"]);
    expect(addTags(["brand"], ["Brand", "New Tag"])).toEqual(["brand", "new-tag"]);
  });
  it("counts tags most used first", () => {
    const rows = [asset("a", {}, { tags: ["x", "y"] }), asset("b", {}, { tags: ["y"] })];
    expect(tagCounts(rows)).toEqual([{ tag: "y", count: 2 }, { tag: "x", count: 1 }]);
  });
});

describe("asset filtering", () => {
  const owned = asset("Ravelin hero", { kind: "image", licence: "owned", folderId: "f1", fileName: "rav-hero.jpg" }, { tags: ["product"] });
  const expired = asset("Harbour dusk", { kind: "image", licence: "stock", licenceExpiry: "2026-01-01T00:00:00Z" }, { tags: ["stock"] });
  const expiring = asset("Bench", { kind: "image", licence: "licensed", licenceExpiry: "2026-11-20T00:00:00Z" });
  const font = asset("Bodoni", { kind: "font" });
  const rows = [owned, expired, expiring, font];

  it("reads licence state against the clock", () => {
    expect(licence(expired, NOW).state).toBe("expired");
    expect(licence(expiring, NOW).state).toBe("expiring");
    expect(licence(font, NOW).state).toBe("unknown");
  });
  it("filters by folder, kind, licence, tag and every search term", () => {
    expect(filterAssets(rows, { ...EMPTY_FILTER, folder: "f1" }, NOW)).toEqual([owned]);
    expect(filterAssets(rows, { ...EMPTY_FILTER, folder: UNFILED }, NOW)).toHaveLength(3);
    expect(filterAssets(rows, { ...EMPTY_FILTER, kind: "font" }, NOW)).toEqual([font]);
    expect(filterAssets(rows, { ...EMPTY_FILTER, licence: "expired" }, NOW)).toEqual([expired]);
    expect(filterAssets(rows, { ...EMPTY_FILTER, licence: "clear" }, NOW)).toEqual([owned]);
    expect(filterAssets(rows, { ...EMPTY_FILTER, licence: "unrecorded" }, NOW)).toEqual([font]);
    expect(filterAssets(rows, { ...EMPTY_FILTER, tags: ["stock"] }, NOW)).toEqual([expired]);
    expect(filterAssets(rows, { ...EMPTY_FILTER, query: "rav-hero ravelin" }, NOW)).toEqual([owned]);
    expect(filterAssets(rows, { ...EMPTY_FILTER, query: "ravelin harbour" }, NOW)).toEqual([]);
    expect(filterAssets(rows, { ...EMPTY_FILTER, folder: ALL_FOLDERS }, NOW)).toHaveLength(4);
  });
  it("counts folders with unfiled assets kept separate", () => {
    const counts = folderCounts(rows);
    expect(counts.get("f1")).toBe(1);
    expect(counts.get(UNFILED)).toBe(3);
  });
});

describe("asset sorting", () => {
  const a = asset("Beta", { bytes: 500, usedIn: "One, Two" }, { updatedAt: "2026-11-10T00:00:00Z" });
  const b = asset("alpha", { bytes: 9000, linkedIds: "p1,p2,p3", licenceExpiry: "2026-12-01T00:00:00Z" }, { updatedAt: "2026-11-12T00:00:00Z" });
  const c = asset("Gamma", {}, { updatedAt: "2026-11-11T00:00:00Z" });
  it("sorts by each option", () => {
    expect(sortAssets([a, b, c], "updated").map((row) => row.title)).toEqual(["alpha", "Gamma", "Beta"]);
    expect(sortAssets([a, b, c], "oldest").map((row) => row.title)).toEqual(["Beta", "Gamma", "alpha"]);
    expect(sortAssets([a, b, c], "name").map((row) => row.title)).toEqual(["alpha", "Beta", "Gamma"]);
    expect(sortAssets([a, b, c], "size")[0]).toBe(b);
    expect(sortAssets([a, b, c], "uses").map((row) => row.title)).toEqual(["alpha", "Beta", "Gamma"]);
    expect(sortAssets([a, b, c], "expiry")[0]).toBe(b);
  });
});

describe("asset links", () => {
  it("adds and removes record links without duplicates", () => {
    const row = asset("x", { linkedIds: "p1" });
    expect(withLink(row, "p1")).toBe("p1");
    expect(withLink(row, "p2")).toBe("p1,p2");
    expect(withoutLink(asset("y", { linkedIds: "p1,p2" }), "p1")).toBe("p2");
    expect(linkedIds(asset("z"))).toEqual([]);
  });
});

describe("asset uploads", () => {
  it("classifies files by type and extension", () => {
    expect(kindForFile("image/png", "a.png")).toBe("image");
    expect(kindForFile("video/mp4", "a.mp4")).toBe("video");
    expect(kindForFile("audio/mpeg", "a.mp3")).toBe("audio");
    expect(kindForFile("application/pdf", "a.pdf")).toBe("document");
    expect(kindForFile("", "brief.docx")).toBe("document");
    expect(kindForFile("", "Face.woff2")).toBe("font");
    expect(kindForFile("application/zip", "pack.zip")).toBe("other");
  });
  it("refuses empty and oversized files with a reason", () => {
    expect(validateUpload({ name: "a.png", size: 0 })).toMatch(/empty/);
    expect(validateUpload({ name: "a.png", size: UPLOAD_LIMIT_BYTES + 1 })).toMatch(/Keep each file under/);
    expect(validateUpload({ name: "a.png", size: 1000 })).toBeUndefined();
  });
  it("derives a readable title and a stable digest", () => {
    expect(titleFromFileName("winter_press-notes.final.txt")).toBe("Winter press notes.final");
    expect(hexDigest(new Uint8Array([0, 15, 255]).buffer)).toBe("000fff");
  });
  it("finds live duplicates by checksum only", () => {
    const live = asset("live", { checksum: "sha256-1" });
    const archived = asset("old", { checksum: "sha256-1" }, { status: "archived" });
    expect(duplicatesOf([live, archived, asset("other", { checksum: "sha256-2" })], "sha256-1")).toEqual([live]);
  });
});
