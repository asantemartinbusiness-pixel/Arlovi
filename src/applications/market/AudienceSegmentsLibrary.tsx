import { useMemo, useState } from "react";
import { Button, Card, Empty, Grid, Notice, Pill, Properties, Row, Segmented, Stack, TextInput } from "@/design-system";
import { Users } from "lucide-react";
import type { Rec } from "@/domain/types";
import type { ScreenContext } from "@/platform/registry";
import { useWorkspace } from "@/platform/workspace";
import { bodyOf, evaluateSegment, useMarketData, type AudienceBody } from "./data";
import "./marketing-workareas.css";

export function searchAudienceSegments(audiences: Rec[], query: string): Rec[] {
  const tokens = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return audiences;
  return audiences.filter(audience => {
    const body = bodyOf<AudienceBody>(audience, {});
    const text = [
      audience.title, audience.summary,
      ...(body.rules ?? []).flatMap(rule => [rule.field, rule.op, rule.value]),
      ...(body.exclusions ?? []),
    ].join(" ").toLocaleLowerCase();
    return tokens.every(token => text.includes(token));
  });
}

export function AudienceSegmentsLibrary({ context }: { context: ScreenContext }) {
  const data = useMarketData();
  const { now } = useWorkspace();
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"all" | "review">("all");
  const filtered = useMemo(() => searchAudienceSegments(data.audiences, query), [data.audiences, query]);
  const results = filtered.map(audience => {
    const body = bodyOf<AudienceBody>(audience, {});
    const evaluation = evaluateSegment(audience, data.contacts, now);
    const needsReview = evaluation.members.length === 0 || !(body.exclusions ?? []).includes("suppressed");
    return { audience, body, evaluation, needsReview };
  }).filter(item => scope !== "review" || item.needsReview);

  return <section className="t4-audience-library" aria-label="Audience segments directory">
    <div className="t4-audience-filter">
      <TextInput type="search" aria-label="Search audience segments"
        placeholder="Find a segment, rule or exclusion" value={query}
        onChange={event => { setQuery(event.target.value); context.select(undefined); }} />
      <Segmented label="Segment review filter" value={scope} onChange={value => { setScope(value); context.select(undefined); }}
        options={[{ value: "all", label: "All segments" }, { value: "review", label: "Needs review" }]} />
      <span className="ds-subtle" role="status" aria-live="polite">{results.length} of {data.audiences.length} segments</span>
    </div>
    {results.length === 0
      ? <Empty title={data.audiences.length === 0 ? "No segments yet" : "No segments match this view"}
          icon={<Users size={20} />}
          action={query || scope !== "all"
            ? <Button variant="secondary" onClick={() => { setQuery(""); setScope("all"); }}>Show all segments</Button>
            : <Button variant="primary" onClick={() => context.openOverlay("Segment builder")}>Build a segment</Button>}>
          {data.audiences.length === 0
            ? "Create an audience from locally stored contacts and explicit consent rules."
            : "Try another name or clear review filters. Existing audience rules have not changed."}
        </Empty>
      : <Grid>
        {results.map(({ audience, body, evaluation, needsReview }) => {
          const selected = context.selectedId === audience.id;
          return <Card key={audience.id} span={6} title={audience.title} subtitle={audience.summary}
            actions={<Pill tone={evaluation.members.length === 0 ? "warning" : "success"}>{evaluation.members.length} eligible</Pill>}
            footer={<>
              <Button size="sm" variant={selected ? "primary" : "secondary"} aria-pressed={selected}
                aria-label={`${selected ? "Deselect" : "Select"} ${audience.title}`}
                onClick={() => context.select(selected ? undefined : audience.id)}>{selected ? "Selected" : "Select"}</Button>
              <Button size="sm" variant="ghost" aria-label={`Edit rules for ${audience.title}`}
                onClick={() => context.openOverlay("Segment builder", { id: audience.id })}>Edit rules</Button>
              <Button size="sm" variant="ghost" aria-label={`Preview members of ${audience.title}`}
                onClick={() => context.openOverlay("Audience preview", { id: audience.id })}>Preview members</Button>
              <span className="ds-grow" />
              <span className="ds-subtle">Rules saved {context.relative(audience.updatedAt)}</span>
            </>}>
            <Stack gap={3}>
              <Properties rows={[
                { label: "Eligible contacts", value: <strong>{evaluation.members.length}</strong> },
                { label: "Held back", value: String(evaluation.excluded.length) },
                { label: "Source", value: `${data.contacts.length} local contact records` },
              ]} />
              {needsReview && <Notice tone="warning" title="Review this audience before outreach">
                {evaluation.members.length === 0 ? "No contacts are currently eligible. " : ""}
                {(body.exclusions ?? []).includes("suppressed") ? "" : "Suppressed contacts are not explicitly excluded by these rules."}
              </Notice>}
              <details className="t4-audience-rules">
                <summary>{(body.rules ?? []).length} rules · {(body.exclusions ?? []).length} exclusions — inspect conditions</summary>
                <Stack gap={2}>
                  {(body.rules ?? []).map((rule, i) =>
                    <code key={`${rule.field}-${i}`} style={{ fontSize: "var(--text-xs)", overflowWrap: "anywhere" }}>{rule.field} {rule.op} {rule.value}</code>)}
                  {(body.rules ?? []).length === 0 && <span className="ds-subtle">No rules configured.</span>}
                  {(body.exclusions ?? []).length > 0 && <Row gap={1} wrap>
                    {(body.exclusions ?? []).map(exclusion => <Pill key={exclusion}>{exclusion.replaceAll("_", " ")}</Pill>)}
                  </Row>}
                </Stack>
              </details>
            </Stack>
          </Card>;
        })}
      </Grid>}
    <p className="ds-subtle">Counts are recalculated from this organisation's contact records. They do not confirm any provider audience upload or sending permission.</p>
  </section>;
}
