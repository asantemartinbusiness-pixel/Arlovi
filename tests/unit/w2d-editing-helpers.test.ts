import { describe, expect, it } from "vitest";
import {
  applySuggestion, edgeJump, emptySheet, formulaWantsReference, functionSuggestions, typedFunctionPrefix,
} from "@/applications/sheets/model";
import { audienceUrl, channelName, isAudienceWindow, keyToNav, navDelta } from "@/applications/present/audienceLink";

/* W2D — pure helpers behind the Sheets cell editor and two-window presenting. */

const NAMES = ["SUM", "SUMIF", "SUMIFS", "SUBSTITUTE", "MEDIAN", "MID", "MIN", "MINIFS"];

describe("sheets cell editor", () => {
  it("reads the function name being typed, never a cell reference", () => {
    expect(typedFunctionPrefix("=SU")).toBe("SU");
    expect(typedFunctionPrefix("=A1+su")).toBe("SU");
    expect(typedFunctionPrefix("=IF(mi")).toBe("MI");
    expect(typedFunctionPrefix("=A1")).toBeNull();
    expect(typedFunctionPrefix("=SUM(AB12")).toBeNull();
    expect(typedFunctionPrefix("SU")).toBeNull();
  });

  it("suggests matching functions, shortest first, and applies one with a parenthesis", () => {
    expect(functionSuggestions("=SUM", NAMES)).toEqual(["SUMIF", "SUMIFS"]);
    expect(functionSuggestions("=M", NAMES)).toEqual(["MID", "MIN", "MEDIAN", "MINIFS"]);
    expect(functionSuggestions("=B2*2", NAMES)).toEqual([]);
    expect(applySuggestion("=ROUND(su", "SUMIFS")).toBe("=ROUND(SUMIFS(");
  });

  it("knows when a formula is waiting for a reference to be pointed at", () => {
    expect(formulaWantsReference("=")).toBe(true);
    expect(formulaWantsReference("=SUM(")).toBe(true);
    expect(formulaWantsReference("=A1+")).toBe(true);
    expect(formulaWantsReference("=SUM(A1, ")).toBe(true);
    expect(formulaWantsReference("=A1")).toBe(false);
    expect(formulaWantsReference("plain")).toBe(false);
  });

  it("jumps to the edge of a data block with Ctrl+arrow", () => {
    const sheet = { ...emptySheet("S", 20, 5), cells: { A1: "h", A2: "1", A3: "2", A7: "x", A8: "y" } };
    expect(edgeJump(sheet, 0, 0, 0, 1)).toEqual({ col: 0, row: 2 });
    expect(edgeJump(sheet, 0, 2, 0, 1)).toEqual({ col: 0, row: 6 });
    expect(edgeJump(sheet, 0, 6, 0, 1)).toEqual({ col: 0, row: 7 });
    expect(edgeJump(sheet, 0, 7, 0, 1)).toEqual({ col: 0, row: 19 });
    expect(edgeJump(sheet, 0, 0, 0, -1)).toEqual({ col: 0, row: 0 });
    expect(edgeJump(sheet, 0, 0, 1, 0)).toEqual({ col: 4, row: 0 });
  });
});

describe("two-window presenting", () => {
  it("names the channel and the audience URL after the deck", () => {
    expect(channelName("nl-decks-320")).toBe("arlovi-present:nl-decks-320");
    expect(audienceUrl("northline", "d 1")).toBe("/o/northline/present/decks/d%201/present?tab=Audience&display=window");
    expect(isAudienceWindow("?tab=Audience&display=window")).toBe(true);
    expect(isAudienceWindow("?tab=Audience")).toBe(false);
  });

  it("maps keys to navigation and navigation to a bounded move", () => {
    expect(keyToNav("ArrowRight")).toEqual({ type: "nav", action: "next" });
    expect(keyToNav("PageUp")).toEqual({ type: "nav", action: "back" });
    expect(keyToNav("b")).toEqual({ type: "nav", action: "blank" });
    expect(keyToNav("x")).toBeNull();
    expect(navDelta({ type: "nav", action: "first" }, 3, 8)).toBe(-3);
    expect(navDelta({ type: "nav", action: "last" }, 3, 8)).toBe(4);
    expect(navDelta({ type: "nav", action: "goto", to: 99 }, 3, 8)).toBe(4);
    expect(navDelta({ type: "nav", action: "goto", to: 1 }, 3, 8)).toBe(-3);
  });
});
