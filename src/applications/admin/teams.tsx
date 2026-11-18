import { useState } from "react";
import { Users } from "lucide-react";
import { Button, Card, Empty, Field, Grid, Pill, Row, Select, Stack, TextInput } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import type { Rec, Role } from "@/domain/types";
import { ROLE_LABELS } from "@/platform/policy";

/* ====================================================================== *
 * ADMIN-002 · Teams — departments as records people can manage here: add a
 * team, name its lead and move members between teams. A member whose
 * department is missing or unknown is listed as unassigned rather than
 * silently dropped.
 * ====================================================================== */

export const UNASSIGNED = "";

export function teamOf(member: Rec, departments: Rec[]): string {
  const id = String(member.fields.departmentId ?? "");
  return departments.some((department) => department.id === id) ? id : UNASSIGNED;
}

export function TeamsManager({ context, members, departments }: { context: ScreenContext; members: Rec[]; departments: Rec[] }) {
  const canEdit = context.can("edit_people");
  const [name, setName] = useState("");
  const [lead, setLead] = useState("");
  const [purpose, setPurpose] = useState("");
  const [error, setError] = useState("");
  const humans = members.filter((member) => member.fields.kind !== "ai" && member.status !== "suspended");
  const unassigned = members.filter((member) => teamOf(member, departments) === UNASSIGNED);
  const groups = [
    ...departments.map((department) => ({ id: department.id, department, people: members.filter((member) => teamOf(member, departments) === department.id) })),
    ...(unassigned.length ? [{ id: UNASSIGNED, department: undefined, people: unassigned }] : []),
  ];

  const move = async (member: Rec, departmentId: string) => {
    const target = departments.find((department) => department.id === departmentId);
    await context.mutate.patch(member.id, { fields: { ...member.fields, departmentId } },
      { expectRevision: member.revision, event: `${member.title} moved to ${target?.title ?? "no team"} by ${context.actor}` });
    context.toast("Team updated", `${member.title} is now in ${target?.title ?? "no team"}. Their role view is unchanged.`);
  };

  return (
    <Stack gap={4}>
      <Grid>
        {groups.map((group) => (
          <Card key={group.id || "unassigned"} eyebrow={group.department ? "TEAM" : "NO TEAM"} prov="human" span={6}
            title={group.department?.title ?? "Unassigned"}
            subtitle={group.department
              ? `${group.people.length} ${group.people.length === 1 ? "member" : "members"} · lead ${String(group.department.fields.lead || "not named")}`
              : "Members whose team is missing or no longer exists"}
            actions={group.department && canEdit ? (
              <Select aria-label={`Lead of ${group.department.title}`} value={String(group.department.fields.lead ?? "")} onChange={async (event) => {
                const department = group.department!;
                await context.mutate.patch(department.id, { fields: { ...department.fields, lead: event.target.value } },
                  { expectRevision: department.revision, event: `${event.target.value || "No one"} named lead of ${department.title} by ${context.actor}` });
              }}>
                <option value="">No lead named</option>
                {[...new Set([...humans.map((member) => member.title), String(group.department.fields.lead ?? "")])].filter(Boolean).map((person) => <option key={person}>{person}</option>)}
              </Select>
            ) : undefined}>
            <Stack gap={2}>
              {group.department?.summary && <p className="ds-subtle" style={{ margin: 0 }}>{group.department.summary}</p>}
              {group.people.map((member) => (
                <Row key={member.id} gap={2} wrap>
                  <span className="ds-grow ds-truncate">{member.title}</span>
                  <Pill tone={member.fields.kind === "ai" ? "accent" : "neutral"}>{member.fields.kind === "ai" ? "Agent" : ROLE_LABELS[String(member.fields.role) as Role] ?? "Member"}</Pill>
                  {canEdit && (
                    <Select aria-label={`Team for ${member.title}`} value={teamOf(member, departments)} onChange={(event) => void move(member, event.target.value)} style={{ maxWidth: 190 }}>
                      <option value={UNASSIGNED}>No team</option>
                      {departments.map((department) => <option key={department.id} value={department.id}>{department.title}</option>)}
                    </Select>
                  )}
                </Row>
              ))}
              {group.people.length === 0 && <span className="ds-subtle">Nobody is assigned to this team.</span>}
            </Stack>
          </Card>
        ))}
        {departments.length === 0 && unassigned.length === 0 && <Empty title="No teams" icon={<Users size={20} />}>Add the first team below.</Empty>}
      </Grid>
      {canEdit && (
        <Card eyebrow="NEW TEAM" prov="human" title="Add a team" subtitle="Teams are shared with People and Headquarters">
          <form className="ds-stack ds-gap-3" onSubmit={async (event) => {
            event.preventDefault();
            const title = name.trim();
            if (!title) { setError("Give the team a name."); return; }
            if (departments.some((department) => department.title.toLowerCase() === title.toLowerCase())) { setError(`A team called ${title} already exists.`); return; }
            setError("");
            await context.mutate.create({ collection: "departments", title, status: "active", summary: purpose.trim(), fields: { lead, members: 0 } }, `Team ${title} created by ${context.actor}`);
            context.toast("Team added", `${title} is available for members here and in People.`);
            setName(""); setLead(""); setPurpose("");
          }}>
            <Row gap={3} wrap>
              <Field label="Team name" required error={error || undefined}><TextInput value={name} onChange={(event) => setName(event.target.value)} /></Field>
              <Field label="Lead">
                <Select value={lead} onChange={(event) => setLead(event.target.value)}>
                  <option value="">No lead yet</option>
                  {humans.map((member) => <option key={member.id}>{member.title}</option>)}
                </Select>
              </Field>
            </Row>
            <Field label="What the team does"><TextInput value={purpose} onChange={(event) => setPurpose(event.target.value)} /></Field>
            <Row gap={2}><Button type="submit" variant="primary">Add team</Button></Row>
          </form>
        </Card>
      )}
    </Stack>
  );
}
