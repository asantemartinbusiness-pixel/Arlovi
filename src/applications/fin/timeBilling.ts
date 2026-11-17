import type { Rec } from "@/domain/types";

export type BillingReadiness =
  | "unapproved" | "identity_missing" | "project_missing" | "rate_missing"
  | "invalid_hours" | "invoice_missing" | "invoiced" | "ready" | "reviewed";

export interface TimeBillingAssessment {
  state: BillingReadiness;
  label: string;
  eligible: boolean;
  /** Illustrative amount in currency minor units, excluding tax. */
  netEstimateMinor?: number;
}

export function assessTimeBilling(
  time: Rec, employees: Rec[], projects: Rec[], invoices: Rec[],
): TimeBillingAssessment {
  if (time.collection !== "shifts" || time.fields.kind !== "time" || time.fields.billable !== true) {
    return { state: "unapproved", label: "Not a billable time entry", eligible: false };
  }
  if (time.status !== "approved" || time.fields.approved !== true) {
    return { state: "unapproved", label: "Time approval required", eligible: false };
  }
  if (!employees.some((employee) => employee.id === time.fields.employeeId
    && employee.collection === "employees" && employee.organizationId === time.organizationId)) {
    return { state: "identity_missing", label: "Employee link required", eligible: false };
  }
  if (!projects.some((project) => project.id === time.fields.projectId
    && project.collection === "projects" && project.organizationId === time.organizationId)) {
    return { state: "project_missing", label: "Project link required", eligible: false };
  }
  const hours = Number(time.fields.hours);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
    return { state: "invalid_hours", label: "Hours need correction", eligible: false };
  }
  const rate = Number(time.fields.rateMinor);
  if (time.fields.rateMinor === undefined || !Number.isFinite(rate) || rate <= 0) {
    return { state: "rate_missing", label: "Agreed rate required", eligible: false };
  }
  const amount = Math.round(hours * rate);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return { state: "rate_missing", label: "Rate or amount invalid", eligible: false };
  }
  const invoiceId = String(time.fields.invoiceId ?? "").trim();
  if (invoiceId) {
    const invoice = invoices.find((row) => row.id === invoiceId && row.collection === "invoices"
      && row.organizationId === time.organizationId);
    return invoice
      ? { state: "invoiced", label: "Linked to invoice", eligible: false, netEstimateMinor: amount }
      : { state: "invoice_missing", label: "Invoice reference unavailable", eligible: false, netEstimateMinor: amount };
  }
  if (time.fields.billingReviewStatus === "ready"
    && typeof time.fields.billingReviewedBy === "string" && time.fields.billingReviewedBy.trim()
    && typeof time.fields.billingReviewedAt === "string" && Number.isFinite(Date.parse(time.fields.billingReviewedAt))) {
    return { state: "reviewed", label: "Reviewed for invoice preparation", eligible: false, netEstimateMinor: amount };
  }
  return { state: "ready", label: "Ready for Finance review", eligible: true, netEstimateMinor: amount };
}
