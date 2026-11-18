import { describe, expect, it } from "vitest";
import type { Rec } from "@/domain/types";
import {
  checkDraft, draftInput, draftRecord, folderCounts, isAddress, parseRecipients, searchThreads,
} from "@/applications/comms/mailbox";
import {
  agendaMinutes, agendaOf, answerTally, clashingIds, findClashes, formatAgenda, instant, minutesBetween, parseAgenda,
  upcomingByDay,
} from "@/applications/comms/schedule";

function rec(partial: Partial<Rec> & { id: string; collection: string }): Rec {
  return {
    organizationId: "org-northline", title: partial.id, status: "scheduled", summary: "", fields: {},
    createdAt: "2026-11-18T08:00:00.000Z", updatedAt: "2026-11-18T08:00:00.000Z", createdBy: "Maya Chen", updatedBy: "Maya Chen",
    ownerName: "Maya Chen", revision: 1, tags: [], currency: "GBP",
    ...partial,
  } as Rec;
}

const meeting = (id: string, start: string, minutes: number, attendees: string, status = "scheduled", extra: Partial<Rec> = {}) =>
  rec({ id, collection: "meetings", status, startAt: start, endAt: new Date(Date.parse(start) + minutes * 60_000).toISOString(), fields: { attendees }, ...extra });

describe("mailbox drafts", () => {
  it("parses and de-duplicates recipients", () => {
    expect(parseRecipients("a@x.com, b@y.org; A@x.com\n")).toEqual(["a@x.com", "b@y.org"]);
    expect(isAddress("leo@martins.example")).toBe(true);
    expect(isAddress("leo at martins")).toBe(false);
  });

  it("blocks malformed addresses and empty drafts, warns on the rest", () => {
    expect(checkDraft({ to: "nobody", subject: "Hi", body: "x" }).blocking[0]).toMatch(/not valid: nobody/);
    expect(checkDraft({ to: "", subject: "", body: "" }).blocking).toContain("The draft is empty.");
    const partial = checkDraft({ to: "", subject: "Glaze", body: "" });
    expect(partial.blocking).toEqual([]);
    expect(partial.warnings).toEqual(["No recipient yet.", "The message is empty."]);
    const bulk = checkDraft({ to: "a@x.io,b@x.io,c@x.io", cc: "d@x.io,e@x.io", subject: "s", body: "b" });
    expect(bulk.recipients).toBe(5);
    expect(bulk.warnings.join(" ")).toMatch(/bulk send/);
  });

  it("round-trips a draft through its record shape without claiming delivery", () => {
    const fields = draftRecord({ to: "leo@martins.example", cc: "", subject: "Quote", body: "Attached." }, "maya@northline.example", "2026-11-18T10:00:00.000Z");
    expect(fields.fields).toMatchObject({ folder: "drafts", delivery: "not_connected", to: "leo@martins.example" });
    const back = draftInput(rec({ id: "t1", collection: "emailThreads", ...fields }));
    expect(back).toEqual({ to: "leo@martins.example", cc: "", subject: "Quote", body: "Attached." });
  });

  it("searches every folder by subject, address and message text", () => {
    const threads = [
      rec({ id: "a", collection: "emailThreads", title: "Glaze samples", at: "2026-11-17T09:00:00.000Z", fields: { folder: "inbox", from: "kiln@supplier.example" } }),
      rec({ id: "b", collection: "emailThreads", title: "Quote", at: "2026-11-18T09:00:00.000Z", fields: { folder: "drafts", to: "leo@martins.example" }, body: { messages: [{ from: "maya", body: "The glaze batch ships Friday" }] } }),
      rec({ id: "c", collection: "emailThreads", title: "Invoice", fields: { folder: "archive" } }),
    ];
    expect(searchThreads(threads, "", "drafts").map((row) => row.id)).toEqual(["b"]);
    expect(searchThreads(threads, "glaze").map((row) => row.id)).toEqual(["b", "a"]);
    expect(searchThreads(threads, "glaze friday").map((row) => row.id)).toEqual(["b"]);
    expect(folderCounts(threads)).toMatchObject({ inbox: 1, drafts: 1, archive: 1, sent: 0, spam: 0 });
  });
});

