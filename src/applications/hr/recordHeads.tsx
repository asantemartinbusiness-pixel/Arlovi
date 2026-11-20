import { Avatar, Pill } from "@/design-system";
import type { RecordHeaderProps } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useRecord } from "@/platform/workspace";
import { knownRecord } from "@/platform/repo";
import { scopedDetailRecord } from "@/platform/recordScope";
import { EmploymentPill } from "./kit";

/** Department name resolved live, so a renamed department follows into the header. */
function DepartmentName({ id }: { id: string }) {
  const department = useRecord(id);
  return <>{department?.title ?? "Department"}</>;
}

/**
 * The person is the page head: name (h1), job title, then department, line
 * manager, office and start date. Only recorded facts appear; a missing field
 * is left out rather than printed as "not recorded".
 */
export function employeeRecordHeader(context: ScreenContext): RecordHeaderProps | null {
  const employee = scopedDetailRecord(knownRecord(context.params.id), context.org.id, "employees");
  if (!employee) return null;
  const f = employee.fields;
  const departmentId = typeof f.departmentId === "string" && f.departmentId ? f.departmentId : "";
  const jobTitle = String(f.title ?? "").trim();
  return {
    avatar: <Avatar name={employee.title} size="lg" />,
    title: employee.title,
    subtitle: jobTitle || (employee.summary ? String(employee.summary) : undefined),
    status: <EmploymentPill record={employee} />,
    meta: [
      departmentId ? <DepartmentName id={departmentId} /> : null,
      f.manager ? `Reports to ${String(f.manager)}` : null,
      f.office ? String(f.office) : null,
      employee.startAt ? `Started ${context.date(employee.startAt)}` : null,
    ],
  };
}

const APPLICANT_STAGE_TONE: Record<string, "neutral" | "info" | "success" | "warning" | "danger"> = {
  applied: "neutral", screening: "info", interview: "info", offer: "warning", hired: "success",
};

/** The candidate is the page head: name, the role applied for, stage, source and application date. */
export function applicantRecordHeader(context: ScreenContext): RecordHeaderProps | null {
  const applicant = scopedDetailRecord(knownRecord(context.params.id), context.org.id, "applicants");
  if (!applicant) return null;
  const f = applicant.fields;
  const stage = String(f.stage ?? applicant.status);
  return {
    avatar: <Avatar name={applicant.title} size="lg" />,
    title: applicant.title,
    subtitle: String(f.role ?? "") || undefined,
    status: <Pill tone={APPLICANT_STAGE_TONE[stage] ?? "neutral"} dot>{stage.charAt(0).toUpperCase() + stage.slice(1)}</Pill>,
    meta: [
      `Applied ${context.date(applicant.at ?? applicant.createdAt)}`,
      f.source ? `Source: ${String(f.source)}` : null,
    ],
  };
}
