import { describe, expect, it } from "vitest";
import {
  cellAddress, columnIndex, columnName, evaluateWorkbook, expandRange, matchesCriterion,
  parseCsv, parseFormula, precedents, serialFromParts, serialToDate, toCsv,
} from "@/applications/sheets/engine";
import {
  chartData, displayValue, evaluate, fillRange, hiddenRows, planImport, readWorkbook,
  shiftFormula, sortRange,
} from "@/applications/sheets/model";

const NOW = new Date("2026-11-14T09:30:00.000Z");

function workbook(cells: Record<string, string>, name = "Sheet1") {
  return { sheets: [{ id: "s1", name, cells }], now: NOW };
}

function value(cells: Record<string, string>, address: string) {
  const result = evaluateWorkbook(workbook(cells));
  return result.values.Sheet1[address];
}

describe("addresses", () => {
  it("round-trips column names past Z", () => {
    expect(columnName(0)).toBe("A");
    expect(columnName(25)).toBe("Z");
    expect(columnName(26)).toBe("AA");
    expect(columnName(63)).toBe("BL");
    expect(columnIndex("BL")).toBe(63);
    expect(cellAddress(63, 999)).toBe("BL1000");
  });

  it("expands a rectangular range row-major", () => {
    expect(expandRange("A1:B2")).toEqual(["A1", "B1", "A2", "B2"]);
    expect(expandRange("C3")).toEqual(["C3"]);
  });
});

describe("arithmetic and precedence", () => {
  it("honours operator precedence and parentheses", () => {
    expect(value({ A1: "=2+3*4" }, "A1").value).toBe(14);
    expect(value({ A1: "=(2+3)*4" }, "A1").value).toBe(20);
    expect(value({ A1: "=2^3^2" }, "A1").value).toBe(512);
    expect(value({ A1: "=-3+1" }, "A1").value).toBe(-2);
    expect(value({ A1: "=50%" }, "A1").value).toBe(0.5);
  });

  it("reports division by zero rather than Infinity", () => {
    expect(value({ A1: "=1/0" }, "A1").error).toBe("#DIV/0!");
  });

  it("concatenates and compares", () => {
    expect(value({ A1: "Arc", B1: " Lamp", C1: "=A1&B1" }, "C1").value).toBe("Arc Lamp");
    expect(value({ A1: "5", B1: "=A1>3" }, "B1").value).toBe(true);
    expect(value({ A1: "=\"a\"=\"A\"" }, "A1").value).toBe(true);
  });

  it("names an unknown function instead of guessing", () => {
    expect(value({ A1: "=GROWTH(1,2,3)" }, "A1").error).toBe("#NAME?");
  });

  it("reports an unparseable formula", () => {
    expect(value({ A1: "=SUM(" }, "A1").error).toBe("#PARSE!");
  });
});

