// The calendar form works in the browser's local time; pin a zone with a
// clock change so the conversion is tested across a DST boundary.
process.env.TZ = "Europe/London";

import { describe, expect, it } from "vitest";
import type { Rec } from "@/domain/types";
import { findClashes, instant, localDate, localParts, upcomingByDay } from "@/applications/comms/schedule";
import { settleSeeds } from "@/applications/admin/settle";
import { csvCell } from "@/applications/hr/decisions";

function meeting(id: string, start: string, minutes: number, attendees: string, status = "scheduled"): Rec {
  return {
    id, organizationId: "org", collection: "meetings", title: id, status, summary: "", fields: { attendees },
    createdAt: start, updatedAt: start, createdBy: "x", updatedBy: "x", ownerName: "x", revision: 1, tags: [], currency: "GBP", history: [],
    startAt: start, endAt: new Date(Date.parse(start) + minutes * 60_000).toISOString(),
  } as Rec;
}

describe("clashes with Everyone", () => {
  const meetings = [
    meeting("named", "2026-11-18T11:00:00.000Z", 60, "Maya Chen,Theo Marsh"),
    meeting("all", "2026-11-18T14:00:00.000Z", 60, "Everyone"),
    meeting("done", "2026-11-18T11:00:00.000Z", 60, "Priya Shah", "finished"),
  ];
  const slot = (start: string, attendees: string[]) => ({ startAt: start, endAt: new Date(Date.parse(start) + 30 * 60_000).toISOString(), attendees });

  it("a meeting for Everyone clashes with any overlapping meeting and names its attendees", () => {
    expect(findClashes(meetings, slot("2026-11-18T11:15:00.000Z", ["Everyone"])).map((clash) => [clash.meeting.id, clash.who]))
      .toEqual([["named", ["Maya Chen", "Theo Marsh"]]]);
  });

  it("Everyone against Everyone reports Everyone", () => {
    expect(findClashes(meetings, slot("2026-11-18T14:15:00.000Z", ["Everyone"])).map((clash) => [clash.meeting.id, clash.who]))
      .toEqual([["all", ["Everyone"]]]);
  });

  it("a named slot against an Everyone meeting names the slot's people; no overlap, no clash", () => {
    expect(findClashes(meetings, slot("2026-11-18T14:15:00.000Z", ["Iris Lindqvist"]))[0].who).toEqual(["Iris Lindqvist"]);
    expect(findClashes(meetings, slot("2026-11-18T16:00:00.000Z", ["Everyone"]))).toEqual([]);
  });
});

describe("local time in the event form", () => {
  it("converts local wall-clock time to UTC either side of the October clock change", () => {
    // British Summer Time ends at 02:00 on Sunday 25 October 2026.
    expect(instant("2026-10-24", "10:00")).toBe("2026-10-24T09:00:00.000Z");
    expect(instant("2026-10-26", "10:00")).toBe("2026-10-26T10:00:00.000Z");
    expect(localParts("2026-10-24T09:00:00.000Z")).toEqual({ date: "2026-10-24", time: "10:00" });
    expect(localParts("2026-10-26T10:00:00.000Z")).toEqual({ date: "2026-10-26", time: "10:00" });
  });

  it("round-trips across the March change and resolves a skipped time forward", () => {
    expect(instant("2026-03-28", "09:30")).toBe("2026-03-28T09:30:00.000Z");
    expect(instant("2026-03-30", "09:30")).toBe("2026-03-30T08:30:00.000Z");
    const skipped = instant("2026-03-29", "01:30");
    expect(skipped).toBe("2026-03-29T01:30:00.000Z");
    expect(localParts(skipped).time).toBe("02:30");
  });

  it("rejects malformed or impossible dates and uses the local calendar day", () => {
    expect(instant("2026-02-30", "10:00")).toBe("");
    expect(instant("2026-11-18", "bad")).toBe("");
    expect(instant("", "10:00")).toBe("");
    expect(localDate(new Date("2026-07-01T23:30:00.000Z"))).toBe("2026-07-02");
    expect(localParts(undefined)).toEqual({ date: "", time: "" });
  });

  it("groups the agenda by local day", () => {
    const late = meeting("late", "2026-07-01T23:30:00.000Z", 30, "Maya Chen");
    expect(upcomingByDay([late], new Date("2026-07-01T08:00:00.000Z"), 7).map((day) => day.day)).toEqual(["2026-07-02"]);
  });
});

describe("privacy register settles only on a complete load", () => {
  it("is settled when the load resolves and failed when it rejects", async () => {
    await expect(settleSeeds(() => Promise.resolve())).resolves.toBe("settled");
    await expect(settleSeeds(() => Promise.reject(new Error("chunk failed")))).resolves.toBe("failed");
  });
});

describe("CSV exports from People", () => {
  it("guards formula-leading text and leaves numbers alone", () => {
    expect(csvCell("=1+1")).toBe(`"'=1+1"`);
    expect(csvCell("@cmd")).toBe(`"'@cmd"`);
    expect(csvCell(-12.5)).toBe(`"-12.5"`);
    expect(csvCell('Say "hi"')).toBe(`"Say ""hi"""`);
  });
});
