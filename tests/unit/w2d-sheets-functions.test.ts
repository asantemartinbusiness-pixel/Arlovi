import { describe, expect, it } from "vitest";
import { evaluateWorkbook, FUNCTION_HELP, FUNCTIONS } from "@/applications/sheets/engine";

/* W2D — the wider function library in the Sheets engine. */

const NOW = new Date("2026-11-18T09:30:00.000Z");

const DEALS: Record<string, string> = {
  A1: "Deal", B1: "Stage", C1: "Region", D1: "Net",
  A2: "Clerkenwell", B2: "won", C2: "London", D2: "10800",
  A3: "Harrow", B3: "won", C3: "North", D3: "1800",
  A4: "Berg", B4: "open", C4: "London", D4: "900",
  A5: "Lyle", B5: "open", C5: "London", D5: "5040",
  A6: "Pike", B6: "lost", C6: "North", D6: "3600",
};

function run(cells: Record<string, string>) {
  return evaluateWorkbook({ sheets: [{ id: "s1", name: "Sheet1", cells: { ...DEALS, ...cells } }], now: NOW }).values.Sheet1;
}

function value(formula: string) {
  return run({ Z1: formula }).Z1;
}

describe("conditional aggregates", () => {
  it("SUMIFS and COUNTIFS apply every criterion", () => {
    expect(value('=SUMIFS(D2:D6, B2:B6, "won", C2:C6, "London")').value).toBe(10800);
    expect(value('=SUMIFS(D2:D6, D2:D6, ">1000")').value).toBe(21240);
    expect(value('=COUNTIFS(B2:B6, "open", C2:C6, "London")').value).toBe(2);
    expect(value('=COUNTIFS(C2:C6, "North")').value).toBe(2);
  });

  it("AVERAGEIF(S), MAXIFS and MINIFS", () => {
    expect(value('=AVERAGEIF(B2:B6, "won", D2:D6)').value).toBe(6300);
    expect(value('=AVERAGEIFS(D2:D6, C2:C6, "London")').value).toBe(5580);
    expect(value('=MAXIFS(D2:D6, C2:C6, "London")').value).toBe(10800);
    expect(value('=MINIFS(D2:D6, C2:C6, "London")').value).toBe(900);
  });

  it("reports #DIV/0! when nothing matches an average and #VALUE! for mismatched ranges", () => {
    expect(value('=AVERAGEIF(B2:B6, "paused", D2:D6)').error).toBe("#DIV/0!");
    expect(value('=SUMIFS(D2:D6, B2:B5, "won")').error).toBe("#VALUE!");
  });
});

describe("lookups", () => {
  it("MATCH exact, approximate and descending", () => {
    expect(value('=MATCH("Berg", A2:A6, 0)').value).toBe(3);
    expect(run({ F1: "10", F2: "20", F3: "30", Z1: "=MATCH(25, F1:F3)" }).Z1.value).toBe(2);
    expect(run({ F1: "30", F2: "20", F3: "10", Z1: "=MATCH(15, F1:F3, -1)" }).Z1.value).toBe(2);
    expect(value('=MATCH("Nobody", A2:A6, 0)').error).toBe("#N/A");
  });

  it("INDEX with MATCH, and #REF! outside the range", () => {
    expect(value('=INDEX(D2:D6, MATCH("Lyle", A2:A6, 0))').value).toBe(5040);
    expect(value("=INDEX(A1:D6, 3, 2)").value).toBe("won");
    expect(value("=INDEX(A1:D1, 4)").value).toBe("Net");
    expect(value("=INDEX(A1:D6, 9, 1)").error).toBe("#REF!");
  });

  it("XLOOKUP with and without a fallback", () => {
    expect(value('=XLOOKUP("Pike", A2:A6, D2:D6)').value).toBe(3600);
    expect(value('=XLOOKUP("Nobody", A2:A6, D2:D6, "none")').value).toBe("none");
    expect(value('=XLOOKUP("Nobody", A2:A6, D2:D6)').error).toBe("#N/A");
  });

  it("HLOOKUP reads across the first row", () => {
    expect(value('=HLOOKUP("Net", A1:D6, 3, FALSE)').value).toBe(1800);
    expect(value('=HLOOKUP("Net", A1:D6, 9, FALSE)').error).toBe("#REF!");
  });
});

describe("maths, text and information", () => {
  it("rounds up and down away from and towards zero", () => {
    expect(value("=ROUNDUP(2.341, 2)").value).toBe(2.35);
    expect(value("=ROUNDDOWN(-2.349, 2)").value).toBe(-2.34);
    expect(value("=ROUNDUP(1.1, 0)").value).toBe(2);
    expect(value("=INT(-2.5)").value).toBe(-3);
  });

  it("MOD keeps the divisor's sign and refuses zero", () => {
    expect(value("=MOD(-7, 3)").value).toBe(2);
    expect(value("=MOD(7, 0)").error).toBe("#DIV/0!");
    expect(value("=SQRT(-1)").error).toBe("#VALUE!");
    expect(value("=POWER(2, 10)").value).toBe(1024);
  });

  it("PRODUCT, MEDIAN and COUNTBLANK", () => {
    expect(value("=PRODUCT(2, 3, 4)").value).toBe(24);
    expect(value("=MEDIAN(D2:D6)").value).toBe(3600);
    expect(value("=MEDIAN(1, 2, 3, 4)").value).toBe(2.5);
    expect(value("=COUNTBLANK(A1:A8)").value).toBe(2);
  });

  it("IFS picks the first true branch", () => {
    expect(value('=IFS(D2>20000, "huge", D2>10000, "large", TRUE, "small")').value).toBe("large");
    expect(value("=IFS(FALSE, 1)").error).toBe("#N/A");
  });

  it("MID and SUBSTITUTE", () => {
    expect(value('=MID("Clerkenwell", 6, 4)').value).toBe("enwe");
    expect(value('=SUBSTITUTE("a-b-c", "-", "/")').value).toBe("a/b/c");
    expect(value('=SUBSTITUTE("a-b-c", "-", "/", 2)').value).toBe("a-b/c");
  });

  it("IS functions, including errors and cycles", () => {
    expect(value("=ISBLANK(A9)").value).toBe(true);
    expect(value("=ISNUMBER(D2)").value).toBe(true);
    expect(value("=ISTEXT(A2)").value).toBe(true);
    expect(value("=ISERROR(1/0)").value).toBe(true);
    expect(value("=ISERROR(D2)").value).toBe(false);
    // A cycle is marked on everything it feeds, so it cannot be hidden behind ISERROR.
    expect(run({ Y1: "=Y2", Y2: "=Y1", Z1: "=ISERROR(Y1)" }).Z1.error).toBe("#CYCLE!");
  });

  it("errors in a precedent propagate through new functions", () => {
    expect(run({ Y1: "=1/0", Z1: "=SUMIFS(D2:D6, B2:B6, Y1)" }).Z1.error).toBe("#DIV/0!");
  });
});

describe("function help", () => {
  it("documents every implemented function, and only those", () => {
    const documented = FUNCTION_HELP.map((item) => item.name).sort();
    const implemented = Object.keys(FUNCTIONS).filter((name) => name !== "CONCATENATE").sort();
    expect(documented).toEqual(implemented);
  });
});
