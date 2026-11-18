import { registerSeed } from "@/domain/seedRegistry";
import type { Workbook } from "@/applications/sheets/model";

/* Fixtures for Spreadsheets. A real small-company model: a trade pipeline
 * with a lookup table, a margin model that chains formulas, and a cash view
 * that reads another sheet. Ids start at n: 20. */

function sheet(id: string, name: string, cells: Record<string, string>, extra: Partial<Workbook["sheets"][number]> = {}): Workbook["sheets"][number] {
  return {
    id, name, rows: 1000, cols: 64, cells,
    styles: {}, colWidths: {}, freeze: { rows: 0, cols: 0 }, filters: [],
    ...extra,
  };
}

registerSeed("sheets", (context) => {
  const pipeline = sheet("sh-pipeline", "Pipeline", {
    A1: "Deal", B1: "Stage", C1: "Units", D1: "Unit net", E1: "Net", F1: "Band", G1: "Discount", H1: "Invoiced",
    A2: "Clerkenwell showroom", B2: "won", C2: "12", D2: "900", E2: "=C2*D2", F2: "=VLOOKUP(E2,Bands!A2:B5,2,TRUE)", G2: "=VLOOKUP(E2,Bands!A2:C5,3,TRUE)", H2: "=E2*(1-G2)",
    A3: "Harrow practice", B3: "won", C3: "2", D3: "900", E3: "=C3*D3", F3: "=VLOOKUP(E3,Bands!A2:B5,2,TRUE)", G3: "=VLOOKUP(E3,Bands!A2:C5,3,TRUE)", H3: "=E3*(1-G3)",
    A4: "Berg studio", B4: "open", C4: "1", D4: "900", E4: "=C4*D4", F4: "=VLOOKUP(E4,Bands!A2:B5,2,TRUE)", G4: "=VLOOKUP(E4,Bands!A2:C5,3,TRUE)", H4: "=E4*(1-G4)",
    A5: "Lyle & Fisk", B5: "open", C5: "6", D5: "840", E5: "=C5*D5", F5: "=VLOOKUP(E5,Bands!A2:B5,2,TRUE)", G5: "=VLOOKUP(E5,Bands!A2:C5,3,TRUE)", H5: "=E5*(1-G5)",
    A6: "Pike Row", B6: "lost", C6: "4", D6: "900", E6: "=C6*D6", F6: "=VLOOKUP(E6,Bands!A2:B5,2,TRUE)", G6: "=VLOOKUP(E6,Bands!A2:C5,3,TRUE)", H6: "=E6*(1-G6)",
    A8: "Total net", E8: "=SUM(E2:E6)", H8: "=SUM(H2:H6)",
    A9: "Won only", E9: "=SUMIF(B2:B6,\"won\",E2:E6)",
    A10: "Open only", E10: "=SUMIF(B2:B6,\"open\",E2:E6)",
    A11: "Deals won", E11: "=COUNTIF(B2:B6,\"won\")",
    A12: "Average deal", E12: "=ROUND(AVERAGE(E2:E6),2)",
    A13: "Largest", E13: "=MAX(E2:E6)",
    A14: "Smallest", E14: "=MIN(E2:E6)",
    A16: "Quoted on", B16: "=TODAY()",
  }, {
    freeze: { rows: 1, cols: 1 },
    styles: {
      A1: { bold: true, fill: "var(--bg-sunken)" }, B1: { bold: true, fill: "var(--bg-sunken)" }, C1: { bold: true, fill: "var(--bg-sunken)" },
      D1: { bold: true, fill: "var(--bg-sunken)" }, E1: { bold: true, fill: "var(--bg-sunken)" }, F1: { bold: true, fill: "var(--bg-sunken)" },
      G1: { bold: true, fill: "var(--bg-sunken)" }, H1: { bold: true, fill: "var(--bg-sunken)" },
      D2: { format: "currency" }, D3: { format: "currency" }, D4: { format: "currency" }, D5: { format: "currency" }, D6: { format: "currency" },
      E2: { format: "currency" }, E3: { format: "currency" }, E4: { format: "currency" }, E5: { format: "currency" }, E6: { format: "currency" },
      H2: { format: "currency" }, H3: { format: "currency" }, H4: { format: "currency" }, H5: { format: "currency" }, H6: { format: "currency" },
      G2: { format: "percent", decimals: 1 }, G3: { format: "percent", decimals: 1 }, G4: { format: "percent", decimals: 1 }, G5: { format: "percent", decimals: 1 }, G6: { format: "percent", decimals: 1 },
      A8: { bold: true }, E8: { format: "currency", bold: true, border: ["top"] }, H8: { format: "currency", bold: true, border: ["top"] },
      E9: { format: "currency" }, E10: { format: "currency" }, E12: { format: "currency" }, E13: { format: "currency" }, E14: { format: "currency" },
      B16: { format: "date" },
    },
  });

  const bands = sheet("sh-bands", "Bands", {
    A1: "From net", B1: "Band", C1: "Discount",
    A2: "0", B2: "Standard", C2: "0",
    A3: "2000", B3: "Trade", C3: "0.05",
    A4: "5000", B4: "Trade plus", C4: "0.1",
    A5: "9000", B5: "Project", C5: "0.12",
  }, {
    styles: {
      A1: { bold: true, fill: "var(--bg-sunken)" }, B1: { bold: true, fill: "var(--bg-sunken)" }, C1: { bold: true, fill: "var(--bg-sunken)" },
      A2: { format: "currency" }, A3: { format: "currency" }, A4: { format: "currency" }, A5: { format: "currency" },
      C2: { format: "percent", decimals: 0 }, C3: { format: "percent", decimals: 0 }, C4: { format: "percent", decimals: 0 }, C5: { format: "percent", decimals: 0 },
    },
  });

  const margin = sheet("sh-margin", "Margin", {
    A1: "Line", B1: "Brass", C1: "Shade", D1: "Labour hours", E1: "Labour", F1: "Cost", G1: "Price", H1: "Margin", I1: "Margin %",
    A2: "Arc Lamp brushed brass", B2: "128", C2: "46", D2: "3.5", E2: "=D2*34", F2: "=B2+C2+E2", G2: "900", H2: "=G2-F2", I2: "=ROUND(H2/G2,4)",
    A3: "Arc Lamp blackened", B3: "142", C3: "46", D3: "4", E3: "=D3*34", F3: "=B3+C3+E3", G3: "940", H3: "=G3-F3", I3: "=ROUND(H3/G3,4)",
    A4: "Arc Pendant", B4: "96", C4: "38", D4: "2.5", E4: "=D4*34", F4: "=B4+C4+E4", G4: "690", H4: "=G4-F4", I4: "=ROUND(H4/G4,4)",
    A5: "Wall sconce", B5: "72", C5: "0", D5: "1.75", E5: "=D5*34", F5: "=B5+C5+E5", G5: "420", H5: "=G5-F5", I5: "=ROUND(H5/G5,4)",
    A7: "Weighted margin", I7: "=ROUND(SUM(H2:H5)/SUM(G2:G5),4)",
    A8: "Lowest margin line", A9: "=IF(I5<I4,A5,A4)",
    A11: "Labour rate", B11: "34", C11: "per hour, ex VAT",
  }, {
    freeze: { rows: 1, cols: 1 },
    styles: {
      A1: { bold: true, fill: "var(--bg-sunken)" }, B1: { bold: true, fill: "var(--bg-sunken)" }, C1: { bold: true, fill: "var(--bg-sunken)" },
      D1: { bold: true, fill: "var(--bg-sunken)" }, E1: { bold: true, fill: "var(--bg-sunken)" }, F1: { bold: true, fill: "var(--bg-sunken)" },
      G1: { bold: true, fill: "var(--bg-sunken)" }, H1: { bold: true, fill: "var(--bg-sunken)" }, I1: { bold: true, fill: "var(--bg-sunken)" },
      I2: { format: "percent", decimals: 1 }, I3: { format: "percent", decimals: 1 }, I4: { format: "percent", decimals: 1 }, I5: { format: "percent", decimals: 1 },
      I7: { format: "percent", decimals: 1, bold: true, border: ["top"] },
      B11: { format: "currency" },
    },
  });

  const summary = sheet("sh-summary", "Summary", {
    A1: "Trade summary",
    A3: "Pipeline net", B3: "=Pipeline!E8",
    A4: "Won net", B4: "=Pipeline!E9",
    A5: "Open net", B5: "=Pipeline!E10",
    A6: "Deals won", B6: "=Pipeline!E11",
    A7: "Weighted margin", B7: "=Margin!I7",
    A8: "Gross margin on won", B8: "=ROUND(B4*B7,2)",
    A10: "Status", B10: "=IF(B5>B4,\"More open than won\",\"Won ahead of open\")",
    A11: "Prepared", B11: "=TODAY()",
  }, {
    styles: {
      A1: { bold: true },
      B3: { format: "currency" }, B4: { format: "currency" }, B5: { format: "currency" },
      B7: { format: "percent", decimals: 1 }, B8: { format: "currency", bold: true },
      B11: { format: "date" },
    },
  });

  const workbook: Workbook = {
    sheets: [pipeline, bands, margin, summary],
    activeSheetId: "sh-pipeline",
    namedRanges: [
      { name: "PipelineNet", sheetName: "Pipeline", ref: "E2:E6" },
      { name: "LabourRate", sheetName: "Margin", ref: "B11" },
      { name: "DiscountBands", sheetName: "Bands", ref: "A2:C5" },
    ],
    tables: [{
      id: "tb-pipeline", name: "Pipeline", ref: "A1:H6", headerRow: true,
      columns: [
        { name: "Deal", type: "text", required: true },
        { name: "Stage", type: "text", required: true, rule: "won, open or lost" },
        { name: "Units", type: "number", required: true, rule: "Whole number above zero" },
        { name: "Unit net", type: "currency", required: true },
        { name: "Net", type: "currency" },
        { name: "Band", type: "text" },
        { name: "Discount", type: "percent" },
        { name: "Invoiced", type: "currency" },
      ],
    }],
    charts: [{
      id: "ch-pipeline", title: "Net by deal", kind: "bar", ref: "A1:E6",
      sheetId: "sh-pipeline", seriesInColumns: true, snapshotAt: context.now,
    }],
    comments: [{
      id: "sc-1", sheetId: "sh-pipeline", address: "D5", author: "Jonah Adeyemi", at: context.now,
      body: "£840 is below the published trade list. Either the band is wrong or this needs owner approval.",
      resolved: false,
    }],
    protection: [{ id: "pr-1", sheetId: "sh-bands", ref: "A2:C5", note: "The discount bands are the pricing policy. Changing them changes every quotation." }],
    io: [{ id: "io-1", at: context.now, kind: "import", format: "CSV", note: "Pipeline rows imported from the CRM export.", rows: 5, warnings: ["Column D carried a currency symbol and was imported as a number with the currency format applied explicitly."] }],
  };

  const cashflow: Workbook = {
    sheets: [sheet("sh-cash", "Cash", {
      A1: "Month", B1: "In", C1: "Out", D1: "Net", E1: "Running",
      A2: "Sep", B2: "18400", C2: "15200", D2: "=B2-C2", E2: "=D2",
      A3: "Oct", B3: "21600", C3: "16100", D3: "=B3-C3", E3: "=E2+D3",
      A4: "Nov", B4: "17900", C4: "18650", D4: "=B4-C4", E4: "=E3+D4",
      A5: "Dec", B5: "24100", C5: "17400", D5: "=B5-C5", E5: "=E4+D5",
      A7: "Worst month", A8: "=IF(MIN(D2:D5)=D4,A4,\"check\")",
      A10: "Total in", B10: "=SUM(B2:B5)",
      A11: "Total out", C11: "=SUM(C2:C5)",
      A12: "Closing", E12: "=E5",
    }, {
      freeze: { rows: 1, cols: 1 },
      styles: {
        A1: { bold: true, fill: "var(--bg-sunken)" }, B1: { bold: true, fill: "var(--bg-sunken)" }, C1: { bold: true, fill: "var(--bg-sunken)" },
        D1: { bold: true, fill: "var(--bg-sunken)" }, E1: { bold: true, fill: "var(--bg-sunken)" },
        B2: { format: "currency" }, B3: { format: "currency" }, B4: { format: "currency" }, B5: { format: "currency" },
        C2: { format: "currency" }, C3: { format: "currency" }, C4: { format: "currency" }, C5: { format: "currency" },
        D2: { format: "currency" }, D3: { format: "currency" }, D4: { format: "currency" }, D5: { format: "currency" },
        E2: { format: "currency" }, E3: { format: "currency" }, E4: { format: "currency" }, E5: { format: "currency" },
        B10: { format: "currency", bold: true }, C11: { format: "currency", bold: true }, E12: { format: "currency", bold: true, border: ["top"] },
      },
    })],
    activeSheetId: "sh-cash",
    namedRanges: [{ name: "NetByMonth", sheetName: "Cash", ref: "D2:D5" }],
    tables: [],
    charts: [{ id: "ch-cash", title: "Net by month", kind: "line", ref: "A1:D5", sheetId: "sh-cash", seriesInColumns: true, snapshotAt: context.now }],
    comments: [],
    protection: [],
    io: [],
  };

  return {
    records: [
      context.rec({
        org: "nl", collection: "workbooks", n: 320, title: "Trade model 2026",
        status: "active", owner: "Jonah Adeyemi",
        summary: "Pipeline, discount bands, margin by line and a summary that reads them.",
        tags: ["model", "finance"],
        fields: { folder: "Models", recalc: "automatic", sheets: 4 },
        body: workbook,
      }),
      context.rec({
        org: "nl", collection: "workbooks", n: 321, title: "Cash view, four months",
        status: "active", owner: "Jonah Adeyemi",
        summary: "A running cash position built from monthly in and out.",
        tags: ["cash"],
        fields: { folder: "Models", recalc: "automatic", sheets: 1 },
        body: cashflow,
      }),
      context.rec({
        org: "nl", collection: "workbooks", n: 322, title: "Stocktake template",
        status: "template", owner: "Theo Marsh",
        summary: "Count sheet for the Walthamstow shelves.",
        tags: ["template", "operations"],
        fields: { folder: "Templates", recalc: "automatic", sheets: 1, isTemplate: true },
        body: {
          sheets: [sheet("sh-stock", "Count", {
            A1: "SKU", B1: "Description", C1: "Expected", D1: "Counted", E1: "Variance",
            A2: "ARC-BB", B2: "Arc Lamp brushed brass", C2: "0", D2: "0", E2: "=D2-C2",
            A3: "ARC-BL", B3: "Arc Lamp blackened", C3: "0", D3: "0", E3: "=D3-C3",
            A5: "Total variance", E5: "=SUM(E2:E3)",
          }, { freeze: { rows: 1, cols: 0 }, styles: { A1: { bold: true, fill: "var(--bg-sunken)" }, B1: { bold: true, fill: "var(--bg-sunken)" }, C1: { bold: true, fill: "var(--bg-sunken)" }, D1: { bold: true, fill: "var(--bg-sunken)" }, E1: { bold: true, fill: "var(--bg-sunken)" } } })],
          activeSheetId: "sh-stock",
          namedRanges: [], tables: [], charts: [], comments: [], protection: [], io: [],
        } satisfies Workbook,
      }),
      context.rec({
        org: "nl", collection: "workbooks", n: 323, title: "Broken import, needs attention",
        status: "active", owner: "Maya Chen",
        summary: "An imported model with a circular reference and an unsupported function.",
        tags: ["import", "errors"],
        fields: { folder: "Imports", recalc: "automatic", sheets: 1 },
        body: {
          sheets: [sheet("sh-broken", "Imported", {
            A1: "Target", B1: "100",
            A2: "Uplift", B2: "=B4*0.1",
            A3: "Subtotal", B3: "=B1+B2",
            A4: "Total", B4: "=B3+B2",
            A6: "Unsupported", B6: "=GROWTH(B1:B4,A1:A4)",
            A7: "Bad reference", B7: "=Missing!A1",
            A8: "Divide", B8: "=B1/0",
          })],
          activeSheetId: "sh-broken",
          namedRanges: [], tables: [], charts: [], comments: [], protection: [], io: [],
        } satisfies Workbook,
      }),
      context.rec({
        org: "hb", collection: "workbooks", n: 320, title: "US landed cost",
        status: "active", owner: "Elena Ward",
        summary: "Duty, freight and landed cost per unit for the Arc range.",
        tags: ["model"],
        fields: { folder: "Models", recalc: "automatic", sheets: 1 },
        body: {
          sheets: [sheet("sh-landed", "Landed", {
            A1: "Line", B1: "FOB", C1: "Freight", D1: "Duty %", E1: "Duty", F1: "Landed",
            A2: "Arc Lamp", B2: "1120", C2: "48", D2: "0.035", E2: "=ROUND(B2*D2,2)", F2: "=B2+C2+E2",
            A3: "Arc Pendant", B3: "860", C3: "38", D3: "0.035", E3: "=ROUND(B3*D3,2)", F3: "=B3+C3+E3",
            A5: "Average landed", F5: "=ROUND(AVERAGE(F2:F3),2)",
          }, {
            freeze: { rows: 1, cols: 1 },
            styles: {
              A1: { bold: true, fill: "var(--bg-sunken)" }, B1: { bold: true, fill: "var(--bg-sunken)" }, C1: { bold: true, fill: "var(--bg-sunken)" },
              D1: { bold: true, fill: "var(--bg-sunken)" }, E1: { bold: true, fill: "var(--bg-sunken)" }, F1: { bold: true, fill: "var(--bg-sunken)" },
              B2: { format: "currency" }, B3: { format: "currency" }, C2: { format: "currency" }, C3: { format: "currency" },
              D2: { format: "percent", decimals: 1 }, D3: { format: "percent", decimals: 1 },
              E2: { format: "currency" }, E3: { format: "currency" }, F2: { format: "currency" }, F3: { format: "currency" },
              F5: { format: "currency", bold: true, border: ["top"] },
            },
          })],
          activeSheetId: "sh-landed",
          namedRanges: [], tables: [], charts: [], comments: [], protection: [], io: [],
        } satisfies Workbook,
      }),
    ],
  };
});
