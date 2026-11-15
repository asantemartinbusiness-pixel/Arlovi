import { useMemo, useState } from "react";
import { BookOpen, Brain, Database, FileSearch, GitBranch, Inbox, Lock, Palette, Scale } from "lucide-react";
import {
  BarChart, Button, Card, Checkbox, DataGrid, Empty, Field, Grid, Meter, Notice, Pill, Properties,
  Row, Select, Stack, Stat, StatRow, TextArea, TextInput,
} from "@/design-system";
import { registerApp, type ScreenContext } from "@/platform/registry";
import { useCollection, useCollections, useRecord, useWorkspace } from "@/platform/workspace";
import { freshness } from "@/platform/clock";
import { CapabilityLine, DiagramToggle } from "@/applications/t2_shared/pieces";
import { usePanelFlags } from "@/applications/t2_shared/store";
import type { Rec } from "@/domain/types";

/* ====================================================================== *
 * BRAIN — Company Brain & Knowledge
 *
 * Every assertion carries the source it came from, how old that source is
 * and who verified it. Nothing is promoted to an authoritative fact by this
 * interface; a person does that, and a financial conflict is never settled
 * here at all.
 * ====================================================================== */

const CONFIDENCE_TONE: Record<string, "success" | "info" | "warning" | "danger"> = {
  verified: "success", proposed: "info", conflicting: "warning", expired: "warning",
};

function useKnowledge() {
  return useCollections(["facts", "sources", "conflicts", "decisions", "policies", "brands", "graphLinks", "agents", "members"]);
}

function sourceOf(data: Record<string, Rec[]>, id: unknown): Rec | undefined {
  return (data.sources ?? []).find((source) => source.id === String(id ?? ""));
}

/* ---------------------------- BRAIN-001 ---------------------------- */