describe("the function set", () => {
  const data = {
    A1: "Deal", B1: "Net", C1: "Stage",
    A2: "Harrow", B2: "1800", C2: "won",
    A3: "Clerkenwell", B3: "2400", C3: "open",
    A4: "Berg", B4: "900", C4: "won",
    A5: "Lyle", B5: "", C5: "open",
  };

  it("aggregates", () => {
    expect(value({ ...data, D1: "=SUM(B2:B5)" }, "D1").value).toBe(5100);
    expect(value({ ...data, D1: "=AVERAGE(B2:B5)" }, "D1").value).toBe(1700);
    expect(value({ ...data, D1: "=MIN(B2:B4)" }, "D1").value).toBe(900);
    expect(value({ ...data, D1: "=MAX(B2:B4)" }, "D1").value).toBe(2400);
    expect(value({ ...data, D1: "=COUNT(B1:B5)" }, "D1").value).toBe(3);
    expect(value({ ...data, D1: "=COUNTA(B1:B5)" }, "D1").value).toBe(4);
  });

  it("evaluates logic and rounding", () => {
    expect(value({ A1: "=IF(2>1,\"yes\",\"no\")" }, "A1").value).toBe("yes");
    expect(value({ A1: "=AND(TRUE,1>0)" }, "A1").value).toBe(true);
    expect(value({ A1: "=OR(FALSE,1>2)" }, "A1").value).toBe(false);
    expect(value({ A1: "=NOT(TRUE)" }, "A1").value).toBe(false);
    expect(value({ A1: "=ROUND(2.345,2)" }, "A1").value).toBe(2.35);
    expect(value({ A1: "=ROUND(-2.5,0)" }, "A1").value).toBe(-3);
    expect(value({ A1: "=ABS(-7.5)" }, "A1").value).toBe(7.5);
  });

  it("handles text functions", () => {
    expect(value({ A1: "=CONCAT(\"Arc\",\" \",\"Lamp\")" }, "A1").value).toBe("Arc Lamp");
    expect(value({ A1: "=LEFT(\"Clerkenwell\",5)" }, "A1").value).toBe("Clerk");
    expect(value({ A1: "=RIGHT(\"Clerkenwell\",4)" }, "A1").value).toBe("well");
    expect(value({ A1: "=LEN(\"Arc Lamp\")" }, "A1").value).toBe(8);
  });

  it("looks a key up with VLOOKUP, exact and approximate", () => {
    expect(value({ ...data, D1: "=VLOOKUP(\"Berg\",A2:C4,2,FALSE)" }, "D1").value).toBe(900);
    expect(value({ ...data, D1: "=VLOOKUP(\"Berg\",A2:C4,3,FALSE)" }, "D1").value).toBe("won");
    expect(value({ ...data, D1: "=VLOOKUP(\"Nothing\",A2:C4,2,FALSE)" }, "D1").error).toBe("#N/A");
    const bands = { A1: "0", B1: "small", A2: "1000", B2: "mid", A3: "2000", B3: "large", C1: "=VLOOKUP(1500,A1:B3,2,TRUE)" };
    expect(value(bands, "C1").value).toBe("mid");
    expect(value({ ...data, D1: "=VLOOKUP(\"Berg\",A2:C4,9,FALSE)" }, "D1").error).toBe("#REF!");
  });

  it("totals and counts conditionally", () => {
    expect(value({ ...data, D1: "=SUMIF(C2:C5,\"won\",B2:B5)" }, "D1").value).toBe(2700);
    expect(value({ ...data, D1: "=SUMIF(B2:B5,\">1000\")" }, "D1").value).toBe(4200);
    expect(value({ ...data, D1: "=COUNTIF(C2:C5,\"open\")" }, "D1").value).toBe(2);
    expect(value({ ...data, D1: "=COUNTIF(B2:B5,\">=1800\")" }, "D1").value).toBe(2);
    expect(value({ ...data, D1: "=COUNTIF(A2:A5,\"Cler*\")" }, "D1").value).toBe(1);
  });

  it("reads criteria in the documented forms", () => {
    expect(matchesCriterion(1800, ">1000")).toBe(true);
    expect(matchesCriterion("won", "won")).toBe(true);
    expect(matchesCriterion("won", "<>won")).toBe(false);
    expect(matchesCriterion("Harrow", "Har*")).toBe(true);
  });

  it("builds dates from the workspace clock, never a hardcoded one", () => {
    const today = value({ A1: "=TODAY()" }, "A1").value as number;
    expect(serialToDate(today).toISOString().slice(0, 10)).toBe("2026-11-14");
    expect(value({ A1: "=DATE(2026,11,14)" }, "A1").value).toBe(serialFromParts(2026, 11, 14));
    expect(value({ A1: "=YEAR(DATE(2026,11,14))" }, "A1").value).toBe(2026);
    expect(value({ A1: "=DATE(2026,12,1)-DATE(2026,11,14)" }, "A1").value).toBe(17);
  });
});

