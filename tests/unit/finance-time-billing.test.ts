import { describe, expect, it } from "vitest";
import type { Rec } from "@/domain/types";
import { assessTimeBilling } from "@/applications/fin/timeBilling";

const now = "2026-11-17T12:00:00.000Z";
function row(id: string, collection: string, fields: Rec["fields"] = {}, patch: Partial<Rec> = {}): Rec {
  return {
    id, collection, title: id, organizationId: "org-northline",
    status: "active", ownerName: "QA", summary: "", currency: "GBP",
    fields, tags: [], revision: 1, history: [], createdAt: now, updatedAt: now,
    createdBy: "QA", updatedBy: "QA", ...patch,
  };
}
const employees = [row("employee-1", "employees")];
const projects = [row("project-1", "projects", {}, { status: "planning" })];
const invoices = [row("invoice-1", "invoices", {}, { status: "draft" })];
const time = () => row("time-1", "shifts", {
  kind: "time", billable: true, employeeId: "employee-1", employeeName: "QA",
  projectId: "project-1", approved: true, hours: 2.5, rateMinor: 6200,
}, { status: "approved" });

describe("Finance review of approved project time", () => {
  it("calculates only an illustrative pre-tax amount from a real recorded rate", () => {
    const decision = assessTimeBilling(time(), employees, projects, invoices);
    expect(decision).toEqual({
      state: "ready", label: "Ready for Finance review", eligible: true, netEstimateMinor: 15500,
    });
  });

  it("does not treat submitted time or an inconsistent approval flag as Finance-ready", () => {
    const entry = time();
    entry.status = "submitted";
    expect(assessTimeBilling(entry, employees, projects, invoices).state).toBe("unapproved");
    entry.status = "approved";
    entry.fields.approved = false;
    expect(assessTimeBilling(entry, employees, projects, invoices).state).toBe("unapproved");
  });

  it("requires actual company employee and project records and a nonzero known rate", () => {
    const entry = time();
    expect(assessTimeBilling(entry, [], projects, invoices).state).toBe("identity_missing");
    expect(assessTimeBilling(entry, employees, [], invoices).state).toBe("project_missing");
    entry.fields.projectId = "foreign-project";
    expect(assessTimeBilling(entry, employees, projects, invoices).state).toBe("project_missing");
    entry.fields.projectId = "project-1";
    delete entry.fields.rateMinor;
    expect(assessTimeBilling(entry, employees, projects, invoices).state).toBe("rate_missing");
    entry.fields.rateMinor = 0;
    expect(assessTimeBilling(entry, employees, projects, invoices).state).toBe("rate_missing");
    entry.fields.rateMinor = 6200;
    entry.fields.hours = 0;
    expect(assessTimeBilling(entry, employees, projects, invoices).state).toBe("invalid_hours");
  });

  it("requires a real matching invoice before claiming that recorded time was invoiced", () => {
    const entry = time();
    entry.fields.invoiceId = "missing-invoice";
    expect(assessTimeBilling(entry, employees, projects, invoices).state).toBe("invoice_missing");
    entry.fields.invoiceId = "invoice-1";
    expect(assessTimeBilling(entry, employees, projects, invoices).state).toBe("invoiced");
  });

  it("recognizes an actor/time-stamped Finance review but never claims an invoice exists", () => {
    const entry = time();
    entry.fields.billingReviewStatus = "ready";
    entry.fields.billingReviewedBy = "Elena Voss";
    entry.fields.billingReviewedAt = now;
    const result = assessTimeBilling(entry, employees, projects, invoices);
    expect(result.state).toBe("reviewed");
    expect(result.eligible).toBe(false);
    expect(result.netEstimateMinor).toBe(15500);
    entry.fields.approved = false;
    expect(assessTimeBilling(entry, employees, projects, invoices).state).toBe("unapproved");
  });
});