describe("scheduling", () => {
  const meetings = [
    meeting("m1", "2026-11-18T11:00:00.000Z", 60, "Maya Chen,Theo Marsh"),
    meeting("m2", "2026-11-18T11:30:00.000Z", 30, "Theo Marsh,Priya Shah"),
    meeting("m3", "2026-11-18T14:00:00.000Z", 30, "Everyone"),
    meeting("m4", "2026-11-18T11:00:00.000Z", 60, "Maya Chen", "finished"),
  ];

  it("finds clashes only for shared people, treating Everyone as everyone", () => {
    const slot = { startAt: instant("2026-11-18", "11:15"), endAt: instant("2026-11-18", "11:45"), attendees: ["Priya Shah"] };
    expect(findClashes(meetings, slot).map((clash) => [clash.meeting.id, clash.who])).toEqual([["m2", ["Priya Shah"]]]);
    expect(findClashes(meetings, { ...slot, attendees: ["Iris Lindqvist"] })).toEqual([]);
    const afternoon = { startAt: instant("2026-11-18", "14:15"), endAt: instant("2026-11-18", "14:30"), attendees: ["Iris Lindqvist"] };
    expect(findClashes(meetings, afternoon).map((clash) => clash.meeting.id)).toEqual(["m3"]);
    // Editing a meeting does not clash with itself; finished meetings never clash.
    expect(findClashes(meetings, { startAt: meetings[0].startAt!, endAt: meetings[0].endAt!, attendees: ["Maya Chen"], excludeId: "m1" })).toEqual([]);
    expect(clashingIds(meetings)).toEqual(new Set(["m1", "m2"]));
  });

  it("parses agenda lines with optional owner and minutes", () => {
    const items = parseAgenda("Glaze decision — Maya Chen, 15\nBatch two, 10\nCatalogue shot list");
    expect(items).toEqual([
      { title: "Glaze decision", owner: "Maya Chen", minutes: 15, covered: false },
      { title: "Batch two", owner: "", minutes: 10, covered: false },
      { title: "Catalogue shot list", owner: "", minutes: 0, covered: false },
    ]);
    expect(agendaMinutes(items)).toBe(25);
    expect(parseAgenda(formatAgenda(items))).toEqual(items);
  });

  it("derives agenda items from a seeded one-line agenda", () => {
    const seeded = meeting("m5", "2026-11-18T11:00:00.000Z", 60, "Maya Chen", "scheduled", { fields: { attendees: "Maya Chen", agenda: "Glaze decision, batch two, catalogue shot list." } });
    expect(agendaOf(seeded).map((item) => item.title)).toEqual(["Glaze decision", "Batch two", "Catalogue shot list"]);
  });

  it("tallies only answers recorded here", () => {
    const withAnswers = meeting("m6", "2026-11-18T11:00:00.000Z", 30, "Maya Chen,Theo Marsh,Priya Shah", "scheduled", {
      body: { responses: { "Theo Marsh": { answer: "accepted", recordedBy: "Maya Chen", at: "2026-11-18T09:00:00.000Z" } } },
    });
    expect(answerTally(withAnswers)).toEqual({ invited: 2, accepted: 1, tentative: 0, declined: 0 });
  });

  it("groups upcoming meetings by day and measures durations", () => {
    const days = upcomingByDay([...meetings, meeting("old", "2026-11-10T09:00:00.000Z", 30, "Maya Chen")], new Date("2026-11-18T08:00:00.000Z"), 7);
    expect(days.map((day) => [day.day, day.meetings.length])).toEqual([["2026-11-18", 4]]);
    expect(minutesBetween(meetings[0].startAt, meetings[0].endAt)).toBe(60);
    expect(instant("2026-11-18", "bad")).toBe("");
  });
});