function KnowledgeHome({ context, view }: { context: ScreenContext; view: "Overview" | "Recent" | "Quality" | "Opportunities" }) {
  const data = useKnowledge();
  const { now } = useWorkspace();
  const verified = data.facts.filter((fact) => fact.status === "verified");
  const proposed = data.facts.filter((fact) => fact.status === "proposed");
  const expired = data.facts.filter((fact) => fact.status === "expired");
  const openConflicts = data.conflicts.filter((conflict) => conflict.status === "open");
  const stale = data.sources.filter((source) => freshness(String(source.fields.freshness ?? source.updatedAt), now, 45).stale);
  const held = data.sources.filter((source) => ["quarantined", "failed"].includes(source.status));
  const unsourced = data.facts.filter((fact) => !sourceOf(data, fact.fields.sourceId));

  if (view === "Recent") {
    const rows = [...data.sources, ...data.facts].sort((a, b) => (b.at ?? b.updatedAt).localeCompare(a.at ?? a.updatedAt)).slice(0, 20);
    return (
      <DataGrid
        rows={rows}
        rowId={(row) => row.id}
        label="Recent knowledge"
        columns={[
          { key: "title", header: "Record", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
          { key: "kind", header: "Kind", cell: (row) => <Pill tone={row.collection === "facts" ? "accent" : "neutral"}>{row.collection === "facts" ? "Assertion" : "Source"}</Pill> },
          { key: "state", header: "State", cell: (row) => <Pill tone={CONFIDENCE_TONE[row.status] ?? "neutral"}>{row.status}</Pill> },
          { key: "when", header: "Recorded", align: "end", cell: (row) => context.relative(row.at ?? row.updatedAt), sortValue: (row) => row.at ?? row.updatedAt },
        ]}
        onOpen={(id) => context.openOverlay("Knowledge inspector", { id })}
      />
    );
  }

  if (view === "Quality") {
    const domains = [...new Set(data.facts.map((fact) => String(fact.fields.domain ?? "unfiled")))];
    return (
      <Grid>
        <Card span={12} title="Assertions by domain" subtitle="Verified against everything else recorded">
          <BarChart
            title="Assertions by domain"
            height={220}
            format={(value) => String(Math.round(value))}
            series={[
              { name: "Verified", points: domains.map((domain) => ({ label: domain, value: data.facts.filter((fact) => fact.fields.domain === domain && fact.status === "verified").length })) },
              { name: "Not verified", points: domains.map((domain) => ({ label: domain, value: data.facts.filter((fact) => fact.fields.domain === domain && fact.status !== "verified").length })) },
            ]}
            footer="Counted from the fact registry. A domain with no verified assertion is a gap, not a zero."
          />
        </Card>
        <Card span={6} title="Assertions with no source" subtitle={`${unsourced.length} of ${data.facts.length}`}>
          {unsourced.length === 0 ? <Notice tone="success">Every assertion names a source record.</Notice> : (
            <Stack gap={2}>
              {unsourced.map((fact) => (
                <Row key={fact.id} gap={2} className="ds-panel" style={{ padding: "var(--space-2)" }}>
                  <span className="ds-grow">{fact.title}</span>
                  <Button size="sm" variant="ghost" onClick={() => context.openOverlay("Knowledge inspector", { id: fact.id })}>Inspect</Button>
                </Row>
              ))}
            </Stack>
          )}
        </Card>
        <Card span={6} title="Stale sources" subtitle="Older than 45 days">
          {stale.length === 0 ? <Notice tone="success">Every source has been refreshed recently.</Notice> : (
            <Stack gap={2}>
              {stale.map((source) => {
                const age = freshness(String(source.fields.freshness ?? source.updatedAt), now, 45);
                return (
                  <Row key={source.id} gap={2} className="ds-panel" style={{ padding: "var(--space-2)" }}>
                    <span className="ds-grow ds-truncate">{source.title}</span>
                    <Pill tone="warning">{age.known ? `${age.days} days` : "Unknown age"}</Pill>
                  </Row>
                );
              })}
            </Stack>
          )}
        </Card>
      </Grid>
    );
  }

  if (view === "Opportunities") {
    const suggestions = [
      ...proposed.map((fact) => ({
        id: fact.id,
        title: `Verify: ${fact.title}`,
        body: `${fact.summary} Evidence: ${sourceOf(data, fact.fields.sourceId)?.title ?? "no source record"}.`,
        safe: Boolean(sourceOf(data, fact.fields.sourceId)),
      })),
      ...held.map((source) => ({
        id: source.id,
        title: `Review the held file: ${source.title}`,
        body: `${source.summary} It stays out of retrieval until a person reviews it.`,
        safe: false,
      })),
    ];
    return (
      <Stack gap={4}>
        <Notice tone="info" title="A suggestion is never applied automatically">
          Each line below is work for a person. Nothing here promotes an unverified claim, and a suggestion with no source record cannot be approved at all.
        </Notice>
        {suggestions.length === 0 ? <Empty title="Nothing to improve" icon={<Brain size={20} />} /> : (
          <Grid>
            {suggestions.map((suggestion) => (
              <Card key={suggestion.id} span={6} title={suggestion.title} prov={suggestion.safe ? "human" : "unknown"}
                footer={
                  <Button size="sm" variant="secondary" disabled={!suggestion.safe} title={suggestion.safe ? undefined : "No source record backs this yet"}
                    onClick={() => context.openOverlay("suggestion approval", { id: suggestion.id })}>
                    Review
                  </Button>
                }>
                <p className="ds-prose">{suggestion.body}</p>
              </Card>
            ))}
          </Grid>
        )}
      </Stack>
    );
  }

  return (
    <Stack gap={5}>
      <StatRow>
        <Stat label="Verified assertions" value={String(verified.length)} prov="human" meta={`of ${data.facts.length} in the registry`} onClick={() => context.navigate(`/o/${context.org.slug}/brain/facts`)} />
        <Stat label="Awaiting verification" value={String(proposed.length)} prov="agent" meta="Proposed, not authoritative" />
        <Stat label="Open conflicts" value={String(openConflicts.length)} prov="unknown" meta={openConflicts.some((conflict) => conflict.fields.requiresLedgerReview === true) ? "One needs a ledger review" : "None needs a ledger review"} onClick={() => context.navigate(`/o/${context.org.slug}/brain/conflicts`)} />
        <Stat label="Sources held back" value={String(held.length)} prov="unknown" meta="Unscanned or failed to parse" />
      </StatRow>

      <Grid>
        <Card span={7} title="Knowledge quality" subtitle="Computed from the registry, not estimated">
          <Stack gap={4}>
            <div>
              <Row gap={2}><span className="ds-grow">Assertions with a source</span><strong className="ds-num">{data.facts.length - unsourced.length} / {data.facts.length}</strong></Row>
              <Meter value={data.facts.length - unsourced.length} max={data.facts.length || 1} label="Assertions with a source" tone={unsourced.length === 0 ? "success" : "warning"} />
            </div>
            <div>
              <Row gap={2}><span className="ds-grow">Verified</span><strong className="ds-num">{verified.length} / {data.facts.length}</strong></Row>
              <Meter value={verified.length} max={data.facts.length || 1} label="Verified assertions" tone={verified.length / (data.facts.length || 1) > 0.6 ? "success" : "warning"} />
            </div>
            <div>
              <Row gap={2}><span className="ds-grow">Sources indexed</span><strong className="ds-num">{data.sources.filter((source) => source.status === "indexed").length} / {data.sources.length}</strong></Row>
              <Meter value={data.sources.filter((source) => source.status === "indexed").length} max={data.sources.length || 1} label="Sources indexed" />
            </div>
            <Notice tone="warning" title="Expired knowledge is kept visible">
              {expired.length} assertion{expired.length === 1 ? "" : "s"} passed {expired.length === 1 ? "its" : "their"} validity date. They stay in the registry marked expired rather than being deleted or quietly refreshed.
            </Notice>
          </Stack>
        </Card>

        <Card span={5} title="Recent sources" subtitle={`${data.sources.length} registered`}>
          <Stack gap={2}>
            {data.sources.slice(0, 6).map((source) => {
              const age = freshness(String(source.fields.freshness ?? source.updatedAt), now, 45);
              return (
                <button key={source.id} type="button" className="ds-record-card" onClick={() => context.navigate(`/o/${context.org.slug}/brain/sources/${source.id}`)}>
                  <Row gap={2}>
                    <strong className="ds-grow ds-truncate" style={{ textAlign: "start" }}>{source.title}</strong>
                    <Pill tone={source.status === "indexed" ? "success" : "warning"}>{source.status}</Pill>
                  </Row>
                  <span className="ds-subtle">{String(source.fields.kind ?? "file")} · {age.known ? `${age.days} days old` : "age unknown"}</span>
                </button>
              );
            })}
          </Stack>
        </Card>

        <Card span={12} title="Top entities" subtitle="Subjects the registry knows most about">
          <DataGrid
            rows={[...new Set(data.facts.map((fact) => String(fact.fields.subject ?? "unfiled")))].map((subject) => ({
              subject,
              total: data.facts.filter((fact) => fact.fields.subject === subject).length,
              verified: data.facts.filter((fact) => fact.fields.subject === subject && fact.status === "verified").length,
              sources: new Set(data.facts.filter((fact) => fact.fields.subject === subject).map((fact) => String(fact.fields.sourceId))).size,
            })).sort((a, b) => b.total - a.total)}
            rowId={(row) => row.subject}
            label="Top entities"
            filterable={false}
            columns={[
              { key: "subject", header: "Entity", primary: true, cell: (row) => row.subject },
              { key: "total", header: "Assertions", align: "end", cell: (row) => String(row.total), sortValue: (row) => row.total },
              { key: "verified", header: "Verified", align: "end", cell: (row) => String(row.verified), sortValue: (row) => row.verified },
              { key: "sources", header: "Distinct sources", align: "end", cell: (row) => String(row.sources) },
            ]}
          />
        </Card>
      </Grid>
    </Stack>
  );
}

/* ---------------------------- BRAIN-002 ---------------------------- */

function SourceLibrary({ context, view }: { context: ScreenContext; view: "Documents" | "Websites" | "Integrations" | "Media" }) {
  const sources = useCollection("sources");
  const { now } = useWorkspace();
  const kind = view === "Documents" ? "file" : view === "Websites" ? "website" : view === "Integrations" ? "integration" : "media";
  const rows = sources.filter((source) => String(source.fields.kind ?? "file") === kind);

  if (rows.length === 0) {
    return (
      <Empty title={`No ${view.toLowerCase()} source`} icon={<Database size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Upload dialog")}>Add a source</Button>}>
        {view === "Integrations"
          ? "An integration source would refresh itself from a service. Nothing is connected, so every source here is one a person put in."
          : "A source is the record a fact can point at. Without one, an assertion cannot be verified."}
      </Empty>
    );
  }

  return (
    <Stack gap={3}>
      {view === "Integrations" && <CapabilityLine id="bank.feed" title="No service is connected to refresh these" />}
      <DataGrid
        rows={rows}
        rowId={(row) => row.id}
        label={`${view} sources`}
        selectedId={context.selectedId}
        onSelect={(id) => context.select(id)}
        onOpen={(id) => context.navigate(`/o/${context.org.slug}/brain/sources/${id}`)}
        rowTone={(row) => (["quarantined", "failed"].includes(row.status) ? "warning" : undefined)}
        columns={[
          { key: "title", header: "Source", primary: true, cell: (row) => row.title, sortValue: (row) => row.title, filterValue: (row) => `${row.title} ${row.summary}` },
          { key: "class", header: "Classification", cell: (row) => <Pill tone={row.fields.classification === "confidential" ? "warning" : row.fields.classification === "public" ? "neutral" : "info"}>{String(row.fields.classification ?? "internal")}</Pill> },
          { key: "owner", header: "Owner", cell: (row) => row.ownerName },
          { key: "fresh", header: "Freshness", cell: (row) => {
            const age = freshness(String(row.fields.freshness ?? row.updatedAt), now, 45);
            return <Row gap={2}><span>{context.date(String(row.fields.freshness ?? row.updatedAt))}</span>{age.stale && <Pill tone="warning">stale</Pill>}</Row>;
          }, sortValue: (row) => String(row.fields.freshness ?? row.updatedAt) },
          { key: "index", header: "Indexing", cell: (row) => <Pill tone={row.status === "indexed" ? "success" : row.status === "failed" ? "danger" : "warning"}>{row.status}</Pill> },
          { key: "scan", header: "Scanned", cell: (row) => row.fields.scanned === true ? "Reviewed" : <Pill tone="warning">Not scanned</Pill> },
        ]}
        bulkActions={[
          { label: "Retire", onRun: (selected) => selected.forEach((source) => void context.mutate.patch(source.id, { status: "retired" }, { event: `${source.title} retired from the knowledge base` })) },
        ]}
      />
      <Notice tone="info" title="Ingestion is isolated by default">
        No scanner is connected, so an uploaded file is held as quarantined and kept out of retrieval until a person reviews it. A file that cannot be parsed is marked failed with the reason, never partially indexed.
      </Notice>
    </Stack>
  );
}

/* ---------------------------- BRAIN-003 ---------------------------- */

interface Correction { id: string; at: string; by: string; from: string; to: string; note: string }

function SourceDetail({ context, view }: { context: ScreenContext; view: "Preview" | "Extracted data" | "Relationships" | "Access" | "History" }) {
  const data = useKnowledge();
  const asked = useRecord(context.params.id);
  const source = asked?.collection === "sources" ? asked : data.sources[0];
  const { now } = useWorkspace();
  if (!source) return <Empty title="No source in this workspace" icon={<Database size={20} />} />;
  const body = source.body as { extracted?: string[]; note?: string; corrections?: Correction[] } | undefined;
  const corrections = body?.corrections ?? [];
  const age = freshness(String(source.fields.freshness ?? source.updatedAt), now, 45);
  const facts = data.facts.filter((fact) => fact.fields.sourceId === source.id);

  if (view === "Extracted data") {
    return (
      <Stack gap={4}>
        <Notice tone="info" title="Extraction is recorded with its author and confidence">
          These lines were read out of the source by a person in this browser. Correcting one keeps the original line and appends an immutable correction entry.
        </Notice>
        {(body?.extracted ?? []).length === 0 ? (
          <Empty title="Nothing was extracted" icon={<FileSearch size={20} />}>{body?.note || "No content could be read from this source."}</Empty>
        ) : (
          <DataGrid
            rows={(body?.extracted ?? []).map((line, index) => ({ id: `${source.id}-${index}`, line, index }))}
            rowId={(row) => row.id}
            label="Extracted lines"
            filterable={false}
            columns={[
              { key: "line", header: "Extracted", primary: true, cell: (row) => row.line },
              { key: "author", header: "Recorded by", cell: () => source.ownerName },
              { key: "corrected", header: "Corrections", cell: (row) => String(corrections.filter((correction) => correction.from === row.line).length) },
            ]}
            onOpen={(id) => context.openOverlay("Correction form", { id, line: (body?.extracted ?? [])[Number(id.split("-").pop())] })}
          />
        )}
        {corrections.length > 0 && (
          <Card title="Correction history" subtitle="Append-only">
            <Stack gap={2}>
              {corrections.map((correction) => (
                <div key={correction.id} className="ds-panel" style={{ padding: "var(--space-2)" }}>
                  <Row gap={2}><strong>{correction.by}</strong><span className="ds-subtle">{context.dateTime(correction.at)}</span></Row>
                  <p className="ds-subtle">“{correction.from}” → “{correction.to}”. {correction.note}</p>
                </div>
              ))}
            </Stack>
          </Card>
        )}
      </Stack>
    );
  }

  if (view === "Relationships") {
    return (
      <Stack gap={4}>
        <Card title="Assertions that cite this source" subtitle={`${facts.length} in the registry`}>
          {facts.length === 0 ? <Empty title="Nothing cites this source yet" /> : (
            <DataGrid
              rows={facts}
              rowId={(row) => row.id}
              label="Assertions"
              columns={[
                { key: "title", header: "Assertion", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
                { key: "value", header: "Value", cell: (row) => String(row.fields.value ?? row.summary) },
                { key: "state", header: "Confidence", cell: (row) => <Pill tone={CONFIDENCE_TONE[row.status] ?? "neutral"}>{row.status}</Pill> },
              ]}
              onOpen={() => context.navigate(`/o/${context.org.slug}/brain/facts`)}
            />
          )}
        </Card>
        <Card title="Lineage" subtitle="What this source came from and what depends on it">
          <Properties rows={[
            { label: "Came from", value: String(source.fields.kind) === "website" ? "A saved copy taken by a person" : "A file a person put into this workspace" },
            { label: "Feeds", value: `${facts.length} assertions, ${data.conflicts.filter((conflict) => JSON.stringify(conflict.body).includes(source.id)).length} conflicts` },
            { label: "Refreshable", value: <Pill tone="warning">No service connected</Pill> },
          ]} />
        </Card>
      </Stack>
    );
  }

  if (view === "Access") {
    const policy = data.policies.find((item) => item.fields.kind === "sensitivity");
    const groups = (policy?.body as { groups?: { id: string; label: string; roles: string[]; agents: boolean }[] } | undefined)?.groups ?? [];
    const group = groups.find((item) => item.id === String(source.fields.classification ?? "internal"));
    return (
      <Stack gap={4}>
        <Properties rows={[
          { label: "Classification", value: <Pill tone={source.fields.classification === "confidential" ? "warning" : "neutral"}>{String(source.fields.classification ?? "internal")}</Pill> },
          { label: "Role views that see it", value: group ? group.roles.join(", ") : "Not covered by a policy" },
          { label: "AI retrieval", value: group?.agents ? <Pill tone="success">Allowed</Pill> : <Pill tone="warning">Excluded</Pill> },
          { label: "Your role view", value: group?.roles.includes(context.role) ? "Included" : "Not included" },
        ]} />
        <Notice tone="info" title="This is an interface boundary">
          Classification shapes what this workspace offers a role view or an AI contract. It is not account security and does not imply server-side enforcement.
        </Notice>
        <Button variant="secondary" onClick={() => context.openOverlay("permission editor", { id: source.id })}>Restrict this source</Button>
      </Stack>
    );
  }

  if (view === "History") {
    return (
      <Stack gap={3}>
        <Properties rows={[
          { label: "Created", value: context.dateTime(source.createdAt) },
          { label: "Last change", value: `${context.dateTime(source.updatedAt)} by ${source.updatedBy}` },
          { label: "Revision", value: String(source.revision) },
          { label: "Corrections", value: String(corrections.length) },
        ]} />
        {source.history.length === 0 ? <Notice tone="info">No earlier version is recorded for this source.</Notice> : (
          <DataGrid
            rows={source.history.map((snapshot, index) => ({ ...snapshot, id: `${source.id}-h${index}` }))}
            rowId={(row) => row.id}
            label="Source history"
            filterable={false}
            columns={[
              { key: "at", header: "When", primary: true, cell: (row) => context.dateTime(row.at) },
              { key: "status", header: "Status", cell: (row) => row.status },
              { key: "summary", header: "Summary", cell: (row) => row.summary },
            ]}
          />
        )}
      </Stack>
    );
  }

  return (
    <Grid>
      <Card span={7} title={source.title} subtitle={source.summary} prov="human"
        actions={<Pill tone={source.status === "indexed" ? "success" : "warning"}>{source.status}</Pill>}>
        <Stack gap={3}>
          {source.status === "quarantined" && (
            <Notice tone="warning" title="Held out of retrieval">
              {String(body?.note || "No scanner is connected, so this file is isolated until a person reviews it.")}
            </Notice>
          )}
          {source.status === "failed" && (
            <Notice tone="danger" title="Parsing failed">
              {String(body?.note || "The file could not be read. It is isolated and reported rather than partly indexed.")}
            </Notice>
          )}
          <article className="ds-panel" style={{ padding: "var(--space-4)" }}>
            <strong>Preview</strong>
            {(body?.extracted ?? []).length === 0 ? (
              <p className="ds-subtle">No readable content. The original file is not stored in this browser: this workspace holds the record, its metadata and whatever a person typed out of it.</p>
            ) : (
              <ul className="ds-prose" style={{ paddingInlineStart: "1.1rem" }}>
                {(body?.extracted ?? []).map((line) => <li key={line}>{line}</li>)}
              </ul>
            )}
          </article>
        </Stack>
      </Card>
      <Card span={5} title="Metadata" subtitle="Provenance and freshness">
        <Properties rows={[
          { label: "Kind", value: String(source.fields.kind ?? "file") },
          { label: "Pages", value: Number(source.fields.pages ?? 0) ? String(source.fields.pages) : "Not recorded" },
          { label: "Classification", value: String(source.fields.classification ?? "internal") },
          { label: "Owner", value: source.ownerName },
          { label: "Freshness", value: age.known ? `${context.date(String(source.fields.freshness))} · ${age.days} days old${age.stale ? " · stale" : ""}` : "Unknown" },
          { label: "Scanned", value: source.fields.scanned === true ? "Reviewed by a person" : "Not scanned — no scanner connected" },
          { label: "Assertions citing it", value: String(facts.length) },
        ]} />
      </Card>
    </Grid>
  );
}

/* ---------------------------- BRAIN-004 ---------------------------- */

interface GraphNode { id: string; label: string; kind: string; x: number; y: number }

function BusinessGraph({ context, view }: { context: ScreenContext; view: "Entities" | "Relationships" | "Exceptions" }) {
  const data = useCollections(["graphLinks", "facts", "contacts", "companies", "suppliers", "products", "members", "decisions", "locations", "sources"]);
  const [mode, setMode] = useState<"diagram" | "list">("diagram");
  const [kindFilter, setKindFilter] = useState("all");

  const entities = useMemo(() => {
    const pool = [...data.contacts, ...data.companies, ...data.suppliers, ...data.products, ...data.members, ...data.decisions, ...data.locations];
    return pool.filter((record) => kindFilter === "all" || record.collection === kindFilter);
  }, [data, kindFilter]);

  const links = data.graphLinks.filter((link) => view !== "Exceptions" || link.status !== "confirmed");

  if (view === "Relationships") {
    return (
      <Stack gap={3}>
        <DataGrid
          rows={data.graphLinks}
          rowId={(row) => row.id}
          label="Relationships"
          columns={[
            { key: "title", header: "Relationship", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
            { key: "kind", header: "Kind", cell: (row) => String(row.fields.kind ?? "related") },
            { key: "confidence", header: "Confidence", cell: (row) => <Row gap={2}><Meter value={Number(row.fields.confidence ?? 0)} max={100} label={`${row.title} confidence`} tone={Number(row.fields.confidence ?? 0) < 70 ? "warning" : "success"} /><span className="ds-num">{String(row.fields.confidence ?? 0)}%</span></Row>, sortValue: (row) => Number(row.fields.confidence ?? 0) },
            { key: "evidence", header: "Evidence", cell: (row) => String(row.fields.sourceId || "No source record") },
            { key: "state", header: "State", cell: (row) => <Pill tone={row.status === "confirmed" ? "success" : row.status === "candidate" ? "warning" : "danger"}>{row.status}</Pill> },
          ]}
          onOpen={(id) => context.openOverlay("relationship editor", { id })}
        />
        <Notice tone="info" title="A link is only as good as its evidence">
          A relationship with no source record stays a candidate. Nothing in this workspace promotes a candidate link on its own.
        </Notice>
      </Stack>
    );
  }

  if (view === "Exceptions") {
    const candidates = data.graphLinks.filter((link) => link.status !== "confirmed");
    return (
      <Stack gap={4}>
        <Notice tone="warning" title="Merging is irreversible, so it waits for a person">
          {candidates.length} link{candidates.length === 1 ? "" : "s"} are uncertain. A merge rewrites which records point where, so a candidate below is never merged automatically — however high its score.
        </Notice>
        {candidates.length === 0 ? <Empty title="No exception" icon={<GitBranch size={20} />} /> : (
          <Grid>
            {candidates.map((link) => (
              <Card key={link.id} span={6} title={link.title} subtitle={link.summary} prov="unknown"
                actions={<Pill tone="warning">{String(link.fields.confidence ?? 0)}% match</Pill>}
                footer={<>
                  <Button size="sm" variant="secondary" onClick={() => context.openOverlay("merge preview", { id: link.id })}>Review the merge</Button>
                  <Button size="sm" variant="ghost" onClick={() => void context.mutate.patch(link.id, { status: "rejected" }, { event: `${link.title} rejected as a match` })}>Not a match</Button>
                </>}>
                <Properties rows={[
                  { label: "From", value: data.contacts.concat(data.companies, data.suppliers, data.locations).find((record) => record.id === link.fields.fromId)?.title ?? String(link.fields.fromId) },
                  { label: "To", value: data.companies.concat(data.products, data.facts).find((record) => record.id === link.fields.toId)?.title ?? String(link.fields.toId) },
                  { label: "Evidence", value: String(link.fields.sourceId || "None recorded") },
                ]} />
              </Card>
            ))}
          </Grid>
        )}
      </Stack>
    );
  }

  const nodes: GraphNode[] = entities.slice(0, 14).map((record, index, all) => {
    const angle = (index / all.length) * Math.PI * 2;
    return {
      id: record.id,
      label: record.title,
      kind: record.collection,
      x: 300 + Math.cos(angle) * 220,
      y: 210 + Math.sin(angle) * 160,
    };
  });

  return (
    <Stack gap={4}>
      <Row gap={3} wrap>
        <DiagramToggle mode={mode} onChange={setMode} note="The list carries the same entities, links and confidence as the drawing." diagramLabel="Graph" />
        <Field label="Filter">
          <Select value={kindFilter} onChange={(event) => setKindFilter(event.target.value)}>
            <option value="all">Every entity kind</option>
            {["contacts", "companies", "suppliers", "products", "members", "decisions", "locations"].map((kind) => <option key={kind} value={kind}>{kind}</option>)}
          </Select>
        </Field>
      </Row>

      {mode === "diagram" ? (
        <Card title="Entities and their links" subtitle={`${nodes.length} entities drawn · ${links.length} links`}>
          <svg viewBox="0 0 600 420" role="img" aria-label={`Business graph with ${nodes.length} entities and ${links.length} relationships. The list view carries the same information.`} style={{ width: "100%", height: 420 }}>
            {data.graphLinks.map((link) => {
              const from = nodes.find((node) => node.id === link.fields.fromId);
              const to = nodes.find((node) => node.id === link.fields.toId);
              if (!from || !to) return null;
              return (
                <line key={link.id} x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                  stroke={link.status === "confirmed" ? "var(--border-strong)" : "var(--warning)"}
                  strokeDasharray={link.status === "confirmed" ? undefined : "4 3"} strokeWidth={2} />
              );
            })}
            {nodes.map((node) => (
              <g key={node.id} tabIndex={0} role="button" aria-label={`${node.label}, ${node.kind}`}
                onClick={() => { context.select(node.id); context.openOverlay("Entity inspector", { id: node.id }); }}
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); context.select(node.id); context.openOverlay("Entity inspector", { id: node.id }); } }}
                style={{ cursor: "pointer" }}>
                <circle cx={node.x} cy={node.y} r={26} fill="var(--bg-raised)" stroke="var(--accent)" strokeWidth={2} />
                <text x={node.x} y={node.y + 44} textAnchor="middle" fontSize={11} fill="var(--fg-default)">{node.label.slice(0, 18)}</text>
                <text x={node.x} y={node.y + 4} textAnchor="middle" fontSize={10} fill="var(--fg-subtle)">{node.kind.slice(0, 4)}</text>
              </g>
            ))}
          </svg>
        </Card>
      ) : (
        <DataGrid
          rows={entities}
          rowId={(row) => row.id}
          label="Entities"
          columns={[
            { key: "title", header: "Entity", primary: true, cell: (row) => row.title, filterValue: (row) => row.title, sortValue: (row) => row.title },
            { key: "kind", header: "Kind", cell: (row) => row.collection },
            { key: "links", header: "Links", align: "end", cell: (row) => String(data.graphLinks.filter((link) => link.fields.fromId === row.id || link.fields.toId === row.id).length) },
            { key: "facts", header: "Assertions", align: "end", cell: (row) => String(data.facts.filter((fact) => String(fact.fields.subject ?? "").toLowerCase() === row.title.toLowerCase()).length) },
          ]}
          onOpen={(id) => { context.select(id); context.openOverlay("Entity inspector", { id }); }}
        />
      )}
    </Stack>
  );
}

/* ---------------------------- BRAIN-005 ---------------------------- */