describe("dependency graph", () => {
  it("lists the cells a formula reads", () => {
    const node = parseFormula("=SUM(A1:A3)+B1");
    expect(precedents(node, "Sheet1", () => undefined)).toEqual(["Sheet1!A1", "Sheet1!A2", "Sheet1!A3", "Sheet1!B1"]);
  });

  it("recalculates in topological order, never reading a stale precedent", () => {
    const result = evaluateWorkbook(workbook({
      A1: "10",
      B1: "=A1*2",
      C1: "=B1+D1",
      D1: "=A1+1",
      E1: "=C1*10",
    }));
    const order = result.order;
    expect(order.indexOf("Sheet1!B1")).toBeLessThan(order.indexOf("Sheet1!C1"));
    expect(order.indexOf("Sheet1!D1")).toBeLessThan(order.indexOf("Sheet1!C1"));
    expect(order.indexOf("Sheet1!C1")).toBeLessThan(order.indexOf("Sheet1!E1"));
    expect(result.values.Sheet1.C1.value).toBe(31);
    expect(result.values.Sheet1.E1.value).toBe(310);
  });

  it("recomputes a long chain when the root changes", () => {
    const cells = { A1: "1", B1: "=A1+1", C1: "=B1+1", D1: "=C1+1", E1: "=D1+1" };
    expect(evaluateWorkbook(workbook(cells)).values.Sheet1.E1.value).toBe(5);
    expect(evaluateWorkbook(workbook({ ...cells, A1: "10" })).values.Sheet1.E1.value).toBe(14);
  });

  it("flags a direct cycle", () => {
    const result = evaluateWorkbook(workbook({ A1: "=B1", B1: "=A1" }));
    expect(result.cycles).toEqual(["Sheet1!A1", "Sheet1!B1"]);
    expect(result.values.Sheet1.A1.error).toBe("#CYCLE!");
    expect(result.values.Sheet1.B1.error).toBe("#CYCLE!");
  });

  it("flags a self reference", () => {
    const result = evaluateWorkbook(workbook({ A1: "=A1+1" }));
    expect(result.values.Sheet1.A1.error).toBe("#CYCLE!");
  });

  it("flags a three-cell cycle and everything that reads it", () => {
    const result = evaluateWorkbook(workbook({ A1: "=C1", B1: "=A1", C1: "=B1", D1: "=A1+1", E1: "=5" }));
    expect(result.cycles).toEqual(["Sheet1!A1", "Sheet1!B1", "Sheet1!C1", "Sheet1!D1"]);
    expect(result.values.Sheet1.D1.error).toBe("#CYCLE!");
    expect(result.values.Sheet1.E1.value).toBe(5);
  });

  it("does not mistake a diamond for a cycle", () => {
    const result = evaluateWorkbook(workbook({ A1: "2", B1: "=A1*2", C1: "=A1*3", D1: "=B1+C1" }));
    expect(result.cycles).toEqual([]);
    expect(result.values.Sheet1.D1.value).toBe(10);
  });

  it("reads across sheets and rejects a missing one", () => {
    const result = evaluateWorkbook({
      sheets: [
        { id: "s1", name: "Pipeline", cells: { B2: "1800", B3: "2400" } },
        { id: "s2", name: "Summary", cells: { A1: "=SUM(Pipeline!B2:B3)", A2: "=Missing!A1" } },
      ],
      now: NOW,
    });
    expect(result.values.Summary.A1.value).toBe(4200);
    expect(result.values.Summary.A2.error).toBe("#REF!");
  });

  it("resolves a named range", () => {
    const result = evaluateWorkbook({
      sheets: [{ id: "s1", name: "Sheet1", cells: { B2: "100", B3: "200", D1: "=SUM(Net)" } }],
      namedRanges: [{ name: "Net", sheetName: "Sheet1", ref: "B2:B3" }],
      now: NOW,
    });
    expect(result.values.Sheet1.D1.value).toBe(300);
  });

  it("propagates an error from a precedent", () => {
    const result = evaluateWorkbook(workbook({ A1: "=1/0", B1: "=A1+1" }));
    expect(result.values.Sheet1.B1.error).toBe("#DIV/0!");
  });
});

