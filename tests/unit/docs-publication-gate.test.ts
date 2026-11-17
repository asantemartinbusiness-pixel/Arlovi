import { describe, expect, it } from "vitest";
import { emptyDoc, textBlock } from "@/applications/docs/model";
import { publicationBlockers } from "@/applications/docs/reviewGate";

describe("document approval and publish gates", () => {
  it("permits a saved draft with no mandatory objections or pending suggestions", () => {
    const model = emptyDoc();
    model.blocks = [textBlock("paragraph", "Approved text")];
    expect(publicationBlockers(model)).toEqual([]);
  });

  it("blocks unresolved mandatory comments, but not optional comments", () => {
    const model = emptyDoc();
    const ref = {
      id: "comment-1",
      anchor: { blockId: model.blocks[0].id, start: 0, end: 0 },
      quote: "", author: "Reviewer", at: "2026-11-17T01:00:00Z",
      body: "The contract needs this check", resolved: false,
      mandatory: true, replies: [],
    };
    model.comments.push(ref);
    expect(publicationBlockers(model)).toEqual(["1 mandatory review comment unresolved"]);
    model.comments[0].mandatory = false;
    expect(publicationBlockers(model)).toEqual([]);
    model.comments[0].mandatory = true;
    model.comments[0].resolved = true;
    expect(publicationBlockers(model)).toEqual([]);
  });

  it("blocks each pending suggestion until accepted or rejected", () => {
    const model = emptyDoc();
    model.suggestions.push({
      id: "suggestion-1", kind: "insert", author: "Reviewer",
      at: "2026-11-17T01:00:00Z", note: "Check a clause", status: "open",
    });
    expect(publicationBlockers(model)).toEqual(["1 tracked change awaiting decision"]);
    model.suggestions[0].status = "accepted";
    expect(publicationBlockers(model)).toEqual([]);
    model.suggestions[0].status = "rejected";
    expect(publicationBlockers(model)).toEqual([]);
  });

  it("reports multiple pending blockers without hiding either class", () => {
    const model = emptyDoc();
    model.comments = [
      ...[1, 2].map((n) => ({
        id: "comment-" + n,
        anchor: { blockId: model.blocks[0].id, start: 0, end: 0 },
        quote: "", author: "Reviewer", at: "2026-11-17T01:00:00Z",
        body: "Review " + n, resolved: false, mandatory: true, replies: [],
      })),
    ];
    model.suggestions = [
      ...[1, 2].map((n) => ({
        id: "suggestion-" + n, kind: "insert" as const, author: "Reviewer",
        at: "2026-11-17T01:00:00Z", note: "Change " + n, status: "open" as const,
      })),
    ];
    expect(publicationBlockers(model)).toEqual([
      "2 mandatory review comments unresolved",
      "2 tracked changes awaiting decision",
    ]);
  });
});