function FactRegistry({ context, view }: { context: ScreenContext; view: "Verified" | "Proposed" | "Conflicting" | "Expired" }) {
  const data = useKnowledge();
  const rows = data.facts.filter((fact) => fact.status === view.toLowerCase());
  const { now } = useWorkspace();

  if (rows.length === 0) {
    return <Empty title={`No ${view.toLowerCase()} assertion`} icon={<BookOpen size={20} />}>The registry keeps every assertion with its source, its validity dates and who verified it.</Empty>;
  }

  return (
    <Stack gap={3}>
      {view === "Conflicting" && (
        <Notice tone="warning" title="Two incompatible assertions are never both current">
          A conflicting assertion is shown with its rival and neither is treated as authoritative until the conflict board resolves it.
        </Notice>
      )}
      <DataGrid
        rows={rows}
        rowId={(row) => row.id}
        label={`${view} assertions`}
        selectedId={context.selectedId}
        onSelect={(id) => context.select(id)}
        onOpen={(id) => context.openOverlay("Evidence drawer", { id })}
        columns={[
          { key: "title", header: "Assertion", primary: true, cell: (row) => row.title, sortValue: (row) => row.title, filterValue: (row) => `${row.title} ${row.summary}` },
          { key: "value", header: "Value", cell: (row) => String(row.fields.value ?? row.summary) },
          { key: "owner", header: "Canonical owner", cell: (row) => row.ownerName },
          { key: "confidence", header: "Confidence", cell: (row) => <Row gap={2}><Pill tone={CONFIDENCE_TONE[row.status] ?? "neutral"}>{row.status}</Pill><span className="ds-num">{String(row.fields.confidenceScore ?? 0)}%</span></Row>, sortValue: (row) => Number(row.fields.confidenceScore ?? 0) },
          { key: "valid", header: "Valid", cell: (row) => {
            const to = String(row.fields.validTo ?? "");
            const expired = to && new Date(to) < now;
            return <span>{context.date(String(row.fields.validFrom ?? row.at))}{to ? ` – ${context.date(to)}` : " – open"}{expired ? " · past" : ""}</span>;
          } },
          { key: "source", header: "Source", cell: (row) => sourceOf(data, row.fields.sourceId)?.title ?? <Pill tone="warning">No source</Pill> },
        ]}
        bulkActions={[
          {
            label: "Approve",
            disabled: (selected) => selected.some((fact) => !sourceOf(data, fact.fields.sourceId)),
            onRun: (selected) => selected.forEach((fact) => {
              void context.mutate.patch(fact.id, { status: "verified", fields: { ...fact.fields, confidence: "verified", verifiedBy: context.actor } }, { event: `${fact.title} verified by ${context.actor}` });
            }),
          },
          {
            label: "Reject",
            tone: "danger",
            onRun: (selected) => selected.forEach((fact) => {
              void context.mutate.patch(fact.id, { status: "rejected", fields: { ...fact.fields, confidence: "rejected", rejectedBy: context.actor } }, { event: `${fact.title} rejected by ${context.actor}` });
            }),
          },
        ]}
      />
      <Notice tone="info" title="Approving needs a source">
        An assertion with no source record cannot be approved in bulk or singly. The registry would have nothing to show a reader who asks why it is true.
      </Notice>
    </Stack>
  );
}

/* ---------------------------- BRAIN-006 ---------------------------- */

interface ConflictOption { id: string; value: string; factId: string; sourceId: string; recordedAt: string; note: string }

function conflictOptions(conflict: Rec | undefined): ConflictOption[] {
  const body = conflict?.body as { options?: ConflictOption[] } | undefined;
  return body?.options ?? [];
}

function KnowledgeConflicts({ context, view }: { context: ScreenContext; view: "Open" | "In review" | "Resolved" }) {
  const data = useKnowledge();
  const status = view === "In review" ? "in_review" : view.toLowerCase();
  const rows = data.conflicts.filter((conflict) => conflict.status === status);
  const domains = [...new Set(rows.map((conflict) => String(conflict.fields.domain ?? "general")))];

  if (rows.length === 0) {
    return <Empty title={`No ${view.toLowerCase()} conflict`} icon={<Scale size={20} />}>A conflict is recorded when two sources disagree about the same assertion.</Empty>;
  }

  return (
    <Stack gap={4}>
      <Notice tone="warning" title="A financial mismatch is not settled here">
        Where a conflict touches the ledger, this board records it and sends it to an accounting review. Choosing a side would change a figure without a posting behind it.
      </Notice>
      <Grid>
        {domains.map((domain) => (
          <Card key={domain} span={6} title={domain} subtitle={`${rows.filter((conflict) => conflict.fields.domain === domain).length} in this domain`}>
            <Stack gap={3}>
              {rows.filter((conflict) => conflict.fields.domain === domain).map((conflict) => {
                const options = conflictOptions(conflict);
                const ledger = conflict.fields.requiresLedgerReview === true;
                const affected = (conflict.body as { affected?: string[] } | undefined)?.affected ?? [];
                return (
                  <div key={conflict.id} className="ds-panel" style={{ padding: "var(--space-3)", borderLeft: `3px solid ${ledger ? "var(--danger)" : "var(--warning)"}` }}>
                    <Row gap={2} wrap>
                      <strong className="ds-grow">{conflict.title}</strong>
                      <Pill tone={String(conflict.fields.urgency) === "critical" ? "danger" : String(conflict.fields.urgency) === "high" ? "warning" : "neutral"}>{String(conflict.fields.urgency ?? "normal")}</Pill>
                    </Row>
                    <p className="ds-subtle">{conflict.summary}</p>
                    <Stack gap={1} style={{ marginBlock: "var(--space-2)" }}>
                      {options.map((option) => (
                        <Row key={option.id} gap={2}>
                          <Pill tone="neutral">{option.value}</Pill>
                          <span className="ds-subtle ds-grow ds-truncate">{option.note}</span>
                          <span className="ds-subtle">{context.date(option.recordedAt)}</span>
                        </Row>
                      ))}
                    </Stack>
                    {affected.length > 0 && (
                      <span className="ds-subtle">Affects {affected.map((id) => data.agents.find((agent) => agent.id === id)?.title ?? id).join(", ")}</span>
                    )}
                    <Row gap={2} wrap style={{ marginBlockStart: "var(--space-2)" }}>
                      <Button size="sm" variant="secondary" onClick={() => { context.select(conflict.id); context.openOverlay("Comparison drawer", { id: conflict.id }); }}>Compare sources</Button>
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={ledger || view === "Resolved"}
                        title={ledger ? "A ledger review decides this one" : undefined}
                        onClick={() => { context.select(conflict.id); context.openOverlay("resolution dialog", { id: conflict.id }); }}
                      >
                        Choose the source of truth
                      </Button>
                      {ledger && <Button size="sm" variant="outline-danger" onClick={() => { context.select(conflict.id); context.openOverlay("escalation", { id: conflict.id }); }}>Send to ledger review</Button>}
                    </Row>
                  </div>
                );
              })}
            </Stack>
          </Card>
        ))}
      </Grid>
    </Stack>
  );
}

/* ---------------------------- BRAIN-007 ---------------------------- */

