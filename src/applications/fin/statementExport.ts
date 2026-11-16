import type { Rec } from "@/domain/types";
import type { BalanceSheet, CashFlow, ProfitAndLoss, TrialRow } from "@/domain/fin-ledger";
import { outstandingMinor } from "./data";

export type StatementKind = "pl" | "bs" | "cf" | "tb" | "aged";

export type StatementExportInput = {
  statement: StatementKind;
  period: string;
  pl: ProfitAndLoss;
  bs: BalanceSheet;
  flow: CashFlow;
  trialRows: TrialRow[];
  invoices: Rec[];
};

function csvCell(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}
function csv(headers: string[], rows: (string | number)[][]): string {
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

/**
 * A download must contain the exact statement currently selected, not the
 * trial balance renamed to profit-and-loss, cash-flow or receivables ageing.
 * Values are in minor units. Aged receivables represent the LIVE position.
 */
export function statementCsv(input: StatementExportInput): string {
  const { statement, pl, bs, flow, trialRows, invoices } = input;
  if (statement === "pl") {
    const rows: (string | number)[][] = [
      ["Revenue", "", "Total revenue", pl.revenueMinor],
      ...pl.revenue.map((line): (string | number)[] => ["Revenue", line.code, line.name, line.amountMinor]),
      ["Cost of sales", "", "Total cost of sales", pl.costOfSalesMinor],
      ["Gross margin", "", "Gross margin", pl.grossMarginMinor],
      ["Expense", "", "Total expenses", pl.expenseMinor],
      ...pl.expense.map((line): (string | number)[] => ["Expense", line.code, line.name, line.amountMinor]),
      ["Net result", "", "Net result", pl.netMinor],
    ];
    return csv(["section", "account_code", "account", "amount_minor"], rows);
  }
  if (statement === "bs") {
    const rows: (string | number)[][] = [
      ["Assets", "", "Total assets", bs.assetsMinor],
      ...bs.assets.map((line): (string | number)[] => ["Assets", line.code, line.name, line.amountMinor]),
      ["Liabilities", "", "Total liabilities", bs.liabilitiesMinor],
      ...bs.liabilities.map((line): (string | number)[] => ["Liabilities", line.code, line.name, line.amountMinor]),
      ["Equity", "", "Total equity", bs.equityMinor],
      ...bs.equity.map((line): (string | number)[] => ["Equity", line.code, line.name, line.amountMinor]),
      ["Retained result", "", "Net result", bs.retainedMinor],
      ["Equation", "", "Assets less liabilities and equity", bs.differenceMinor],
    ];
    return csv(["section", "account_code", "account", "amount_minor"], rows);
  }
  if (statement === "cf") {
    const rows: (string | number)[][] = [
      ["Opening", "Opening cash", flow.openingMinor],
      ...flow.rows.map((row): (string | number)[] => [row.activity, row.label, row.amountMinor]),
      ["Operating", "Net operating cash", flow.operatingMinor],
      ["Investing", "Net investing cash", flow.investingMinor],
      ["Financing", "Net financing cash", flow.financingMinor],
      ["Movement", "Total net movement", flow.movementMinor],
      ["Closing", "Closing cash", flow.closingMinor],
    ];
    return csv(["activity", "account", "amount_minor"], rows);
  }
  if (statement === "aged") {
    const open = invoices.filter((item) => ["awaiting_payment", "part_paid"].includes(item.status));
    return csv(
      ["invoice_id", "invoice_number", "status", "due_date", "gross_minor", "recorded_paid_minor", "outstanding_minor"],
      open.map((item) => [
        item.id, item.title, item.status, (item.dueAt ?? "").slice(0, 10),
        Number(item.amountMinor ?? 0), Number(item.fields.paidMinor ?? 0), outstandingMinor(item),
      ]),
    );
  }
  return csv(
    ["code", "name", "type", "debit_minor", "credit_minor", "balance_minor"],
    trialRows.map((row) => [
      row.code, row.name, row.type, row.debitMinor, row.creditMinor, row.balanceMinor,
    ]),
  );
}