describe("workbook model", () => {
  it("migrates a legacy body without losing a formula", () => {
    const book = readWorkbook({ sheets: [{ name: "Pipeline", rows: 12, cols: 6, cells: { A1: "Deal", B5: "=SUM(B2:B4)" } }] });
    expect(book.sheets).toHaveLength(1);
    expect(book.sheets[0].cells.B5).toBe("=SUM(B2:B4)");
    expect(book.sheets[0].cols).toBeGreaterThanOrEqual(64);
    expect(book.sheets[0].rows).toBeGreaterThanOrEqual(1000);
    expect(book.activeSheetId).toBe(book.sheets[0].id);
  });

  it("shifts relative references when filling, and keeps absolute ones", () => {
    expect(shiftFormula("=A1+B$2", 1, 1)).toBe("=B2+C$2");
    expect(shiftFormula("=$A$1*2", 3, 3)).toBe("=$A$1*2");
    expect(shiftFormula("plain text", 1, 1)).toBe("plain text");
  });

  it("fills a formula down a range", () => {
    const sheet = readWorkbook({ sheets: [{ name: "S", cells: { A1: "1", A2: "2", A3: "3", B1: "=A1*2" } }] }).sheets[0];
    const filled = fillRange(sheet, { fromCol: 1, fromRow: 0, toCol: 1, toRow: 2 }, "down");
    expect(filled.cells.B2).toBe("=A2*2");
    expect(filled.cells.B3).toBe("=A3*2");
  });

  it("sorts a range and carries the formulas with their rows", () => {
    const book = readWorkbook({ sheets: [{ name: "S", cells: {
      A1: "Deal", B1: "Net",
      A2: "Berg", B2: "900",
      A3: "Harrow", B3: "1800",
      A4: "Clerkenwell", B4: "2400",
      C2: "=B2*2", C3: "=B3*2", C4: "=B4*2",
    } }] });
    const values = evaluate(book, NOW).values.S;
    const sorted = sortRange(book.sheets[0], { fromCol: 0, fromRow: 0, toCol: 2, toRow: 3 }, 1, "desc", true, values);
    expect(sorted.cells.A2).toBe("Clerkenwell");
    expect(sorted.cells.B2).toBe("2400");
    expect(sorted.cells.C2).toBe("=B2*2");
    const after = evaluate({ ...book, sheets: [sorted] }, NOW).values.S;
    expect(after.C2.value).toBe(4800);
  });

  it("hides rows a filter excludes", () => {
    const book = readWorkbook({ sheets: [{ name: "S", cells: {
      A1: "Stage", A2: "won", A3: "open", A4: "won",
    }, filters: [{ headerRow: 0, column: 0, keep: ["won"] }] }] });
    const values = evaluate(book, NOW).values.S;
    const hidden = hiddenRows(book.sheets[0], values, { currency: "GBP", locale: "en-GB" });
    expect([...hidden]).toEqual([2]);
  });

  it("formats numbers, currency, percent and dates", () => {
    const context = { currency: "GBP", locale: "en-GB" };
    expect(displayValue({ value: 1800 }, { format: "currency" }, context)).toBe("£1,800.00");
    expect(displayValue({ value: 0.125 }, { format: "percent", decimals: 1 }, context)).toBe("12.5%");
    expect(displayValue({ value: 1234.5 }, { format: "number", decimals: 2 }, context)).toBe("1,234.50");
    expect(displayValue({ value: serialFromParts(2026, 11, 14) }, { format: "date" }, context)).toBe("14 Nov 2026");
    expect(displayValue({ value: null, error: "#CYCLE!" }, undefined, context)).toBe("#CYCLE!");
    expect(displayValue({ value: 1800 }, { format: "text" }, context)).toBe("1800");
  });

  it("builds chart series from a range and reports what it skipped", () => {
    const book = readWorkbook({ sheets: [{ name: "S", cells: {
      A1: "Month", B1: "Net",
      A2: "Oct", B2: "1800",
      A3: "Nov", B3: "2400",
      A4: "Dec", B4: "n/a",
    } }] });
    const values = evaluate(book, NOW).values.S;
    const data = chartData(book.sheets[0], "A1:B4", true, values)!;
    expect(data.series[0].name).toBe("Net");
    expect(data.series[0].points.map((point) => point.value)).toEqual([1800, 2400]);
    expect(data.skipped).toEqual(["B4"]);
  });

  it("plans an import without coercing silently", () => {
    const plans = planImport([
      ["Deal", "Net", "Signed", "Rate"],
      ["Harrow", "£1,800", "2026-11-14", "12%"],
      ["Berg", "900", "2026-11-20", "8%"],
    ], true);
    expect(plans[1].detected).toBe("mixed");
    expect(plans[1].warning).toContain("text");
    expect(plans[2].detected).toBe("date");
    expect(plans[2].warning).toContain("date");
    expect(plans[3].detected).toBe("percent");
  });
});

describe("csv", () => {
  it("round-trips quoted fields", () => {
    const rows = [["Deal", "Note"], ["Harrow", 'Said "yes", eventually'], ["Berg", "Two\nlines"]];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });

  it("reads a trailing newline without inventing a row", () => {
    expect(parseCsv("a,b\n1,2\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
});