function DecisionRegister({ context, view }: { context: ScreenContext; view: "All" | "Proposed" | "Approved" | "Superseded" }) {
  const data = useCollections(["decisions", "missions", "research"]);
  const rows = view === "All" ? data.decisions : data.decisions.filter((decision) => decision.status === view.toLowerCase());

  if (rows.length === 0) {
    return <Empty title={`No ${view.toLowerCase()} decision`} icon={<Scale size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Decision draft")}>Record a decision</Button>}>A decision records what was chosen, why, and who approved it.</Empty>;
  }

  return (
    <Stack gap={4}>
      {view === "Superseded" && (
        <Notice tone="info" title="Superseded decisions stay visible">
          A replaced decision is never deleted. It keeps its approvers and date so an audit can see what was true at the time.
        </Notice>
      )}
      <Grid>
        {rows.map((decision) => {
          const body = decision.body as { rationale?: string; alternatives?: string[]; outcome?: string } | undefined;
          return (
            <Card
              key={decision.id}
              span={6}
              title={decision.title}
              subtitle={`${decision.status} · ${String(decision.fields.domain ?? "general")}`}
              prov="human"
              actions={<Pill tone={decision.status === "approved" ? "success" : decision.status === "superseded" ? "neutral" : "info"}>{decision.status}</Pill>}
              footer={<>
                <Button size="sm" variant="secondary" onClick={() => { context.select(decision.id); context.openOverlay("approval detail", { id: decision.id }); }}>Rationale</Button>
                <Button size="sm" variant="ghost" disabled={decision.status === "superseded"} onClick={() => { context.select(decision.id); context.openOverlay("impact review", { id: decision.id }); }}>Supersede</Button>
                <span className="ds-grow" />
                <span className="ds-subtle">{context.date(decision.at ?? decision.updatedAt)}</span>
              </>}
            >
              <Stack gap={2}>
                <p className="ds-prose">{decision.summary}</p>
                <Properties rows={[
                  { label: "Approvers", value: String(decision.fields.approvers || "None recorded") },
                  { label: "Related mission", value: data.missions.find((mission) => mission.id === decision.fields.missionId)?.title ?? "None" },
                  { label: "Outcome", value: body?.outcome || "Not recorded yet" },
                ]} />
              </Stack>
            </Card>
          );
        })}
      </Grid>
    </Stack>
  );
}

/* ---------------------------- BRAIN-008 ---------------------------- */

interface BrandRule { id: string; rule: string; source: string; status: string }

function BrandIntelligence({ context, view }: { context: ScreenContext; view: "Identity" | "Colours" | "Typography" | "Voice" | "Assets" | "Rules" }) {
  const data = useCollections(["brands", "assets", "sources", "facts"]);
  const approved = data.brands.find((brand) => brand.status !== "proposed") ?? data.brands[0];
  const proposals = data.brands.filter((brand) => brand.status === "proposed");
  const proposalBody = proposals[0]?.body as { colours?: { name: string; value: string; approved: boolean }[]; rules?: BrandRule[]; voice?: string } | undefined;

  if (!approved) return <Empty title="No brand record" icon={<Palette size={20} />} />;

  const approvedFields = approved.fields;
  const body = approved.body as { voice?: string } | undefined;

  if (view === "Colours") {
    const colours = Object.entries(approvedFields).filter(([, value]) => typeof value === "string" && /^#[0-9A-Fa-f]{6}$/.test(String(value)));
    return (
      <Stack gap={4}>
        <Notice tone="warning" title="An extraction never overwrites an approved token">
          Proposed colours sit beside the approved set until a person approves them. Nothing read out of a document changes a token on its own.
        </Notice>
        <Grid>
          <Card span={6} title="Approved tokens" subtitle={`${colours.length} recorded`}>
            <Stack gap={2}>
              {colours.map(([name, value]) => (
                <Row key={name} gap={3}>
                  <span style={{ width: 36, height: 24, borderRadius: 6, background: String(value), border: "1px solid var(--border-default)" }} aria-hidden="true" />
                  <span className="ds-grow">{name}</span>
                  <code className="ds-num">{String(value)}</code>
                </Row>
              ))}
            </Stack>
          </Card>
          <Card span={6} title="Proposed" subtitle={`${(proposalBody?.colours ?? []).filter((colour) => !colour.approved).length} awaiting a person`} prov="agent">
            <Stack gap={2}>
              {(proposalBody?.colours ?? []).map((colour) => (
                <Row key={colour.name} gap={3}>
                  <span style={{ width: 36, height: 24, borderRadius: 6, background: colour.value, border: "1px solid var(--border-default)" }} aria-hidden="true" />
                  <span className="ds-grow">{colour.name}</span>
                  <Pill tone={colour.approved ? "success" : "warning"}>{colour.approved ? "Approved" : "Proposed"}</Pill>
                  {!colour.approved && <Button size="sm" variant="secondary" onClick={() => context.openOverlay("impact preview", { token: colour.name })}>Review</Button>}
                </Row>
              ))}
              {(proposalBody?.colours ?? []).length === 0 && <span className="ds-subtle">Nothing proposed.</span>}
            </Stack>
          </Card>
        </Grid>
      </Stack>
    );
  }

  if (view === "Typography") {
    return (
      <Card title="Typefaces" subtitle="What the workspace records">
        <Stack gap={3}>
          <Properties rows={[
            { label: "Interface", value: "The workspace typeface, set in the design system" },
            { label: "Recorded brand typeface", value: String(approvedFields.typeface ?? "Not recorded") },
            { label: "Source", value: data.sources.find((source) => source.id === String(proposals[0]?.fields.extractedFrom ?? ""))?.title ?? "No type specimen in the source library" },
          ]} />
          <Notice tone="info" title="Nothing is inferred from a logo">
            A typeface is recorded only when a document states it. This workspace does not guess one from an image.
          </Notice>
        </Stack>
      </Card>
    );
  }

  if (view === "Voice") {
    const voiceFact = data.facts.find((fact) => fact.fields.domain === "brand");
    return (
      <Stack gap={4}>
        <Card title="Voice" subtitle="From the recorded note" prov="human">
          <p className="ds-prose" style={{ fontSize: "var(--text-lg)" }}>{body?.voice ?? proposalBody?.voice ?? "No voice is recorded."}</p>
        </Card>
        {voiceFact && (
          <Card title="Registered as an assertion" subtitle={`${voiceFact.status} · ${String(voiceFact.fields.confidenceScore ?? 0)}% confidence`}>
            <Properties rows={[
              { label: "Value", value: String(voiceFact.fields.value) },
              { label: "Source", value: data.sources.find((source) => source.id === String(voiceFact.fields.sourceId))?.title ?? "No source" },
              { label: "Recorded", value: context.date(voiceFact.at ?? voiceFact.updatedAt) },
            ]} />
          </Card>
        )}
      </Stack>
    );
  }

  if (view === "Assets") {
    return data.assets.length === 0
      ? <Empty title="No brand asset" icon={<Palette size={20} />} action={<Button variant="secondary" onClick={() => context.openOverlay("asset selector")}>Choose an asset</Button>} />
      : (
        <DataGrid
          rows={data.assets}
          rowId={(row) => row.id}
          label="Brand assets"
          columns={[
            { key: "title", header: "Asset", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
            { key: "kind", header: "Kind", cell: (row) => String(row.fields.kind ?? "asset") },
            { key: "licence", header: "Licence", cell: (row) => String(row.fields.licence ?? "Not recorded") },
            { key: "updated", header: "Updated", align: "end", cell: (row) => context.relative(row.updatedAt) },
          ]}
          onOpen={() => context.openOverlay("asset selector")}
        />
      );
  }

  if (view === "Rules") {
    const rules = proposalBody?.rules ?? [];
    return (
      <Stack gap={4}>
        {rules.length === 0 ? <Empty title="No rule recorded" /> : (
          <DataGrid
            rows={rules}
            rowId={(row) => row.id}
            label="Brand rules"
            filterable={false}
            columns={[
              { key: "rule", header: "Rule", primary: true, cell: (row) => row.rule },
              { key: "source", header: "Evidence", cell: (row) => data.sources.find((source) => source.id === row.source)?.title ?? row.source },
              { key: "status", header: "State", cell: (row) => <Pill tone={row.status === "approved" ? "success" : "warning"}>{row.status}</Pill> },
            ]}
            onOpen={(id) => context.openOverlay("Brand rule editor", { id })}
          />
        )}
        <Button variant="secondary" onClick={() => context.openOverlay("Brand rule editor")}>Add a rule</Button>
      </Stack>
    );
  }

  return (
    <Grid>
      <Card span={7} title={approved.title} subtitle={approved.summary} prov="human">
        <Stack gap={3}>
          <Properties rows={[
            { label: "Approved variant", value: approved.title },
            { label: "Proposed variants", value: String(proposals.length) },
            { label: "Voice", value: body?.voice ?? "Not recorded" },
          ]} />
          <Notice tone="info" title="A brand record is knowledge, not a theme">
            What is recorded here is what the company has decided about itself. It does not restyle this workspace.
          </Notice>
        </Stack>
      </Card>
      <Card span={5} title="Regional variants" subtitle={`${proposals.length} proposed`} prov="agent">
        {proposals.length === 0 ? <Empty title="No variant proposed" /> : (
          <Stack gap={2}>
            {proposals.map((proposal) => (
              <Row key={proposal.id} gap={2} className="ds-panel" style={{ padding: "var(--space-2)" }}>
                <div className="ds-grow"><strong>{proposal.title}</strong><div className="ds-subtle">{proposal.summary}</div></div>
                <Button size="sm" variant="secondary" onClick={() => context.openOverlay("impact preview", { id: proposal.id })}>Review</Button>
              </Row>
            ))}
          </Stack>
        )}
      </Card>
    </Grid>
  );
}

/* ---------------------------- BRAIN-009 ---------------------------- */

interface Grant { agentId: string; groups: string[]; note: string }

function KnowledgePermissions({ context, view }: { context: ScreenContext; view: "Roles" | "Source grants" | "Retention" | "Activity" }) {
  const data = useKnowledge();
  const events = useCollection("timelineEvents");
  const sensitivity = data.policies.find((policy) => policy.fields.kind === "sensitivity");
  const grantPolicy = data.policies.find((policy) => policy.fields.kind === "grants");
  const retention = data.policies.find((policy) => policy.fields.kind === "retention");
  const groups = (sensitivity?.body as { groups?: { id: string; label: string; roles: string[]; agents: boolean }[] } | undefined)?.groups ?? [];
  const grants = (grantPolicy?.body as { grants?: Grant[] } | undefined)?.grants ?? [];

  if (view === "Source grants") {
    return (
      <Stack gap={4}>
        <DataGrid
          rows={grants}
          rowId={(row) => row.agentId}
          label="Source grants"
          filterable={false}
          columns={[
            { key: "agent", header: "AI employee", primary: true, cell: (row) => data.agents.find((agent) => agent.id === row.agentId)?.title ?? row.agentId },
            { key: "groups", header: "Groups", cell: (row) => <Row gap={1} wrap>{row.groups.map((group) => <Pill key={group} tone={group === "confidential" ? "warning" : "neutral"}>{group}</Pill>)}</Row> },
            { key: "sources", header: "Sources in reach", align: "end", cell: (row) => String(data.sources.filter((source) => row.groups.includes(String(source.fields.classification ?? "internal")) && source.status === "indexed").length) },
            { key: "why", header: "Why", cell: (row) => row.note },
          ]}
          onOpen={(id) => { context.select(id); context.openOverlay("Grant dialog", { agentId: id }); }}
        />
        <Row gap={2} wrap>
          <Button variant="secondary" onClick={() => context.openOverlay("Grant dialog")}>Adjust a grant</Button>
          <Button variant="ghost" onClick={() => context.openOverlay("revoke confirmation")}>Revoke a grant</Button>
        </Row>
      </Stack>
    );
  }

  if (view === "Retention") {
    const holds = (retention?.body as { holds?: { id: string; reason: string; setBy: string; at: string }[] } | undefined)?.holds ?? [];
    return (
      <Stack gap={4}>
        <Properties rows={[
          { label: "Sources", value: `${String(retention?.fields.sourceYears ?? 6)} years` },
          { label: "Conversations", value: `${String(retention?.fields.conversationYears ?? 2)} years` },
          { label: "Data residency", value: `${String(sensitivity?.fields.residency ?? "This browser only")}` },
          { label: "Deletion", value: "A record under a hold cannot be deleted from any screen" },
        ]} />
        <Card title="Legal holds" subtitle={`${holds.length} in force`}>
          {holds.length === 0 ? <Empty title="No hold" /> : (
            <Stack gap={2}>
              {holds.map((hold) => (
                <Row key={hold.id} gap={2} className="ds-panel" style={{ padding: "var(--space-2)" }}>
                  <div className="ds-grow"><strong>{hold.id}</strong><div className="ds-subtle">{hold.reason}</div></div>
                  <span className="ds-subtle">{hold.setBy} · {context.date(hold.at)}</span>
                </Row>
              ))}
            </Stack>
          )}
        </Card>
        <Notice tone="warning" title="Residency is this browser">
          Everything is in this browser's storage. There is no second region to choose and no copy anywhere else.
        </Notice>
      </Stack>
    );
  }

  if (view === "Activity") {
    const rows = events.filter((event) => String(event.fields.kind ?? "").includes("knowledge") || event.summary.toLowerCase().includes("source"));
    return rows.length === 0 ? (
      <Stack gap={3}>
        <Notice tone="info" title="Retrieval activity is recorded as it happens">
          Nothing has read a restricted source in this workspace yet. When an answer reads a source, the records it read are named in the thread it answered.
        </Notice>
        <Button variant="secondary" onClick={() => context.openOverlay("simulation report")}>Simulate a retrieval</Button>
      </Stack>
    ) : (
      <DataGrid rows={rows} rowId={(row) => row.id} label="Knowledge activity" columns={[
        { key: "title", header: "Event", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
        { key: "detail", header: "Detail", cell: (row) => row.summary },
        { key: "at", header: "When", align: "end", cell: (row) => context.relative(row.at ?? row.updatedAt) },
      ]} />
    );
  }

  return (
    <Stack gap={4}>
      <Notice tone="warning" title="These are interface boundaries">
        A group shapes what a role view and an AI contract are offered in this browser. It is not account security, and a future service would have to enforce it server-side.
      </Notice>
      <DataGrid
        rows={groups}
        rowId={(row) => row.id}
        label="Sensitivity groups"
        filterable={false}
        columns={[
          { key: "label", header: "Group", primary: true, cell: (row) => row.label },
          { key: "roles", header: "Role views", cell: (row) => row.roles.join(", ") },
          { key: "agents", header: "AI retrieval", cell: (row) => <Pill tone={row.agents ? "success" : "warning"}>{row.agents ? "Allowed" : "Excluded"}</Pill> },
          { key: "sources", header: "Sources", align: "end", cell: (row) => String(data.sources.filter((source) => String(source.fields.classification ?? "internal") === row.id).length) },
        ]}
        onOpen={() => context.openOverlay("Grant dialog")}
      />
    </Stack>
  );
}

/* ---------------------------- BRAIN-010 ---------------------------- */

function IntakeCentre({ context, view }: { context: ScreenContext; view: "Incoming" | "Processing" | "Review" | "Completed" | "Failed" }) {
  const sources = useCollection("sources");
  const map: Record<string, string[]> = {
    Incoming: ["quarantined"], Processing: ["processing"], Review: ["review"], Completed: ["indexed"], Failed: ["failed", "not_connected"],
  };
  const rows = sources.filter((source) => map[view].includes(source.status));

  return (
    <Stack gap={4}>
      <StatRow>
        <Stat label="Held for review" value={String(sources.filter((source) => source.status === "quarantined").length)} prov="unknown" meta="Unscanned, out of retrieval" />
        <Stat label="Awaiting a person" value={String(sources.filter((source) => source.status === "review").length)} prov="agent" meta="Extraction proposed" />
        <Stat label="Indexed" value={String(sources.filter((source) => source.status === "indexed").length)} prov="posted" meta="Available to answers" />
        <Stat label="Failed" value={String(sources.filter((source) => source.status === "failed").length)} prov="unknown" meta="Isolated with a reason" />
      </StatRow>

      {view === "Incoming" && (
        <Notice tone="warning" title="Nothing is scanned here">
          No virus scanner or sandbox service is connected. A file that arrives is recorded, isolated and kept out of every answer until a person opens it and says it is safe.
        </Notice>
      )}
      {view === "Processing" && (
        <Notice tone="info" title="Parsing happens in this browser">
          Text is read from the file by this browser when the file is a plain-text format. Anything else is recorded by name and left for a person to transcribe.
        </Notice>
      )}

      {rows.length === 0 ? (
        <Empty
          title={`Nothing is ${view.toLowerCase()}`}
          icon={<Inbox size={20} />}
          action={view === "Incoming" ? <Button variant="primary" onClick={() => context.openOverlay("File chooser")}>Add a file</Button> : undefined}
        >
          {view === "Failed" ? "No file has failed. A failure is kept here with the reason rather than being retried silently." : "Files move through this queue as a person works them."}
        </Empty>
      ) : (
        <DataGrid
          rows={rows}
          rowId={(row) => row.id}
          label={`${view} intake`}
          selectedId={context.selectedId}
          onSelect={(id) => context.select(id)}
          onOpen={(id) => context.openOverlay("import review", { id })}
          rowTone={(row) => (row.status === "failed" ? "danger" : row.status === "quarantined" ? "warning" : undefined)}
          columns={[
            { key: "title", header: "File", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
            { key: "kind", header: "Kind", cell: (row) => String(row.fields.kind ?? "file") },
            { key: "why", header: "State", cell: (row) => row.summary },
            { key: "owner", header: "Owner", cell: (row) => row.ownerName },
            { key: "when", header: "Arrived", align: "end", cell: (row) => context.relative(row.at ?? row.createdAt) },
          ]}
          bulkActions={[
            {
              label: "Approve the extraction",
              disabled: (selected) => selected.some((source) => source.status === "failed"),
              onRun: (selected) => selected.forEach((source) => {
                void context.mutate.patch(source.id, { status: "indexed", fields: { ...source.fields, scanned: true, indexing: "indexed", reviewedBy: context.actor } }, { event: `${source.title} reviewed and indexed by ${context.actor}` });
              }),
            },
          ]}
        />
      )}
    </Stack>
  );
}

/* ====================================================================== *
 * Overlays
 * ====================================================================== */

function KnowledgeInspector({ context }: { context: ScreenContext }) {
  const data = useKnowledge();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(payload?.id ?? "");
  const pool = [...data.facts, ...data.sources];
  const rows = pool.filter((record) => !query || record.title.toLowerCase().includes(query.toLowerCase()) || record.summary.toLowerCase().includes(query.toLowerCase()));
  const record = pool.find((item) => item.id === (selected || payload?.id));
  return (
    <Stack gap={4}>
      <Field label="Search assertions and sources" hint="Searches titles and summaries of records in this organisation only.">
        <TextInput type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
      </Field>
      {record ? (
        <Card title={record.title} subtitle={`${record.collection} · ${record.status}`} prov={record.collection === "facts" ? "agent" : "human"}>
          <Properties rows={record.collection === "facts" ? [
            { label: "Value", value: String(record.fields.value ?? record.summary) },
            { label: "Confidence", value: <Pill tone={CONFIDENCE_TONE[record.status] ?? "neutral"}>{record.status} · {String(record.fields.confidenceScore ?? 0)}%</Pill> },
            { label: "Source", value: sourceOf(data, record.fields.sourceId)?.title ?? "No source record" },
            { label: "Valid from", value: context.date(String(record.fields.validFrom ?? record.at)) },
            { label: "Canonical owner", value: record.ownerName },
          ] : [
            { label: "Kind", value: String(record.fields.kind ?? "file") },
            { label: "Indexing", value: record.status },
            { label: "Freshness", value: context.date(String(record.fields.freshness ?? record.updatedAt)) },
            { label: "Assertions citing it", value: String(data.facts.filter((fact) => fact.fields.sourceId === record.id).length) },
          ]} />
        </Card>
      ) : <span className="ds-subtle">Choose a record to see where it came from.</span>}
      <Stack gap={1}>
        {rows.slice(0, 12).map((item) => (
          <button key={item.id} type="button" className="ds-record-card" onClick={() => setSelected(item.id)}>
            <Row gap={2}><strong className="ds-grow" style={{ textAlign: "start" }}>{item.title}</strong><Pill tone={item.collection === "facts" ? "accent" : "neutral"}>{item.collection}</Pill></Row>
            <span className="ds-subtle">{item.summary}</span>
          </button>
        ))}
        {rows.length === 0 && <span className="ds-subtle">Nothing matches.</span>}
      </Stack>
    </Stack>
  );
}

function SuggestionApproval({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useKnowledge();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const fact = data.facts.find((item) => item.id === payload?.id);
  const source = fact ? sourceOf(data, fact.fields.sourceId) : undefined;
  if (!fact) return <Empty title="Choose a suggestion" />;
  return (
    <Stack gap={4}>
      <Card title={fact.title} subtitle={fact.summary} prov="agent">
        <Properties rows={[
          { label: "Proposed value", value: String(fact.fields.value ?? "—") },
          { label: "Evidence", value: source?.title ?? "No source record" },
          { label: "Source state", value: source ? <Pill tone={source.status === "indexed" ? "success" : "warning"}>{source.status}</Pill> : <Pill tone="danger">Missing</Pill> },
          { label: "Confidence", value: `${String(fact.fields.confidenceScore ?? 0)}%` },
        ]} />
      </Card>
      {!source && <Notice tone="danger" title="This cannot be approved">There is no source record behind the claim, so nothing could be shown to a reader who asks why it is true.</Notice>}
      {source?.status === "quarantined" && <Notice tone="warning" title="The source is held">It has not been reviewed, so a fact that cites it cannot be verified yet.</Notice>}
      <Row gap={2}>
        <Button
          variant="primary"
          disabled={!source || source.status === "quarantined"}
          onClick={async () => {
            await context.mutate.patch(fact.id, { status: "verified", fields: { ...fact.fields, confidence: "verified", verifiedBy: context.actor, verifiedAt: context.now.toISOString().slice(0, 10) } }, { expectRevision: fact.revision, event: `${fact.title} verified by ${context.actor}` });
            context.toast("Verified", `${fact.title} is authoritative, with ${source?.title} as its evidence.`);
            close();
          }}
        >
          Verify with this evidence
        </Button>
        <Button variant="ghost" onClick={async () => {
          await context.mutate.patch(fact.id, { status: "rejected", fields: { ...fact.fields, confidence: "rejected", rejectedBy: context.actor } }, { expectRevision: fact.revision, event: `${fact.title} rejected by ${context.actor}` });
          context.toast("Rejected", "It stays in the registry marked rejected, with who rejected it.");
          close();
        }}>Reject</Button>
      </Row>
    </Stack>
  );
}

function UploadDialog({ context, close }: { context: ScreenContext; close: () => void }) {
  const [files, setFiles] = useState<{ name: string; size: number; type: string; text?: string; failed?: string }[]>([]);
  const [classification, setClassification] = useState("internal");
  const MAX = 5_000_000;
  return (
    <Stack gap={4}>
      <Notice tone="warning" title="Files are isolated on arrival">
        No scanner is connected. A file is recorded with its name, size and type, held as quarantined, and kept out of every answer until a person reviews it. Plain-text formats are read in this browser; nothing is uploaded.
      </Notice>
      <Field label="Choose files">
        <input
          type="file"
          multiple
          className="ds-input"
          aria-label="Choose files to register as sources"
          onChange={async (event) => {
            const picked = [...(event.target.files ?? [])];
            const next: { name: string; size: number; type: string; text?: string; failed?: string }[] = [];
            for (const file of picked) {
              if (file.size > MAX) {
                next.push({ name: file.name, size: file.size, type: file.type || "unknown", failed: `The file is ${(file.size / 1_000_000).toFixed(1)} MB, over the 5 MB this browser will read. It is isolated and reported rather than partly parsed.` });
                continue;
              }
              const readable = /^text\/|json|csv|markdown/.test(file.type) || /\.(txt|csv|md|json)$/i.test(file.name);
              if (!readable) {
                next.push({ name: file.name, size: file.size, type: file.type || "unknown", failed: "This format cannot be read in the browser. The file is recorded by name and left for a person to transcribe." });
                continue;
              }
              const text = await file.text().catch(() => undefined);
              next.push({ name: file.name, size: file.size, type: file.type || "text/plain", text: text?.slice(0, 2000) });
            }
            setFiles(next);
          }}
        />
      </Field>
      <Field label="Classification">
        <Select value={classification} onChange={(event) => setClassification(event.target.value)}>
          <option value="public">Public</option>
          <option value="internal">Internal</option>
          <option value="confidential">Confidential — excluded from AI retrieval</option>
        </Select>
      </Field>
      {files.map((file) => (
        <Card key={file.name} title={file.name} subtitle={`${(file.size / 1024).toFixed(0)} kB · ${file.type}`} prov={file.failed ? "unknown" : "human"}>
          {file.failed ? <Notice tone="danger" title="Isolated">{file.failed}</Notice> : <p className="ds-subtle" style={{ whiteSpace: "pre-wrap", maxHeight: 120, overflow: "auto" }}>{file.text?.slice(0, 400) || "No text content."}</p>}
        </Card>
      ))}
      <Button
        variant="primary"
        disabled={files.length === 0}
        onClick={async () => {
          for (const file of files) {
            await context.mutate.create({
              collection: "sources",
              title: file.name,
              status: file.failed ? "failed" : "quarantined",
              summary: file.failed ?? `Read in this browser. ${(file.size / 1024).toFixed(0)} kB of ${file.type}. Held until a person reviews it.`,
              at: context.now.toISOString(),
              fields: { kind: "file", classification, scanned: false, indexing: file.failed ? "failed" : "quarantined", freshness: context.now.toISOString().slice(0, 10), pages: 0 },
              body: { extracted: file.text ? file.text.split("\n").filter(Boolean).slice(0, 12) : [], note: file.failed ?? "No scanner is connected, so this file is out of retrieval until reviewed." },
            }, `Source registered: ${file.name}`);
          }
          context.toast("Registered", `${files.length} file${files.length === 1 ? "" : "s"} recorded. Nothing was uploaded and nothing is in an answer yet.`);
          close();
        }}
      >
        Register {files.length || ""} source{files.length === 1 ? "" : "s"}
      </Button>
    </Stack>
  );
}

function SourceDetailDrawer({ context }: { context: ScreenContext }) {
  const source = useRecord(context.selectedId);
  const data = useKnowledge();
  if (!source || source.collection !== "sources") return <Empty title="Select a source first" />;
  const body = source.body as { extracted?: string[]; note?: string } | undefined;
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Kind", value: String(source.fields.kind ?? "file") },
        { label: "Classification", value: String(source.fields.classification ?? "internal") },
        { label: "Indexing", value: <Pill tone={source.status === "indexed" ? "success" : "warning"}>{source.status}</Pill> },
        { label: "Freshness", value: context.date(String(source.fields.freshness ?? source.updatedAt)) },
        { label: "Assertions", value: String(data.facts.filter((fact) => fact.fields.sourceId === source.id).length) },
      ]} />
      {body?.note && <Notice tone="warning">{body.note}</Notice>}
      <Card title="Extracted" pad="tight">
        {(body?.extracted ?? []).length === 0 ? <span className="ds-subtle">Nothing was read from this source.</span> : (
          <ul className="ds-prose" style={{ paddingInlineStart: "1.1rem" }}>{(body?.extracted ?? []).map((line) => <li key={line}>{line}</li>)}</ul>
        )}
      </Card>
      <Button variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/brain/sources/${source.id}`)}>Open the full record</Button>
    </Stack>
  );
}

function RetentionDialog({ context, close }: { context: ScreenContext; close: () => void }) {
  const source = useRecord(context.selectedId);
  const policies = useCollection("policies");
  const retention = policies.find((policy) => policy.fields.kind === "retention");
  if (!source) return <Empty title="Select a source first" />;
  const facts = useCollection("facts").filter((fact) => fact.fields.sourceId === source.id);
  return (
    <Stack gap={4}>
      <Notice tone="warning" title="Retiring a source does not delete it">
        {source.title} stays in this workspace for the retention schedule ({String(retention?.fields.sourceYears ?? 6)} years) so that assertions citing it keep their evidence. Retiring removes it from retrieval only.
      </Notice>
      {facts.length > 0 && (
        <Notice tone="danger" title={`${facts.length} assertion${facts.length === 1 ? "" : "s"} cite this source`}>
          {facts.map((fact) => fact.title).join(", ")}. They will show their evidence as retired, which is a reason to re-verify them.
        </Notice>
      )}
      <Button
        variant="danger"
        onClick={async () => {
          await context.mutate.patch(source.id, { status: "retired", fields: { ...source.fields, indexing: "retired", retiredBy: context.actor } }, { expectRevision: source.revision, event: `${source.title} retired from retrieval` });
          context.toast("Retired", "It is out of retrieval and still on the record for its retention period.");
          close();
        }}
      >
        Retire this source
      </Button>
    </Stack>
  );
}

function CorrectionForm({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string; line?: string; mode?: string } | undefined;
  const data = useKnowledge();
  const source = useRecord(context.params.id) ?? data.sources[0];
  const body = source?.body as { extracted?: string[]; corrections?: Correction[] } | undefined;
  const original = payload?.line ?? (body?.extracted ?? [])[0] ?? "";
  const [value, setValue] = useState(original);
  const [note, setNote] = useState("");
  const annotate = payload?.mode === "annotate";
  if (!source) return <Empty title="No source" />;
  return (
    <form
      id="correction-form"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const corrections = body?.corrections ?? [];
        const extracted = body?.extracted ?? [];
        const correction: Correction = { id: `corr-${Date.now()}`, at: context.now.toISOString(), by: context.actor, from: original, to: annotate ? original : value, note };
        await context.mutate.patch(source.id, {
          body: {
            ...(source.body as object),
            extracted: annotate ? extracted : extracted.map((line) => (line === original ? value : line)),
            corrections: [...corrections, correction],
          },
        }, { expectRevision: source.revision, event: annotate ? `Annotation added to ${source.title}` : `Extraction corrected on ${source.title}` });
        context.toast(annotate ? "Annotation recorded" : "Correction recorded", "The original line and who changed it are kept in the correction history.");
        close();
      }}
    >
      <Notice tone="info" title="Corrections are append-only">
        The original extraction and this change are both kept, with your name and the time. Nothing is overwritten in place.
      </Notice>
      <Field label="Original line"><TextInput value={original} readOnly /></Field>
      {!annotate && <Field label="Corrected line" required><TextInput value={value} onChange={(event) => setValue(event.target.value)} required /></Field>}
      <Field label={annotate ? "Annotation" : "Why"} required><TextArea value={note} rows={3} onChange={(event) => setNote(event.target.value)} required /></Field>
    </form>
  );
}

function PermissionEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const source = useRecord((context.overlayPayload as { id?: string } | undefined)?.id ?? context.params.id ?? context.selectedId);
  const [classification, setClassification] = useState(String(source?.fields.classification ?? "internal"));
  if (!source) return <Empty title="No source selected" />;
  return (
    <Stack gap={4}>
      <Field label="Classification" hint="Confidential sources are excluded from AI retrieval entirely.">
        <Select value={classification} onChange={(event) => setClassification(event.target.value)}>
          <option value="public">Public</option>
          <option value="internal">Internal</option>
          <option value="confidential">Confidential</option>
        </Select>
      </Field>
      <Notice tone="warning" title="Changing this changes what answers can read">
        An answer composed after this change reads the new set. Answers already given keep the records they named at the time.
      </Notice>
      <Button
        variant="primary"
        onClick={async () => {
          await context.mutate.patch(source.id, { fields: { ...source.fields, classification } }, { expectRevision: source.revision, event: `${source.title} reclassified as ${classification}` });
          context.toast("Classification changed", `${source.title} is now ${classification}.`);
          close();
        }}
      >
        Save classification
      </Button>
    </Stack>
  );
}

function DeleteRequest({ context, close }: { context: ScreenContext; close: () => void }) {
  const source = useRecord(context.params.id ?? context.selectedId);
  const facts = useCollection("facts").filter((fact) => fact.fields.sourceId === source?.id);
  const [reason, setReason] = useState("");
  if (!source) return <Empty title="No source selected" />;
  const blocked = facts.length > 0;
  return (
    <Stack gap={4}>
      {blocked ? (
        <Notice tone="danger" title="This source cannot be deleted yet">
          {facts.length} assertion{facts.length === 1 ? "" : "s"} cite it. Deleting it would leave them without evidence. Re-verify or retire them first.
        </Notice>
      ) : (
        <Notice tone="warning" title="Deletion is recorded as a request">
          Retention applies to sources. The request is logged with your reason; a person with deletion authority carries it out.
        </Notice>
      )}
      <Field label="Reason" required><TextArea value={reason} rows={3} onChange={(event) => setReason(event.target.value)} required /></Field>
      <Button
        variant="outline-danger"
        disabled={blocked || !reason.trim()}
        onClick={async () => {
          await context.mutate.log(`${context.actor} requested deletion of ${source.title}: ${reason}`, { entityId: source.id, type: "source.delete_requested" });
          context.toast("Request recorded", "It is in the activity log with your reason.");
          close();
        }}
      >
        Record the request
      </Button>
    </Stack>
  );
}

function EntityInspector({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const record = useRecord(payload?.id ?? context.selectedId);
  const data = useCollections(["graphLinks", "facts"]);
  if (!record) return <Empty title="Choose an entity" />;
  const links = data.graphLinks.filter((link) => link.fields.fromId === record.id || link.fields.toId === record.id);
  const facts = data.facts.filter((fact) => String(fact.fields.subject ?? "").toLowerCase() === record.title.toLowerCase());
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Entity", value: record.title },
        { label: "Kind", value: record.collection },
        { label: "Status", value: record.status },
        { label: "Links", value: String(links.length) },
        { label: "Assertions", value: String(facts.length) },
      ]} />
      {links.length > 0 && (
        <Card title="Links" pad="tight">
          <Stack gap={2}>
            {links.map((link) => (
              <Row key={link.id} gap={2}>
                <span className="ds-grow ds-truncate">{link.title}</span>
                <Pill tone={link.status === "confirmed" ? "success" : "warning"}>{String(link.fields.confidence ?? 0)}%</Pill>
              </Row>
            ))}
          </Stack>
        </Card>
      )}
      {facts.length > 0 && (
        <Card title="What is asserted about it" pad="tight">
          <Stack gap={2}>
            {facts.map((fact) => (
              <Row key={fact.id} gap={2}>
                <span className="ds-grow ds-truncate">{String(fact.fields.predicate)}: {String(fact.fields.value)}</span>
                <Pill tone={CONFIDENCE_TONE[fact.status] ?? "neutral"}>{fact.status}</Pill>
              </Row>
            ))}
          </Stack>
        </Card>
      )}
    </Stack>
  );
}

function MergePreview({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const link = useRecord(payload?.id ?? context.selectedId);
  const from = useRecord(String(link?.fields.fromId ?? ""));
  const to = useRecord(String(link?.fields.toId ?? ""));
  const [confirmed, setConfirmed] = useState(false);
  if (!link) return <Empty title="Choose a merge candidate" />;
  const confidence = Number(link.fields.confidence ?? 0);
  return (
    <Stack gap={4}>
      <Notice tone={confidence < 80 ? "warning" : "info"} title={`${confidence}% match, with ${link.fields.sourceId ? "one source" : "no source"} behind it`}>
        A merge rewrites which records point where and cannot be undone from this screen. Below {80}% the workspace will not treat it as the same entity without your confirmation.
      </Notice>
      <Grid>
        <Card span={6} title={from?.title ?? String(link.fields.fromId)} subtitle={from?.collection}><p className="ds-prose">{from?.summary}</p></Card>
        <Card span={6} title={to?.title ?? String(link.fields.toId)} subtitle={to?.collection}><p className="ds-prose">{to?.summary}</p></Card>
      </Grid>
      <Checkbox label="I have checked both records and they are the same entity" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
      <Row gap={2}>
        <Button
          variant="primary"
          disabled={!confirmed}
          onClick={async () => {
            await context.mutate.patch(link.id, { status: "confirmed", fields: { ...link.fields, confidence: 100, confirmedBy: context.actor } }, { expectRevision: link.revision, event: `${link.title} confirmed as the same entity by ${context.actor}` });
            context.toast("Link confirmed", "The two records are recorded as the same entity, with who confirmed it.");
            close();
          }}
        >
          Confirm the link
        </Button>
        <Button variant="ghost" onClick={async () => {
          await context.mutate.patch(link.id, { status: "rejected" }, { expectRevision: link.revision, event: `${link.title} rejected` });
          context.toast("Rejected", "The candidate is recorded as not a match.");
          close();
        }}>Not a match</Button>
      </Row>
    </Stack>
  );
}

function RelationshipEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const link = useRecord(payload?.id ?? context.selectedId);
  const [kind, setKind] = useState(String(link?.fields.kind ?? "related"));
  const [confidence, setConfidence] = useState(String(link?.fields.confidence ?? 50));
  if (!link) return <Empty title="Choose a relationship" />;
  return (
    <form
      id="relationship-editor"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        await context.mutate.patch(link.id, { fields: { ...link.fields, kind, confidence: Number(confidence) || 0 } }, { expectRevision: link.revision, event: `${link.title} relationship updated` });
        context.toast("Relationship saved", "The link and its confidence are recorded.");
        close();
      }}
    >
      <Field label="Relationship"><TextInput value={kind} onChange={(event) => setKind(event.target.value)} /></Field>
      <Field label="Confidence (%)" hint="A link below 70% stays a candidate and is not treated as settled.">
        <TextInput value={confidence} inputMode="numeric" align="end" onChange={(event) => setConfidence(event.target.value)} />
      </Field>
      <Properties rows={[{ label: "Evidence", value: String(link.fields.sourceId || "No source record") }]} />
    </form>
  );
}

function EvidenceDrawer({ context }: { context: ScreenContext }) {
  const data = useKnowledge();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const fact = data.facts.find((item) => item.id === (payload?.id ?? context.selectedId));
  if (!fact) return <Empty title="Choose an assertion" />;
  const source = sourceOf(data, fact.fields.sourceId);
  const rivals = data.facts.filter((item) => item.id !== fact.id && item.fields.subject === fact.fields.subject && item.fields.predicate === fact.fields.predicate);
  const body = source?.body as { extracted?: string[] } | undefined;
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Assertion", value: `${String(fact.fields.subject)} — ${String(fact.fields.predicate)}` },
        { label: "Value", value: String(fact.fields.value ?? fact.summary) },
        { label: "Confidence", value: <Pill tone={CONFIDENCE_TONE[fact.status] ?? "neutral"}>{fact.status} · {String(fact.fields.confidenceScore ?? 0)}%</Pill> },
        { label: "Valid", value: `${context.date(String(fact.fields.validFrom ?? fact.at))}${fact.fields.validTo ? ` – ${context.date(String(fact.fields.validTo))}` : " – open"}` },
        { label: "Owner", value: fact.ownerName },
      ]} />
      {source ? (
        <Card title={source.title} subtitle={`${source.status} · ${context.date(String(source.fields.freshness ?? source.updatedAt))}`} prov="human">
          <ul className="ds-prose" style={{ paddingInlineStart: "1.1rem" }}>{(body?.extracted ?? ["No extracted line recorded."]).map((line) => <li key={line}>{line}</li>)}</ul>
        </Card>
      ) : <Notice tone="danger" title="No source record">This assertion cannot be verified while nothing backs it.</Notice>}
      {rivals.length > 0 && (
        <Notice tone="warning" title={`${rivals.length} rival assertion${rivals.length === 1 ? "" : "s"}`}>
          {rivals.map((rival) => `${String(rival.fields.value)} (${rival.status})`).join(", ")}. Two incompatible assertions are never both authoritative.
        </Notice>
      )}
    </Stack>
  );
}

function VerificationDialog({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useKnowledge();
  const payload = context.overlayPayload as { id?: string; mode?: string } | undefined;
  const fact = data.facts.find((item) => item.id === (payload?.id ?? context.selectedId));
  const [expiry, setExpiry] = useState(String(fact?.fields.validTo ?? ""));
  const [note, setNote] = useState("");
  if (!fact) return <Empty title="Select an assertion first" />;
  const source = sourceOf(data, fact.fields.sourceId);
  return (
    <form
      id="verification"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        await context.mutate.patch(fact.id, {
          status: payload?.mode === "expiry" ? fact.status : "verified",
          fields: { ...fact.fields, validTo: expiry, note, verifiedBy: payload?.mode === "expiry" ? String(fact.fields.verifiedBy ?? "") : context.actor },
        }, { expectRevision: fact.revision, event: payload?.mode === "expiry" ? `Expiry set on ${fact.title}` : `${fact.title} verified by ${context.actor}` });
        context.toast(payload?.mode === "expiry" ? "Expiry recorded" : "Verified", payload?.mode === "expiry" ? "The assertion expires on that date and will be shown as expired afterwards." : `${fact.title} is authoritative.`);
        close();
      }}
    >
      <Properties rows={[
        { label: "Assertion", value: fact.title },
        { label: "Evidence", value: source?.title ?? "No source record" },
      ]} />
      {!source && <Notice tone="danger" title="Nothing backs this assertion">Verifying it would make a claim this workspace cannot show evidence for.</Notice>}
      <Field label="Valid until" hint="Leave empty for an assertion with no end date."><TextInput type="date" value={expiry} onChange={(event) => setExpiry(event.target.value)} /></Field>
      <Field label="Note"><TextArea value={note} rows={3} onChange={(event) => setNote(event.target.value)} /></Field>
      {source && <Notice tone="info">Verifying records your name against the assertion. It can be changed later, and the change is kept.</Notice>}
    </form>
  );
}

function ConflictResolver({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useKnowledge();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const conflict = data.conflicts.find((item) => item.id === (payload?.id ?? context.selectedId)) ?? data.conflicts.find((item) => item.status === "open");
  const options = conflictOptions(conflict);
  const [chosen, setChosen] = useState(options[0]?.id ?? "");
  const [reason, setReason] = useState("");
  if (!conflict) return <Empty title="No conflict to resolve" />;
  const ledger = conflict.fields.requiresLedgerReview === true;
  return (
    <Stack gap={4}>
      <Card title={conflict.title} subtitle={conflict.summary} prov="unknown" />
      {ledger ? (
        <Notice tone="danger" title="This is a financial mismatch">
          A figure cannot be chosen here. It goes to an accounting review so the ledger and the record agree for a reason that can be audited.
        </Notice>
      ) : (
        <Stack gap={3}>
          {options.map((option) => (
            <label key={option.id} className="ds-panel" style={{ padding: "var(--space-3)", display: "block", cursor: "pointer" }}>
              <Row gap={2}>
                <input type="radio" name="truth" value={option.id} checked={chosen === option.id} onChange={() => setChosen(option.id)} />
                <strong className="ds-grow">{option.value}</strong>
                <span className="ds-subtle">{context.date(option.recordedAt)}</span>
              </Row>
              <span className="ds-subtle">{option.note}</span>
            </label>
          ))}
          <Field label="Why this one" required><TextArea value={reason} rows={3} onChange={(event) => setReason(event.target.value)} required /></Field>
        </Stack>
      )}
      <Button
        variant="primary"
        disabled={ledger || !chosen || !reason.trim()}
        onClick={async () => {
          const option = options.find((item) => item.id === chosen);
          await context.mutate.patch(conflict.id, {
            status: "resolved",
            fields: { ...conflict.fields, chosen: option?.factId ?? chosen, resolvedBy: context.actor, resolvedAt: context.now.toISOString().slice(0, 10), reason },
          }, { expectRevision: conflict.revision, event: `${conflict.title} resolved by ${context.actor}` });
          if (option?.factId) {
            const fact = data.facts.find((item) => item.id === option.factId);
            if (fact) {
              await context.mutate.patch(fact.id, { status: "verified", fields: { ...fact.fields, confidence: "verified", verifiedBy: context.actor } }, { event: `${fact.title} became the source of truth` });
            }
          }
          context.toast("Conflict resolved", "The chosen assertion is authoritative; the other stays on the record as rejected evidence.");
          close();
        }}
      >
        Record the resolution
      </Button>
    </Stack>
  );
}

function ComparisonDrawer({ context }: { context: ScreenContext }) {
  const data = useKnowledge();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const conflict = data.conflicts.find((item) => item.id === (payload?.id ?? context.selectedId));
  if (!conflict) return <Empty title="Choose a conflict" />;
  const options = conflictOptions(conflict);
  return (
    <Stack gap={4}>
      <Notice tone="info" title="Both sides, with their dates">
        A conflict is shown as evidence against evidence. The newer record is not automatically right.
      </Notice>
      {options.map((option) => {
        const source = sourceOf(data, option.sourceId);
        return (
          <Card key={option.id} title={option.value} subtitle={source?.title ?? option.sourceId} prov="human"
            actions={<Pill tone={source?.status === "indexed" ? "success" : "warning"}>{source?.status ?? "no source record"}</Pill>}>
            <Properties rows={[
              { label: "Recorded", value: context.date(option.recordedAt) },
              { label: "Note", value: option.note },
              { label: "Source freshness", value: source ? context.date(String(source.fields.freshness ?? source.updatedAt)) : "Unknown" },
            ]} />
          </Card>
        );
      })}
    </Stack>
  );
}

function Escalation({ context, close }: { context: ScreenContext; close: () => void }) {
  const conflict = useRecord(context.selectedId);
  const [note, setNote] = useState("");
  if (!conflict) return <Empty title="Choose a conflict" />;
  return (
    <Stack gap={4}>
      <CapabilityLine id="bank.feed" title="External confirmation is not connected" />
      <Notice tone="warning" title="What happens instead">
        The conflict is marked as needing confirmation from outside this workspace, with your note. Nothing is requested from anyone automatically: no mail or feed is connected.
      </Notice>
      <Field label="What confirmation is needed" required><TextArea value={note} rows={3} onChange={(event) => setNote(event.target.value)} required /></Field>
      <Button
        variant="primary"
        disabled={!note.trim()}
        onClick={async () => {
          await context.mutate.patch(conflict.id, { status: "in_review", fields: { ...conflict.fields, escalatedBy: context.actor, escalationNote: note } }, { expectRevision: conflict.revision, event: `${conflict.title} escalated for external confirmation` });
          context.toast("Escalated", "It is in review with your note. No request has left this browser.");
          close();
        }}
      >
        Mark as needing confirmation
      </Button>
    </Stack>
  );
}

function DecisionDraft({ context, close }: { context: ScreenContext; close: () => void }) {
  const members = useCollection("members");
  const missions = useCollection("missions");
  const [title, setTitle] = useState("");
  const [rationale, setRationale] = useState("");
  const [alternatives, setAlternatives] = useState("");
  const [approver, setApprover] = useState("");
  const [missionId, setMissionId] = useState("");
  return (
    <form
      id="decision-draft"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        await context.mutate.create({
          collection: "decisions",
          title: title.trim(),
          status: approver ? "approved" : "proposed",
          summary: rationale.slice(0, 160),
          at: context.now.toISOString(),
          fields: { approvers: approver, domain: "general", missionId, approvedAt: approver ? context.now.toISOString().slice(0, 10) : "" },
          body: { rationale, alternatives: alternatives.split("\n").filter(Boolean), outcome: "" },
        }, `Decision ${approver ? "approved" : "proposed"}: ${title.trim()}`);
        context.toast(approver ? "Decision approved" : "Decision proposed", approver ? "It is in the register with its approver." : "It stays proposed until someone approves it.");
        close();
      }}
    >
      <Field label="Decision" required><TextInput value={title} onChange={(event) => setTitle(event.target.value)} required /></Field>
      <Field label="Rationale" required><TextArea value={rationale} rows={4} onChange={(event) => setRationale(event.target.value)} required /></Field>
      <Field label="Alternatives considered" hint="One per line."><TextArea value={alternatives} rows={3} onChange={(event) => setAlternatives(event.target.value)} /></Field>
      <Field label="Approver" hint="Leave empty to record it as proposed.">
        <Select value={approver} onChange={(event) => setApprover(event.target.value)}>
          <option value="">Not approved yet</option>
          {members.filter((member) => member.fields.kind === "human").map((member) => <option key={member.id} value={member.title}>{member.title}</option>)}
        </Select>
      </Field>
      <Field label="Related mission">
        <Select value={missionId} onChange={(event) => setMissionId(event.target.value)}>
          <option value="">None</option>
          {missions.map((mission) => <option key={mission.id} value={mission.id}>{mission.title}</option>)}
        </Select>
      </Field>
    </form>
  );
}

function ApprovalDetail({ context }: { context: ScreenContext }) {
  const decision = useRecord((context.overlayPayload as { id?: string } | undefined)?.id ?? context.selectedId);
  if (!decision) return <Empty title="Choose a decision" />;
  const body = decision.body as { rationale?: string; alternatives?: string[]; outcome?: string } | undefined;
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Status", value: <Pill tone={decision.status === "approved" ? "success" : decision.status === "superseded" ? "neutral" : "info"}>{decision.status}</Pill> },
        { label: "Approvers", value: String(decision.fields.approvers || "None recorded") },
        { label: "Approved", value: decision.fields.approvedAt ? context.date(String(decision.fields.approvedAt)) : "Not approved" },
        { label: "Superseded by", value: String(decision.fields.supersededBy || "—") },
      ]} />
      <Card title="Rationale" pad="tight"><p className="ds-prose">{body?.rationale ?? decision.summary}</p></Card>
      {(body?.alternatives ?? []).length > 0 && (
        <Card title="Alternatives considered" pad="tight">
          <ul className="ds-prose" style={{ paddingInlineStart: "1.1rem" }}>{(body?.alternatives ?? []).map((item) => <li key={item}>{item}</li>)}</ul>
        </Card>
      )}
      {body?.outcome && <Card title="Outcome" pad="tight"><p className="ds-prose">{body.outcome}</p></Card>}
    </Stack>
  );
}

function ImpactReview({ context, close }: { context: ScreenContext; close: () => void }) {
  const decision = useRecord(context.selectedId);
  const [title, setTitle] = useState("");
  const [rationale, setRationale] = useState("");
  if (!decision) return <Empty title="Choose a decision" />;
  return (
    <form
      id="impact-review"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const replacement = await context.mutate.create({
          collection: "decisions",
          title: title.trim(),
          status: "approved",
          summary: rationale.slice(0, 160),
          at: context.now.toISOString(),
          fields: { approvers: context.actor, domain: String(decision.fields.domain ?? "general"), approvedAt: context.now.toISOString().slice(0, 10), supersedes: decision.id },
          body: { rationale, alternatives: [], outcome: "" },
        }, `Decision recorded, superseding ${decision.title}`);
        await context.mutate.patch(decision.id, { status: "superseded", fields: { ...decision.fields, supersededBy: replacement.id } }, { expectRevision: decision.revision, event: `${decision.title} superseded` });
        context.toast("Superseded", "The old decision stays visible for audit with its approvers and date.");
        close();
      }}
    >
      <Notice tone="warning" title="Superseding keeps the old decision">
        {decision.title} will be marked superseded, not deleted. Anything that cited it still resolves.
      </Notice>
      <Field label="Replacement decision" required><TextInput value={title} onChange={(event) => setTitle(event.target.value)} required /></Field>
      <Field label="Why it changes" required><TextArea value={rationale} rows={3} onChange={(event) => setRationale(event.target.value)} required /></Field>
    </form>
  );
}

function BrandRuleEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const brands = useCollection("brands");
  const sources = useCollection("sources");
  const proposal = brands.find((brand) => brand.status === "proposed") ?? brands[0];
  const payload = context.overlayPayload as { id?: string } | undefined;
  const body = proposal?.body as { rules?: BrandRule[] } | undefined;
  const existing = (body?.rules ?? []).find((rule) => rule.id === payload?.id);
  const [rule, setRule] = useState(existing?.rule ?? "");
  const [source, setSource] = useState(existing?.source ?? sources[0]?.id ?? "");
  const [status, setStatus] = useState(existing?.status ?? "proposed");
  if (!proposal) return <Empty title="No brand record to edit" />;
  return (
    <form
      id="brand-rule"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const rules = body?.rules ?? [];
        const next = existing
          ? rules.map((item) => (item.id === existing.id ? { ...item, rule, source, status } : item))
          : [...rules, { id: `rule-${Date.now()}`, rule, source, status }];
        await context.mutate.patch(proposal.id, { body: { ...(proposal.body as object), rules: next } }, { expectRevision: proposal.revision, event: `Brand rule ${existing ? "updated" : "added"}: ${rule.slice(0, 40)}` });
        context.toast("Rule saved", status === "approved" ? "It is an approved rule with its evidence." : "It stays proposed until a person approves it.");
        close();
      }}
    >
      <Field label="Rule" required><TextInput value={rule} onChange={(event) => setRule(event.target.value)} required /></Field>
      <Field label="Evidence" hint="A rule without a source stays proposed.">
        <Select value={source} onChange={(event) => setSource(event.target.value)}>
          <option value="">No source</option>
          {sources.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </Select>
      </Field>
      <Field label="State">
        <Select value={status} onChange={(event) => setStatus(event.target.value)} disabled={!source}>
          <option value="proposed">Proposed</option>
          <option value="approved">Approved</option>
        </Select>
      </Field>
      {!source && <Notice tone="warning">Without a source record this rule cannot be approved.</Notice>}
    </form>
  );
}

function AssetSelector({ context }: { context: ScreenContext }) {
  const assets = useCollection("assets");
  return assets.length === 0 ? <Empty title="No asset in this workspace" /> : (
    <Stack gap={3}>
      <Notice tone="info">Assets live in the asset library. This list shows what the brand record can point at.</Notice>
      <Stack gap={2}>
        {assets.map((asset) => (
          <Row key={asset.id} gap={2} className="ds-panel" style={{ padding: "var(--space-2)" }}>
            <div className="ds-grow"><strong>{asset.title}</strong><div className="ds-subtle">{String(asset.fields.kind ?? "asset")} · {String(asset.fields.licence ?? "licence not recorded")}</div></div>
            <Button size="sm" variant="ghost" onClick={() => context.navigate(`/o/${context.org.slug}/asset/library`)}>Open</Button>
          </Row>
        ))}
      </Stack>
    </Stack>
  );
}

function BrandImpactPreview({ context, close }: { context: ScreenContext; close: () => void }) {
  const brands = useCollection("brands");
  const payload = context.overlayPayload as { id?: string; token?: string } | undefined;
  const proposal = brands.find((brand) => brand.id === payload?.id) ?? brands.find((brand) => brand.status === "proposed");
  if (!proposal) return <Empty title="Nothing proposed" />;
  const body = proposal.body as { colours?: { name: string; value: string; approved: boolean }[]; rules?: BrandRule[] } | undefined;
  const unapproved = (body?.colours ?? []).filter((colour) => !colour.approved);
  return (
    <Stack gap={4}>
      <Notice tone="warning" title="Approving changes the recorded brand">
        {payload?.token ? `The token ${payload.token} would become part of the approved set.` : `${unapproved.length} proposed colour${unapproved.length === 1 ? "" : "s"} and ${(body?.rules ?? []).filter((rule) => rule.status === "proposed").length} proposed rules would be approved.`} Material already made keeps the tokens it used.
      </Notice>
      <Properties rows={[
        { label: "Variant", value: proposal.title },
        { label: "Extracted from", value: String(proposal.fields.extractedFrom || "Not recorded") },
        { label: "Current state", value: proposal.status },
      ]} />
      <Button
        variant="primary"
        onClick={async () => {
          await context.mutate.patch(proposal.id, {
            status: "approved",
            fields: { ...proposal.fields, approved: true, approvedBy: context.actor },
            body: { ...(proposal.body as object), colours: (body?.colours ?? []).map((colour) => ({ ...colour, approved: true })) },
          }, { expectRevision: proposal.revision, event: `${proposal.title} approved by ${context.actor}` });
          context.toast("Variant approved", "The proposal is now part of the recorded brand, with who approved it.");
          close();
        }}
      >
        Approve the variant
      </Button>
    </Stack>
  );
}

function GrantDialog({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useKnowledge();
  const payload = context.overlayPayload as { agentId?: string } | undefined;
  const policy = data.policies.find((item) => item.fields.kind === "grants");
  const grants = (policy?.body as { grants?: Grant[] } | undefined)?.grants ?? [];
  const [agentId, setAgentId] = useState(payload?.agentId ?? grants[0]?.agentId ?? data.agents[0]?.id ?? "");
  const current = grants.find((grant) => grant.agentId === agentId);
  const [groups, setGroups] = useState<string[]>(current?.groups ?? ["public"]);
  if (!policy) return <Empty title="No grant policy recorded" />;
  return (
    <Stack gap={4}>
      <Field label="AI employee">
        <Select value={agentId} onChange={(event) => { setAgentId(event.target.value); setGroups(grants.find((grant) => grant.agentId === event.target.value)?.groups ?? ["public"]); }}>
          {data.agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.title} — {String(agent.fields.role ?? "")}</option>)}
        </Select>
      </Field>
      <Stack gap={2}>
        <span className="ds-field-label">Sensitivity groups</span>
        {["public", "internal", "confidential"].map((group) => (
          <Checkbox
            key={group}
            label={`${group}${group === "confidential" ? " — most contracts are excluded from this" : ""}`}
            checked={groups.includes(group)}
            onChange={(event) => setGroups((current2) => event.target.checked ? [...current2, group] : current2.filter((item) => item !== group))}
          />
        ))}
      </Stack>
      <Notice tone="warning" title="A change applies to the next request">
        An answer already given keeps the records it named. Queued work that was authorised under the old grant is re-checked when it runs.
      </Notice>
      <Button
        variant="primary"
        onClick={async () => {
          const next = grants.some((grant) => grant.agentId === agentId)
            ? grants.map((grant) => (grant.agentId === agentId ? { ...grant, groups } : grant))
            : [...grants, { agentId, groups, note: `Set by ${context.actor}.` }];
          await context.mutate.patch(policy.id, { body: { ...(policy.body as object), grants: next } }, { expectRevision: policy.revision, event: `Source grant changed for ${data.agents.find((agent) => agent.id === agentId)?.title ?? agentId}` });
          context.toast("Grant saved", `${groups.join(", ") || "no group"} is what this contract may retrieve.`);
          close();
        }}
      >
        Save the grant
      </Button>
    </Stack>
  );
}

function SimulationReport({ context }: { context: ScreenContext }) {
  const data = useKnowledge();
  const policy = data.policies.find((item) => item.fields.kind === "grants");
  const grants = (policy?.body as { grants?: Grant[] } | undefined)?.grants ?? [];
  const [agentId, setAgentId] = useState(grants[0]?.agentId ?? data.agents[0]?.id ?? "");
  const grant = grants.find((item) => item.agentId === agentId);
  const reachable = data.sources.filter((source) => (grant?.groups ?? []).includes(String(source.fields.classification ?? "internal")) && source.status === "indexed");
  const excluded = data.sources.filter((source) => !reachable.includes(source));
  return (
    <Stack gap={4}>
      <Field label="Simulate retrieval for">
        <Select value={agentId} onChange={(event) => setAgentId(event.target.value)}>
          {data.agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.title}</option>)}
        </Select>
      </Field>
      <StatRow>
        <Stat label="Sources in reach" value={String(reachable.length)} prov="posted" meta="Indexed and inside the grant" />
        <Stat label="Excluded" value={String(excluded.length)} prov="unknown" meta="Outside the grant, held or failed" />
      </StatRow>
      <DataGrid
        rows={data.sources}
        rowId={(row) => row.id}
        label="Simulated retrieval"
        filterable={false}
        columns={[
          { key: "title", header: "Source", primary: true, cell: (row) => row.title },
          { key: "class", header: "Group", cell: (row) => String(row.fields.classification ?? "internal") },
          { key: "state", header: "Indexing", cell: (row) => row.status },
          { key: "reach", header: "In reach", cell: (row) => reachable.includes(row) ? <Pill tone="success">Yes</Pill> : <Pill tone="warning">No</Pill> },
        ]}
      />
      <Notice tone="info" title="A simulation reads the policy, not a model">
        This is the set of records a contract could read if it were asked something today. No request is made and no model is called. {context.org.shortName} only.
      </Notice>
    </Stack>
  );
}

function RevokeConfirmation({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useKnowledge();
  const policy = data.policies.find((item) => item.fields.kind === "grants");
  const grants = (policy?.body as { grants?: Grant[] } | undefined)?.grants ?? [];
  const [agentId, setAgentId] = useState(grants[0]?.agentId ?? "");
  if (!policy) return <Empty title="No grant policy" />;
  return (
    <Stack gap={4}>
      <Field label="Revoke the grant of">
        <Select value={agentId} onChange={(event) => setAgentId(event.target.value)}>
          {grants.map((grant) => <option key={grant.agentId} value={grant.agentId}>{data.agents.find((agent) => agent.id === grant.agentId)?.title ?? grant.agentId}</option>)}
        </Select>
      </Field>
      <Notice tone="warning" title="What revoking reaches">
        The contract stops being offered those sources from its next request. Answers already written keep the records they named: this workspace cannot unsay them, and it does not pretend to.
      </Notice>
      <Button
        variant="danger"
        disabled={!agentId}
        onClick={async () => {
          const next = grants.map((grant) => (grant.agentId === agentId ? { ...grant, groups: [], note: `Revoked by ${context.actor}.` } : grant));
          await context.mutate.patch(policy.id, { body: { ...(policy.body as object), grants: next } }, { expectRevision: policy.revision, event: `Grant revoked for ${data.agents.find((agent) => agent.id === agentId)?.title ?? agentId}` });
          context.toast("Grant revoked", "That contract can retrieve nothing until a grant is given again.");
          close();
        }}
      >
        Revoke
      </Button>
    </Stack>
  );
}

function ImportReview({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const source = useRecord(payload?.id ?? context.selectedId);
  const [owner, setOwner] = useState("");
  const [classification, setClassification] = useState("internal");
  const members = useCollection("members");
  if (!source) return <Empty title="Choose a file" />;
  const body = source.body as { extracted?: string[]; note?: string } | undefined;
  const failed = source.status === "failed";
  return (
    <Stack gap={4}>
      <Card title={source.title} subtitle={source.summary} prov={failed ? "unknown" : "human"}>
        {failed ? <Notice tone="danger" title="Isolated">{body?.note}</Notice> : (
          <ul className="ds-prose" style={{ paddingInlineStart: "1.1rem" }}>
            {(body?.extracted ?? ["Nothing was read from this file."]).map((line) => <li key={line}>{line}</li>)}
          </ul>
        )}
      </Card>
      <Field label="Route to owner">
        <Select value={owner} onChange={(event) => setOwner(event.target.value)}>
          <option value="">Keep {source.ownerName}</option>
          {members.map((member) => <option key={member.id} value={member.title}>{member.title}</option>)}
        </Select>
      </Field>
      <Field label="Classification">
        <Select value={classification} onChange={(event) => setClassification(event.target.value)}>
          <option value="public">Public</option>
          <option value="internal">Internal</option>
          <option value="confidential">Confidential</option>
        </Select>
      </Field>
      <Row gap={2} wrap>
        <Button
          variant="primary"
          disabled={failed}
          title={failed ? "A file that could not be parsed cannot be approved" : undefined}
          onClick={async () => {
            await context.mutate.patch(source.id, {
              status: "indexed",
              ownerName: owner || source.ownerName,
              fields: { ...source.fields, scanned: true, indexing: "indexed", classification, reviewedBy: context.actor },
            }, { expectRevision: source.revision, event: `${source.title} approved into the knowledge base by ${context.actor}` });
            context.toast("Approved", "The source is indexed and available to answers in this workspace.");
            close();
          }}
        >
          Approve the extraction
        </Button>
        <Button
          variant="secondary"
          onClick={async () => {
            await context.mutate.patch(source.id, { ownerName: owner || source.ownerName, fields: { ...source.fields, classification, routedBy: context.actor } }, { expectRevision: source.revision, event: `${source.title} routed to ${owner || source.ownerName}` });
            context.toast("Routed", `${owner || source.ownerName} owns it. It stays out of retrieval until approved.`);
            close();
          }}
        >
          Route without approving
        </Button>
      </Row>
    </Stack>
  );
}

function UnsupportedFormat({ context }: { context: ScreenContext }) {
  const sources = useCollection("sources").filter((source) => source.status === "failed");
  return (
    <Stack gap={4}>
      <Notice tone="danger" title="These files were isolated, not partly imported">
        A file this browser cannot read is recorded with the reason and kept out of every answer. Nothing is guessed from its name.
      </Notice>
      {sources.length === 0 ? <Empty title="No failed file" /> : (
        <Stack gap={2}>
          {sources.map((source) => (
            <Card key={source.id} title={source.title} subtitle={source.summary} pad="tight" prov="unknown"
              footer={<Button size="sm" variant="ghost" onClick={() => context.navigate(`/o/${context.org.slug}/brain/sources/${source.id}`)}>Open the record</Button>} />
          ))}
        </Stack>
      )}
      <Properties rows={[
        { label: "Readable here", value: "Plain text, CSV, Markdown and JSON" },
        { label: "Recorded by name only", value: "PDF, images, audio, video, archives" },
        { label: "Size limit", value: "5 MB, because the file is read in this browser" },
      ]} />
    </Stack>
  );
}

/* ====================================================================== *
 * Module
 * ====================================================================== */

const submitFooter = (formId: string, label: string) => ({ close }: { close: () => void }) => (
  <>
    <Button variant="ghost" onClick={close}>Cancel</Button>
    <span className="ds-grow" />
    <Button variant="primary" type="submit" form={formId}>{label}</Button>
  </>
);

async function records(context: ScreenContext, collection: string): Promise<Rec[]> {
  const { db } = await import("@/runtime/db");
  return db.records.where("[organizationId+collection]").equals([context.org.id, collection]).toArray();
}

async function reprocessSource(context: ScreenContext): Promise<void> {
  const id = context.selectedId ?? context.params.id;
  const { db } = await import("@/runtime/db");
  const source = id ? await db.records.get(id) : undefined;
  if (!source || source.collection !== "sources") { context.toast("Select a source first", "Choose the source to re-read.", "info"); return; }
  const body = (source.body ?? {}) as { extracted?: string[] };
  const lines = body.extracted?.length ?? 0;
  await context.mutate.patch(source.id, {
    fields: { ...source.fields, reprocessedBy: context.actor, reprocessedAt: context.now.toISOString() },
  }, { expectRevision: source.revision, event: `${source.title} re-read locally by ${context.actor}` });
  context.toast(
    "Re-read what is stored",
    lines > 0
      ? `${lines} extracted lines are recorded. The original file is not in this browser, so nothing new was parsed.`
      : "Nothing is stored for this source beyond its metadata, so there was nothing to re-read.",
    lines > 0 ? "ok" : "info",
  );
}

async function reindexSource(context: ScreenContext): Promise<void> {
  const id = context.params.id ?? context.selectedId;
  const { db } = await import("@/runtime/db");
  const source = id ? await db.records.get(id) : undefined;
  if (!source) return;
  if (source.fields.scanned !== true) {
    context.toast("Cannot index an unreviewed file", "No scanner is connected, so a person has to review it before it can be indexed.", "blocked");
    return;
  }
  await context.mutate.patch(source.id, { status: "indexed", fields: { ...source.fields, indexing: "indexed", indexedBy: context.actor } }, { expectRevision: source.revision, event: `${source.title} indexed by ${context.actor}` });
  context.toast("Indexed", "The source is available to answers composed from now on.");
}

async function exportSource(context: ScreenContext): Promise<void> {
  const id = context.params.id ?? context.selectedId;
  const { db } = await import("@/runtime/db");
  const source = id ? await db.records.get(id) : undefined;
  if (!source) return;
  const body = (source.body ?? {}) as { extracted?: string[]; corrections?: Correction[] };
  const text = [
    source.title,
    `Exported ${context.dateTime(context.now)} from ${context.org.name}`,
    `Classification: ${String(source.fields.classification ?? "internal")} · Indexing: ${source.status}`,
    "",
    "Extracted:",
    ...(body.extracted ?? ["(nothing)"]),
    "",
    "Corrections:",
    ...(body.corrections ?? []).map((correction) => `${correction.at} ${correction.by}: “${correction.from}” → “${correction.to}” (${correction.note})`),
  ].join("\n");
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${source.title.replace(/\s+/g, "-").toLowerCase()}.txt`;
  link.click();
  URL.revokeObjectURL(url);
  context.toast("Exported", "The file was written by this browser, with the correction history included.");
}

async function importBrandGuide(context: ScreenContext): Promise<void> {
  const brands = await records(context, "brands");
  const sources = await records(context, "sources");
  const proposal = brands.find((brand) => brand.status === "proposed") ?? brands[0];
  const guide = sources.find((source) => (source.body as { extracted?: string[] } | undefined)?.extracted?.length && source.title.toLowerCase().includes("voice"))
    ?? sources.find((source) => (source.body as { extracted?: string[] } | undefined)?.extracted?.length);
  if (!proposal || !guide) { context.toast("Nothing to import", "No source in the library has readable lines to propose rules from.", "info"); return; }
  const lines = ((guide.body as { extracted?: string[] }).extracted ?? []).slice(0, 4);
  const body = (proposal.body ?? {}) as { rules?: BrandRule[] };
  const existing = body.rules ?? [];
  const added = lines
    .filter((line) => !existing.some((rule) => rule.rule === line))
    .map((line, index) => ({ id: `rule-import-${Date.now()}-${index}`, rule: line, source: guide.id, status: "proposed" }));
  if (added.length === 0) { context.toast("Nothing new", `Every line in ${guide.title} is already a rule.`, "info"); return; }
  await context.mutate.patch(proposal.id, { body: { ...(proposal.body as object), rules: [...existing, ...added] } }, { expectRevision: proposal.revision, event: `${added.length} brand rules proposed from ${guide.title}` });
  context.toast("Rules proposed", `${added.length} line${added.length === 1 ? "" : "s"} from ${guide.title} are proposed. None was applied to the approved set.`);
}

async function deferConflict(context: ScreenContext): Promise<void> {
  const id = context.selectedId;
  const { db } = await import("@/runtime/db");
  const conflict = id ? await db.records.get(id) : undefined;
  if (!conflict || conflict.collection !== "conflicts") { context.toast("Select a conflict first", "Choose the conflict to defer.", "info"); return; }
  await context.mutate.patch(conflict.id, { status: "in_review", fields: { ...conflict.fields, deferredBy: context.actor, deferredAt: context.now.toISOString() } }, { expectRevision: conflict.revision, event: `${conflict.title} deferred by ${context.actor}` });
  context.toast("Deferred", "It moves to In review with who deferred it. Both sides stay unresolved, so neither is authoritative.");
}

async function retrySafeStep(context: ScreenContext): Promise<void> {
  const sources = await records(context, "sources");
  const failed = sources.filter((source) => source.status === "failed");
  if (failed.length === 0) { context.toast("Nothing failed", "No file is in the failed queue.", "info"); return; }
  const target = failed[0];
  await context.mutate.patch(target.id, {
    fields: { ...target.fields, retries: Number(target.fields.retries ?? 0) + 1, lastRetryBy: context.actor },
  }, { expectRevision: target.revision, event: `${target.title} retry attempted and reported` });
  context.toast(
    "Retried the safe step",
    `Re-reading ${target.title} needs the original file, which is not in this browser. The attempt is recorded and the file stays isolated.`,
    "blocked",
  );
}

export const brainApp = registerApp({
  code: "BRAIN",
  short: "Company Brain",
  name: "Company Brain & Knowledge",
  purpose: "What this company knows, with the source behind every claim",
  icon: Brain,
  nav: [
    { items: [
      { label: "Knowledge home", screenId: "ARL-BRAIN-001", icon: Brain },
      { label: "Fact registry", screenId: "ARL-BRAIN-005", icon: BookOpen },
      { label: "Conflicts", screenId: "ARL-BRAIN-006", icon: Scale },
      { label: "Decisions", screenId: "ARL-BRAIN-007", icon: Scale },
    ] },
    { label: "Sources", items: [
      { label: "Source library", screenId: "ARL-BRAIN-002", icon: Database },
      { label: "Source detail", screenId: "ARL-BRAIN-003", icon: FileSearch },
      { label: "Intake centre", screenId: "ARL-BRAIN-010", icon: Inbox },
    ] },
    { label: "Structure", items: [
      { label: "Business graph", screenId: "ARL-BRAIN-004", icon: GitBranch },
      { label: "Brand intelligence", screenId: "ARL-BRAIN-008", icon: Palette },
      { label: "Permissions", screenId: "ARL-BRAIN-009", icon: Lock },
    ] },
  ],
  screens: {
    "ARL-BRAIN-001": {
      id: "ARL-BRAIN-001",
      title: () => "Knowledge home",
      subtitle: (context) => `What ${context.org.name} knows, how fresh it is and what has no source behind it.`,
      tabs: (["Overview", "Recent", "Quality", "Opportunities"] as const).map((view) => ({
        id: view,
        render: (context: ScreenContext) => <KnowledgeHome context={context} view={view} />,
      })),
      actions: [
        { id: "Search knowledge", placement: "primary", run: (context) => context.openOverlay("Knowledge inspector") },
        { id: "import", label: "Import a source", placement: "secondary", run: (context) => context.openOverlay("upload") },
        { id: "review proposal", placement: "secondary", run: (context) => context.setTab("Opportunities") },
        { id: "inspect missing source", placement: "overflow", run: (context) => { context.setTab("Quality"); context.toast("Assertions with no source", "They are listed on the Quality tab and cannot be verified until one is attached.", "info"); } },
      ],
      overlays: [
        { id: "Knowledge inspector", kind: "drawer", title: "Knowledge", width: 560, render: ({ ...context }) => <KnowledgeInspector context={context} /> },
        { id: "suggestion approval", kind: "modal", title: "Review a suggestion", width: 560, render: ({ close, ...context }) => <SuggestionApproval context={context} close={close} /> },
        { id: "upload", kind: "modal", title: "Import a source", width: 620, render: ({ close, ...context }) => <UploadDialog context={context} close={close} /> },
      ],
    },

    "ARL-BRAIN-002": {
      id: "ARL-BRAIN-002",
      title: () => "Source library",
      tabs: (["Documents", "Websites", "Integrations", "Media"] as const).map((view) => ({
        id: view,
        render: (context: ScreenContext) => <SourceLibrary context={context} view={view} />,
      })),
      actions: [
        { id: "Upload", placement: "primary", run: (context) => context.openOverlay("Upload dialog") },
        { id: "inspect", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Select a source first"), run: (context) => context.openOverlay("source detail drawer") },
        { id: "filter", placement: "secondary", run: () => { document.querySelector<HTMLInputElement>('input[aria-label^="Filter"]')?.focus(); } },
        { id: "reprocess", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Select a source first"), run: (context) => void reprocessSource(context) },
        { id: "retire source", placement: "overflow", tone: "danger", guard: (context) => (context.selectedId ? undefined : "Select a source first"), run: (context) => context.openOverlay("retention dialog") },
      ],
      overlays: [
        { id: "Upload dialog", kind: "modal", title: "Add sources", width: 620, render: ({ close, ...context }) => <UploadDialog context={context} close={close} /> },
        { id: "source detail drawer", kind: "drawer", title: "Source", width: 520, render: ({ ...context }) => <SourceDetailDrawer context={context} /> },
        { id: "retention dialog", kind: "modal", title: "Retire this source", tone: "danger", width: 560, render: ({ close, ...context }) => <RetentionDialog context={context} close={close} /> },
      ],
    },

    "ARL-BRAIN-003": {
      id: "ARL-BRAIN-003",
      title: () => "Source detail",
      tabs: (["Preview", "Extracted data", "Relationships", "Access", "History"] as const).map((view) => ({
        id: view,
        render: (context: ScreenContext) => <SourceDetail context={context} view={view} />,
      })),
      actions: [
        { id: "Correct extraction", placement: "primary", run: (context) => context.openOverlay("Correction form") },
        { id: "annotate", placement: "secondary", run: (context) => context.openOverlay("Correction form", { mode: "annotate" }) },
        { id: "restrict", placement: "secondary", run: (context) => context.openOverlay("permission editor") },
        { id: "reindex", placement: "overflow", run: (context) => void reindexSource(context) },
        { id: "export", placement: "overflow", capability: "export_data", run: (context) => void exportSource(context) },
      ],
      overlays: [
        { id: "Correction form", kind: "modal", title: "Correct an extraction", width: 560, render: ({ close, ...context }) => <CorrectionForm context={context} close={close} />, footer: submitFooter("correction-form", "Record the change") },
        { id: "permission editor", kind: "modal", title: "Restrict this source", width: 520, render: ({ close, ...context }) => <PermissionEditor context={context} close={close} /> },
        { id: "delete request", kind: "modal", title: "Request deletion", tone: "danger", width: 560, render: ({ close, ...context }) => <DeleteRequest context={context} close={close} /> },
      ],
    },

    "ARL-BRAIN-004": {
      id: "ARL-BRAIN-004",
      title: () => "Business graph",
      tabs: (["Entities", "Relationships", "Exceptions"] as const).map((view) => ({
        id: view,
        render: (context: ScreenContext) => <BusinessGraph context={context} view={view} />,
      })),
      actions: [
        { id: "Explore node", placement: "primary", guard: (context) => (context.selectedId ? undefined : "Choose an entity in the graph or the list"), run: (context) => context.openOverlay("Entity inspector") },
        { id: "merge candidates", placement: "secondary", run: (context) => context.setTab("Exceptions") },
        { id: "filter graph", placement: "secondary", run: (context) => { context.setTab("Entities"); usePanelFlags.getState().toggle("brain.graph.filter"); context.toast("Filter", "Choose an entity kind beside the display toggle to narrow the graph and the list together.", "info"); } },
        { id: "split record", placement: "overflow", guard: () => "No entity in this workspace is a merged record, so there is nothing to split.", run: () => undefined },
      ],
      overlays: [
        { id: "Entity inspector", kind: "drawer", title: "Entity", width: 520, render: ({ ...context }) => <EntityInspector context={context} /> },
        { id: "merge preview", kind: "modal", title: "Review a merge", width: 680, render: ({ close, ...context }) => <MergePreview context={context} close={close} /> },
        { id: "relationship editor", kind: "modal", title: "Relationship", width: 520, render: ({ close, ...context }) => <RelationshipEditor context={context} close={close} />, footer: submitFooter("relationship-editor", "Save relationship") },
      ],
    },

    "ARL-BRAIN-005": {
      id: "ARL-BRAIN-005",
      title: () => "Fact registry",
      subtitle: () => "Every assertion carries its source, its validity dates and who verified it.",
      tabs: (["Verified", "Proposed", "Conflicting", "Expired"] as const).map((view) => ({
        id: view,
        render: (context: ScreenContext) => <FactRegistry context={context} view={view} />,
      })),
      actions: [
        { id: "Approve", placement: "primary", capability: "edit_knowledge", guard: (context) => (context.selectedId ? undefined : "Select an assertion first"), run: (context) => context.openOverlay("verification dialog") },
        { id: "reject", placement: "secondary", capability: "edit_knowledge", guard: (context) => (context.selectedId ? undefined : "Select an assertion first"), run: (context) => void rejectFact(context) },
        { id: "annotate", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Select an assertion first"), run: (context) => context.openOverlay("Evidence drawer") },
        { id: "set expiry", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Select an assertion first"), run: (context) => context.openOverlay("verification dialog", { mode: "expiry" }) },
        { id: "compare facts", placement: "overflow", run: (context) => context.openOverlay("conflict resolver") },
      ],
      overlays: [
        { id: "Evidence drawer", kind: "drawer", title: "Evidence", width: 560, render: ({ ...context }) => <EvidenceDrawer context={context} /> },
        { id: "verification dialog", kind: "modal", title: "Verify an assertion", width: 560, render: ({ close, ...context }) => <VerificationDialog context={context} close={close} />, footer: submitFooter("verification", "Record") },
        { id: "conflict resolver", kind: "modal", title: "Resolve a conflict", width: 620, render: ({ close, ...context }) => <ConflictResolver context={context} close={close} /> },
      ],
    },

    "ARL-BRAIN-006": {
      id: "ARL-BRAIN-006",
      title: () => "Knowledge conflicts",
      tabs: (["Open", "In review", "Resolved"] as const).map((view) => ({
        id: view,
        render: (context: ScreenContext) => <KnowledgeConflicts context={context} view={view} />,
      })),
      actions: [
        { id: "Select source of truth", placement: "primary", capability: "edit_knowledge", guard: (context) => (context.selectedId ? undefined : "Choose a conflict first"), run: (context) => context.openOverlay("resolution dialog") },
        { id: "defer", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Choose a conflict first"), run: (context) => void deferConflict(context) },
        { id: "request external confirmation", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Choose a conflict first"), run: (context) => context.openOverlay("escalation") },
      ],
      overlays: [
        { id: "Comparison drawer", kind: "drawer", title: "Compare the sources", width: 560, render: ({ ...context }) => <ComparisonDrawer context={context} /> },
        { id: "resolution dialog", kind: "modal", title: "Choose the source of truth", width: 620, render: ({ close, ...context }) => <ConflictResolver context={context} close={close} /> },
        { id: "escalation", kind: "modal", title: "Ask for external confirmation", width: 560, render: ({ close, ...context }) => <Escalation context={context} close={close} /> },
      ],
    },

    "ARL-BRAIN-007": {
      id: "ARL-BRAIN-007",
      title: () => "Decision register",
      tabs: (["All", "Proposed", "Approved", "Superseded"] as const).map((view) => ({
        id: view,
        render: (context: ScreenContext) => <DecisionRegister context={context} view={view} />,
      })),
      actions: [
        { id: "Create decision", placement: "primary", run: (context) => context.openOverlay("Decision draft") },
        { id: "inspect rationale", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Choose a decision first"), run: (context) => context.openOverlay("approval detail") },
        { id: "link approval", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Choose a decision first"), run: (context) => void linkApproval(context) },
        { id: "supersede", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Choose a decision first"), run: (context) => context.openOverlay("impact review") },
      ],
      overlays: [
        { id: "Decision draft", kind: "modal", title: "Record a decision", width: 620, render: ({ close, ...context }) => <DecisionDraft context={context} close={close} />, footer: submitFooter("decision-draft", "Record decision") },
        { id: "approval detail", kind: "drawer", title: "Decision", width: 560, render: ({ ...context }) => <ApprovalDetail context={context} /> },
        { id: "impact review", kind: "modal", title: "Supersede this decision", width: 560, render: ({ close, ...context }) => <ImpactReview context={context} close={close} />, footer: submitFooter("impact-review", "Supersede") },
      ],
    },

    "ARL-BRAIN-008": {
      id: "ARL-BRAIN-008",
      title: () => "Brand intelligence",
      tabs: (["Identity", "Colours", "Typography", "Voice", "Assets", "Rules"] as const).map((view) => ({
        id: view,
        render: (context: ScreenContext) => <BrandIntelligence context={context} view={view} />,
      })),
      actions: [
        { id: "Import guide", placement: "primary", run: (context) => void importBrandGuide(context) },
        { id: "approve variant", placement: "secondary", capability: "edit_knowledge", run: (context) => context.openOverlay("impact preview") },
        { id: "edit token", placement: "secondary", run: (context) => { context.setTab("Colours"); context.openOverlay("impact preview"); } },
        { id: "set usage", placement: "overflow", run: (context) => context.openOverlay("Brand rule editor") },
      ],
      overlays: [
        { id: "Brand rule editor", kind: "modal", title: "Brand rule", width: 560, render: ({ close, ...context }) => <BrandRuleEditor context={context} close={close} />, footer: submitFooter("brand-rule", "Save rule") },
        { id: "asset selector", kind: "drawer", title: "Assets", width: 520, render: ({ ...context }) => <AssetSelector context={context} /> },
        { id: "impact preview", kind: "modal", title: "What approving would change", width: 560, render: ({ close, ...context }) => <BrandImpactPreview context={context} close={close} /> },
      ],
    },

    "ARL-BRAIN-009": {
      id: "ARL-BRAIN-009",
      title: () => "Knowledge permissions",
      subtitle: () => "Role views and grants shape what this interface offers. They are not an account security boundary.",
      tabs: (["Roles", "Source grants", "Retention", "Activity"] as const).map((view) => ({
        id: view,
        render: (context: ScreenContext) => <KnowledgePermissions context={context} view={view} />,
      })),
      actions: [
        { id: "Adjust access", placement: "primary", capability: "manage_policy", run: (context) => context.openOverlay("Grant dialog") },
        { id: "simulate retrieval", placement: "secondary", run: (context) => context.openOverlay("simulation report") },
        { id: "revoke grant", placement: "secondary", capability: "manage_policy", tone: "danger", run: (context) => context.openOverlay("revoke confirmation") },
        { id: "inspect usage", placement: "overflow", run: (context) => context.setTab("Activity") },
      ],
      overlays: [
        { id: "Grant dialog", kind: "modal", title: "Source grant", width: 560, render: ({ close, ...context }) => <GrantDialog context={context} close={close} /> },
        { id: "simulation report", kind: "drawer", title: "Simulated retrieval", width: 620, render: ({ ...context }) => <SimulationReport context={context} /> },
        { id: "revoke confirmation", kind: "modal", title: "Revoke a grant", tone: "danger", width: 560, render: ({ close, ...context }) => <RevokeConfirmation context={context} close={close} /> },
      ],
    },

    "ARL-BRAIN-010": {
      id: "ARL-BRAIN-010",
      title: () => "Intake centre",
      subtitle: () => "Files are read in this browser, isolated on arrival and kept out of answers until a person reviews them.",
      tabs: (["Incoming", "Processing", "Review", "Completed", "Failed"] as const).map((view) => ({
        id: view,
        render: (context: ScreenContext) => <IntakeCentre context={context} view={view} />,
      })),
      actions: [
        { id: "Upload", placement: "primary", run: (context) => context.openOverlay("File chooser") },
        { id: "approve extraction", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Select a file first"), run: (context) => context.openOverlay("import review") },
        { id: "route document", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Select a file first"), run: (context) => context.openOverlay("import review") },
        { id: "retry safe step", placement: "overflow", run: (context) => void retrySafeStep(context) },
      ],
      overlays: [
        { id: "File chooser", kind: "modal", title: "Add files", width: 620, render: ({ close, ...context }) => <UploadDialog context={context} close={close} /> },
        { id: "import review", kind: "modal", title: "Review the import", width: 620, render: ({ close, ...context }) => <ImportReview context={context} close={close} /> },
        { id: "unsupported format error", kind: "modal", title: "Formats this browser cannot read", tone: "danger", width: 560, render: ({ ...context }) => <UnsupportedFormat context={context} /> },
      ],
    },
  },
});

async function rejectFact(context: ScreenContext): Promise<void> {
  const { db } = await import("@/runtime/db");
  const fact = context.selectedId ? await db.records.get(context.selectedId) : undefined;
  if (!fact || fact.collection !== "facts") return;
  await context.mutate.patch(fact.id, { status: "rejected", fields: { ...fact.fields, confidence: "rejected", rejectedBy: context.actor } }, { expectRevision: fact.revision, event: `${fact.title} rejected by ${context.actor}` });
  context.toast("Rejected", "It stays in the registry marked rejected, with who rejected it and when.");
}

async function linkApproval(context: ScreenContext): Promise<void> {
  const { db } = await import("@/runtime/db");
  const decision = context.selectedId ? await db.records.get(context.selectedId) : undefined;
  if (!decision || decision.collection !== "decisions") return;
  if (!context.can("approve_mission")) {
    await context.mutate.log(`${context.actor} endorsed ${decision.title} from a role view that does not approve.`, { entityId: decision.id, type: "decision.endorsed" });
    context.toast("Recorded as an endorsement", "This role view does not approve decisions, so your name is on a note rather than on the approval.", "blocked");
    return;
  }
  const approvers = String(decision.fields.approvers || "").split(",").map((name) => name.trim()).filter(Boolean);
  if (approvers.includes(context.actor)) { context.toast("Already recorded", "Your approval is already on this decision.", "info"); return; }
  await context.mutate.patch(decision.id, {
    status: "approved",
    fields: { ...decision.fields, approvers: [...approvers, context.actor].join(","), approvedAt: context.now.toISOString().slice(0, 10) },
  }, { expectRevision: decision.revision, event: `${decision.title} approved by ${context.actor}` });
  context.toast("Approval linked", `${decision.title} now carries your approval and today's date.`);
}
