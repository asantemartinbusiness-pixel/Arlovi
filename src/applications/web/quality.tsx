import { useMemo, useState } from "react";
import { Activity, CheckCircle2, Globe, ShieldCheck } from "lucide-react";
import {
  BarChart, Button, Card, Checkbox, DataGrid, Empty, Field, Grid, Notice, Pill, Properties,
  Row, Segmented, Stack, Stat, StatRow, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useCollection, useEvents, useWorkspace } from "@/platform/workspace";
import { addMonths, startOfMonth } from "@/platform/clock";
import type { Rec } from "@/domain/types";
import { BoundaryNotice, CapabilityState, downloadCsv, downloadFile } from "@/applications/t6kit/kit";
import {
  auditSite, exportBytes, issueCounts, liveState, pageHtml, sitemapXml,
  type DeployEntry, type DomainEntry, type Issue, type SiteModel,
} from "./model";
import { NoSite, useSiteRecord } from "./panels";
import { saveSite } from "./state";

/* ================================================================ *
 * ARL-WEB-008 — SEO & Accessibility
 * ================================================================ */

export function applyFix(site: SiteModel, issue: Issue): { next: SiteModel; label: string } | null {
  if (!issue.fix) return null;
  if (issue.fix.kind === "sitemap") {
    return { next: { ...site, seo: { ...site.seo, sitemap: true } }, label: "Sitemap generation turned on" };
  }
  const page = site.pages.find((item) => item.id === issue.pageId);
  if (!page) return null;
  if (issue.fix.kind === "pageTitle") {
    return {
      next: { ...site, pages: site.pages.map((item) => (item.id === page.id ? { ...item, seo: { ...item.seo, title: item.name } } : item)) },
      label: `Page title of ${page.name} set from the page name`,
    };
  }
  if (issue.fix.kind === "pageDescription") {
    const source = page.blocks.find((block) => block.props.body.trim())?.props.body ?? page.blocks.find((block) => block.props.title.trim())?.props.title ?? "";
    const description = source.trim().slice(0, 155);
    if (!description) return null;
    return {
      next: { ...site, pages: site.pages.map((item) => (item.id === page.id ? { ...item, seo: { ...item.seo, description } } : item)) },
      label: `Meta description of ${page.name} written from the first paragraph`,
    };
  }
  if (issue.fix.kind === "blockAlt") {
    const block = page.blocks.find((item) => item.id === issue.blockId);
    const alt = block?.props.title.trim() || block?.props.items[0] || "";
    if (!block || !alt) return null;
    return {
      next: {
        ...site,
        pages: site.pages.map((item) => (item.id === page.id
          ? { ...item, blocks: item.blocks.map((inner) => (inner.id === block.id ? { ...inner, props: { ...inner.props, alt } } : inner)) }
          : item)),
      },
      label: `Alternative description added to a ${block.type} block on ${page.name}`,
    };
  }
  return null;
}

export function QualityReport({ context, area }: { context: ScreenContext; area: Issue["area"] }) {
  const { record, site, formNames } = useSiteRecord(context);
  const { now } = useWorkspace();
  if (!record) return <NoSite />;
  const issues = auditSite(site, formNames).filter((issue) => issue.area === area);
  const counts = issueCounts(issues);
  const lastRun = String(record.fields.lastAuditAt ?? "");

  return (
    <Stack gap={5}>
      <StatRow>
        <Stat prov="posted" label="Failing" value={String(counts.fail)} meta={`${area} checks that must change`} />
        <Stat prov="posted" label="To review" value={String(counts.warn)} meta="Judgement, not a defect" />
        <Stat prov="posted" label="Passing" value={String(counts.pass)} meta={`${issues.length} checks computed`} />
        <Stat
          label="Last recorded run"
          value={lastRun ? context.dateTime(lastRun) : "Never recorded"}
          unavailable={!lastRun}
          meta={lastRun ? context.relative(lastRun) : "Run the audit to record a result"}
        />
      </StatRow>

      {area === "Accessibility" && (
        <Notice tone="warning" title="These checks are not a compliance statement">
          Contrast, heading structure, alternative text and link text are measured from the model. Keyboard operation, focus order and assistive-technology behaviour need a test with a real browser and a real person, so no conformance level is claimed here. The figures below say exactly what was measured.
        </Notice>
      )}
      {area === "Performance" && (
        <Notice tone="info" title="Only the document is measurable here">
          Byte sizes come from generating the real export. There is no asset pipeline and no network, so no speed score, Core Web Vital or transfer time is shown.
        </Notice>
      )}

      {issues.length === 0 ? (
        <Empty title={`No ${area.toLowerCase()} checks apply`} icon={<CheckCircle2 size={20} />} />
      ) : (
        <Stack gap={2}>
          {issues.map((issue) => (
            <div key={issue.id} className="t6-check" data-state={issue.level}>
              <span className="t6-check-dot" aria-hidden="true" />
              <div>
                <Row gap={2} wrap>
                  <strong className="ds-grow">{issue.title}</strong>
                  <Pill tone={issue.level === "fail" ? "danger" : issue.level === "warn" ? "warning" : "success"}>{issue.level === "pass" ? "passing" : issue.level}</Pill>
                </Row>
                <p className="ds-subtle">{issue.detail}</p>
                <p className="ds-subtle" style={{ fontSize: "var(--text-xs)" }}>Measured: {issue.measured}</p>
              </div>
              <Row gap={2}>
                <Button size="sm" variant="ghost" onClick={() => context.openOverlay("Issue detail", { id: issue.id })}>Detail</Button>
                {issue.fix && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      const applied = applyFix(site, issue);
                      if (!applied) { context.toast("No fix applied", "There was nothing in the model to copy the value from.", "blocked"); return; }
                      await saveSite(context, record, applied.next, applied.label);
                      await context.mutate.patch(record.id, { fields: { ...record.fields, lastAuditAt: now.toISOString() } }, { event: `Audit fix applied: ${applied.label}` });
                      context.toast("Fix applied", `${applied.label}. Re-run the audit to see the new figures.`);
                    }}
                  >
                    {issue.fix.label}
                  </Button>
                )}
              </Row>
            </div>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

export function IssueDetail({ context }: { context: ScreenContext }) {
  const { record, site, formNames } = useSiteRecord(context);
  const payload = context.overlayPayload as { id?: string } | undefined;
  if (!record) return <NoSite />;
  const issues = auditSite(site, formNames);
  const issue = issues.find((item) => item.id === payload?.id) ?? issues.find((item) => item.level === "fail") ?? issues[0];
  if (!issue) return <Empty title="Nothing to inspect" icon={<CheckCircle2 size={20} />} />;
  const page = site.pages.find((item) => item.id === issue.pageId);
  return (
    <Stack gap={3}>
      <Row gap={2}><strong className="ds-grow">{issue.title}</strong><Pill tone={issue.level === "fail" ? "danger" : issue.level === "warn" ? "warning" : "success"}>{issue.level}</Pill></Row>
      <Properties rows={[
        { label: "Area", value: issue.area },
        { label: "Measured", value: issue.measured },
        { label: "Page", value: page ? `${page.name} (${page.path})` : "Whole site" },
        { label: "Block", value: issue.blockId ?? "Not block specific" },
      ]} />
      <p className="ds-prose">{issue.detail}</p>
      {issue.fix
        ? <Notice tone="info" title="A fix is available">{issue.fix.label}. It writes a value the model already contains; it does not invent copy.</Notice>
        : <Notice tone="neutral" title="No automatic fix">This one needs a decision about content or colour, so it is left to a person.</Notice>}
    </Stack>
  );
}

export function CodeDiffPanel({ context }: { context: ScreenContext }) {
  const { record, site, formNames } = useSiteRecord(context);
  const payload = context.overlayPayload as { id?: string } | undefined;
  if (!record) return <NoSite />;
  const issues = auditSite(site, formNames);
  const issue = issues.find((item) => item.id === payload?.id && item.fix) ?? issues.find((item) => item.fix);
  if (!issue) return <Notice tone="success" title="Nothing to change">No check currently proposes an edit to the document.</Notice>;
  const applied = applyFix(site, issue);
  const page = site.pages.find((item) => item.id === issue.pageId) ?? site.pages[0];
  const before = pageHtml(site, page);
  const after = applied ? pageHtml(applied.next, applied.next.pages.find((item) => item.id === page.id) ?? page) : before;
  const diff = diffLines(before, after);
  return (
    <Stack gap={3}>
      <Properties rows={[
        { label: "Change", value: applied?.label ?? "No change computed" },
        { label: "Page", value: `${page.name} (${page.path})` },
        { label: "Lines changed", value: String(diff.filter((line) => line.kind !== "same").length) },
      ]} />
      <pre className="t6-code">
        {diff.map((line, index) => (
          <div key={index} style={{ color: line.kind === "add" ? "var(--success)" : line.kind === "remove" ? "var(--danger)" : undefined }}>
            {line.kind === "add" ? "+ " : line.kind === "remove" ? "- " : "  "}{line.text}
          </div>
        ))}
      </pre>
      <Notice tone="info" title="The diff is the real export">Both sides are produced by the same generator that writes the HTML file, so what is shown is what would ship.</Notice>
    </Stack>
  );
}

function diffLines(before: string, after: string): { kind: "same" | "add" | "remove"; text: string }[] {
  const left = before.split("\n");
  const right = after.split("\n");
  const out: { kind: "same" | "add" | "remove"; text: string }[] = [];
  const max = Math.max(left.length, right.length);
  for (let index = 0; index < max; index += 1) {
    if (left[index] === right[index]) {
      if (left[index] !== undefined) out.push({ kind: "same", text: left[index] });
      continue;
    }
    if (left[index] !== undefined) out.push({ kind: "remove", text: left[index] });
    if (right[index] !== undefined) out.push({ kind: "add", text: right[index] });
  }
  return out.filter((line, index, all) => line.kind !== "same" || all.slice(Math.max(0, index - 2), index + 3).some((entry) => entry.kind !== "same"));
}

export function AuditReport({ context }: { context: ScreenContext }) {
  const { record, site, formNames } = useSiteRecord(context);
  if (!record) return <NoSite />;
  const issues = auditSite(site, formNames);
  const counts = issueCounts(issues);
  return (
    <Stack gap={3}>
      <Properties rows={[
        { label: "Checks run", value: String(issues.length) },
        { label: "Failing", value: String(counts.fail) },
        { label: "To review", value: String(counts.warn) },
        { label: "Passing", value: String(counts.pass) },
        { label: "Recorded run", value: record.fields.lastAuditAt ? context.dateTime(String(record.fields.lastAuditAt)) : "Not yet recorded" },
      ]} />
      <Button
        variant="primary"
        onClick={() => {
          downloadCsv(
            `${context.org.slug}-${record.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-audit.csv`,
            ["area", "level", "check", "detail", "measured", "page"],
            issues.map((issue) => [issue.area, issue.level, issue.title, issue.detail, issue.measured, site.pages.find((page) => page.id === issue.pageId)?.path ?? ""]),
          );
          context.toast("Report exported", `${issues.length} checks written to a CSV file in this browser.`);
        }}
      >
        Export the report as CSV
      </Button>
      <Notice tone="warning" title="A report is evidence, not a certificate">
        Every row names what was measured. Nothing in this report asserts conformance with a standard, because that needs tests this browser cannot run.
      </Notice>
    </Stack>
  );
}

/* ================================================================ *
 * ARL-WEB-009 — Domains & Publishing
 * ================================================================ */

export function DeployConsole({ context, lens }: { context: ScreenContext; lens: "Domains" | "Environments" | "Deployments" | "Logs" }) {
  const { record, site, formNames } = useSiteRecord(context);
  const events = useEvents(record?.id);
  if (!record) return <NoSite />;
  const state = liveState(record, site);

  if (lens === "Domains") {
    return (
      <Stack gap={4}>
        <Row gap={2}><Button variant="primary" onClick={() => context.openOverlay("domain attach")}>Attach a domain</Button></Row>
        {site.domains.length === 0 ? (
          <Empty title="No domain attached" icon={<Globe size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("domain attach")}>Attach a domain</Button>}>
            A domain is recorded here with the DNS records it would need. Verification requires a lookup this browser cannot make.
          </Empty>
        ) : (
          <Grid>
            {site.domains.map((domain) => (
              <Card key={domain.id} span={6} title={domain.host}
                actions={<Pill tone={domain.verified ? "success" : "warning"} dot>{domain.verified ? "Verified" : "Unverified"}</Pill>}
                footer={<>
                  <Button size="sm" variant="secondary" onClick={() => context.openOverlay("DNS instructions", { id: domain.id })}>DNS records</Button>
                  <Button size="sm" variant="ghost" onClick={() => context.openOverlay("domain check", { id: domain.id })}>Run a check</Button>
                  {!domain.primary && (
                    <Button size="sm" variant="ghost" onClick={() => void saveSite(context, record, {
                      ...site,
                      domains: site.domains.map((item) => ({ ...item, primary: item.id === domain.id })),
                    }, `${domain.host} set as the primary domain`)}>Make primary</Button>
                  )}
                </>}>
                <Properties rows={[
                  { label: "Role", value: domain.primary ? "Primary" : "Alias" },
                  { label: "DNS records recorded", value: String(domain.dns.length) },
                  { label: "TLS", value: <Pill tone="warning">Issued by the host, not here</Pill> },
                ]} />
              </Card>
            ))}
          </Grid>
        )}
        <BoundaryNotice id="site.publish" action="Domain verification">
          <p style={{ marginBlockStart: 4 }}>A DNS lookup is a network call. This workspace makes none, so a domain stays unverified and the site is never described as live.</p>
        </BoundaryNotice>
      </Stack>
    );
  }

  if (lens === "Environments") {
    const environments: { name: DeployEntry["environment"]; purpose: string; gate: string }[] = [
      { name: "preview", purpose: "Every export from the builder, for review in this browser.", gate: "No gate." },
      { name: "staging", purpose: "A named export kept for a reviewer.", gate: "Failing accessibility and link checks are listed but do not block." },
      { name: "production", purpose: "What a host would serve.", gate: "Blocked while any check fails or no domain is verified." },
    ];
    const issues = auditSite(site, formNames);
    const failing = issues.filter((issue) => issue.level === "fail");
    return (
      <Grid>
        {environments.map((environment) => {
          const last = [...site.deployments].filter((entry) => entry.environment === environment.name).sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))[0];
          const blocked = environment.name === "production" && (failing.length > 0 || !site.domains.some((domain) => domain.verified));
          return (
            <Card key={environment.name} span={4} title={environment.name} subtitle={environment.purpose}
              actions={<Pill tone={blocked ? "danger" : last ? "info" : "neutral"}>{blocked ? "Blocked" : last ? last.state : "Never used"}</Pill>}
              footer={<Button size="sm" variant={environment.name === "production" ? "secondary" : "ghost"} onClick={() => context.openOverlay("Publish review", { environment: environment.name })}>Review a release</Button>}>
              <Properties rows={[
                { label: "Last attempt", value: last ? context.dateTime(last.at) : "Never" },
                { label: "Gate", value: environment.gate },
                { label: "Now", value: blocked ? `${failing.length} failing checks${site.domains.some((domain) => domain.verified) ? "" : " and no verified domain"}` : "Nothing blocking" },
              ]} />
            </Card>
          );
        })}
        <Card span={12} title="Why production cannot be reached from here" subtitle="The boundary, stated once">
          <BoundaryNotice id="site.publish" action="Promotion to production" />
        </Card>
      </Grid>
    );
  }

  if (lens === "Deployments") {
    return (
      <Stack gap={4}>
        <Row gap={2} wrap>
          <Button variant="primary" onClick={() => context.openOverlay("Publish review", { environment: "production" })}>Publish</Button>
          <Button variant="secondary" onClick={() => {
            downloadFile("index.html", pageHtml(site, site.pages[0]), "text/html");
            context.toast("Export downloaded", "index.html is a complete, standalone page from this browser.");
          }}>Export the home page</Button>
        </Row>
        {site.deployments.length === 0 ? (
          <Empty title="No deployment attempt recorded" icon={<Activity size={20} />}>Publishing records what happened, including when it stopped at the hosting boundary.</Empty>
        ) : (
          <DataGrid
            rows={[...site.deployments].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))}
            rowId={(row) => row.id}
            label="Deployments"
            columns={[
              { key: "at", header: "When", primary: true, cell: (row) => context.dateTime(row.at), sortValue: (row) => row.at },
              { key: "environment", header: "Environment", cell: (row) => <Pill tone="neutral">{row.environment}</Pill> },
              { key: "state", header: "Outcome", cell: (row) => <Pill tone={row.state === "exported" ? "success" : row.state === "rolled_back" ? "warning" : "danger"} dot>{row.state.replace("_", " ")}</Pill> },
              { key: "pages", header: "Pages", align: "end", cell: (row) => String(row.pages) },
              { key: "bytes", header: "Size", align: "end", cell: (row) => `${(row.bytes / 1024).toFixed(1)} kB` },
              { key: "note", header: "Note", cell: (row) => row.note },
              { key: "actor", header: "By", cell: (row) => row.actor },
            ]}
            onOpen={(id) => context.openOverlay("deployment issue", { id })}
            summary={<span>Every row is a recorded attempt. An attempt that stopped at the boundary is kept as blocked, never rewritten as a success.</span>}
          />
        )}
        <Notice tone={state.tone === "success" ? "info" : "warning"} title={state.label}>{state.detail}</Notice>
      </Stack>
    );
  }

  const deployEvents = events.filter((event) => /deploy|publish|export|rollback|domain/i.test(event.message));
  return (
    <Stack gap={4}>
      {deployEvents.length === 0 ? (
        <Empty title="No publishing events yet" icon={<Activity size={20} />}>Publishing, exporting and domain checks all write an audit event, and those events are this log.</Empty>
      ) : (
        <DataGrid
          rows={deployEvents}
          rowId={(row) => row.id}
          label="Publishing log"
          columns={[
            { key: "at", header: "When", primary: true, cell: (row) => context.dateTime(row.at), sortValue: (row) => row.at },
            { key: "actor", header: "Actor", cell: (row) => row.actor },
            { key: "type", header: "Type", cell: (row) => <Pill tone="neutral">{row.type}</Pill> },
            { key: "message", header: "Entry", cell: (row) => row.message, filterValue: (row) => row.message },
          ]}
        />
      )}
      <Notice tone="info" title="This log is the audit trail, not a server log">
        There is no build server, so these are the events this workspace recorded. Nothing is reconstructed.
      </Notice>
    </Stack>
  );
}

export function PublishReview({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, site, formNames } = useSiteRecord(context);
  const { now } = useWorkspace();
  const payload = context.overlayPayload as { environment?: DeployEntry["environment"] } | undefined;
  const environment = payload?.environment ?? "production";
  const [busy, setBusy] = useState(false);
  if (!record) return <NoSite />;
  const issues = auditSite(site, formNames);
  const failing = issues.filter((issue) => issue.level === "fail");
  const verified = site.domains.some((domain) => domain.verified);
  const bytes = exportBytes(site);

  return (
    <Stack gap={4}>
      <ul className="t6-steps">
        <li className="t6-step" data-state={failing.length === 0 ? "done" : "blocked"}>
          <span className="t6-step-n">1</span>Quality gate · {failing.length === 0 ? "clear" : `${failing.length} failing`}
        </li>
        <li className="t6-step" data-state={verified ? "done" : "blocked"}>
          <span className="t6-step-n">2</span>Verified domain · {verified ? "yes" : "none"}
        </li>
        <li className="t6-step" data-state="blocked">
          <span className="t6-step-n">3</span>Hosting connection · not connected
        </li>
        <li className="t6-step" data-state="current">
          <span className="t6-step-n">4</span>Export · available
        </li>
      </ul>

      {failing.length > 0 && (
        <Notice tone="danger" title={`${failing.length} failing ${failing.length === 1 ? "check" : "checks"} would ship`}>
          <ul style={{ margin: "6px 0 0", paddingInlineStart: 18 }}>
            {failing.slice(0, 5).map((issue) => <li key={issue.id}>{issue.title}</li>)}
          </ul>
        </Notice>
      )}

      <Properties rows={[
        { label: "Environment", value: environment },
        { label: "Pages", value: String(site.pages.length) },
        { label: "Export size", value: `${(bytes / 1024).toFixed(1)} kB measured` },
        { label: "Hosting", value: <CapabilityState id="site.publish" /> },
      ]} />

      <BoundaryNotice id="site.publish" action="Publishing" />

      <Card eyebrow="EXPORT" prov="posted" title="What you can take away now" subtitle="Complete, standalone files generated in this browser">
        <Stack gap={2}>
          {site.pages.map((page) => (
            <Row key={page.id} gap={2}>
              <span className="ds-grow"><strong>{page.name}</strong> <code className="ds-subtle">{page.path}</code></span>
              <span className="ds-subtle ds-num">{(new TextEncoder().encode(pageHtml(site, page)).length / 1024).toFixed(1)} kB</span>
              <Button size="sm" variant="secondary" onClick={() => {
                const filename = page.path === "/" ? "index.html" : `${page.path.replace(/^\//, "").replace(/\//g, "-")}.html`;
                downloadFile(filename, pageHtml(site, page), "text/html");
                context.toast("Page exported", `${filename} downloaded.`);
              }}>Download</Button>
            </Row>
          ))}
          {site.seo.sitemap && (
            <Row gap={2}>
              <span className="ds-grow"><strong>Sitemap</strong> <code className="ds-subtle">/sitemap.xml</code></span>
              <Button size="sm" variant="ghost" onClick={() => {
                downloadFile("sitemap.xml", sitemapXml(site, site.domains.find((domain) => domain.primary)?.host ?? ""), "application/xml");
                context.toast("Sitemap exported", "sitemap.xml downloaded.");
              }}>Download</Button>
            </Row>
          )}
        </Stack>
      </Card>

      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const entry: DeployEntry = {
                id: `dep-${Date.now().toString(36)}`,
                at: now.toISOString(),
                environment,
                state: "blocked",
                note: failing.length
                  ? `Stopped at the hosting boundary with ${failing.length} failing checks.`
                  : "Stopped at the hosting boundary. The export was produced instead.",
                pages: site.pages.length,
                bytes,
                actor: context.actor,
              };
              await saveSite(context, record, { ...site, deployments: [...site.deployments, entry] }, `Publish to ${environment} recorded as blocked at the hosting boundary`);
              await context.mutate.log(`Publish attempt for ${record.title} stopped: no hosting provider is connected.`, { entityId: record.id, type: "capability", capability: "not_connected" });
              context.toast("Recorded as not published", "The attempt is in the deployment history as blocked. Download the export above to take the site away.", "blocked");
              close();
            } finally {
              setBusy(false);
            }
          }}
        >
          Record the attempt honestly
        </Button>
        <Button variant="secondary" onClick={() => {
          downloadFile("index.html", pageHtml(site, site.pages[0]), "text/html");
          context.toast("Export downloaded", "index.html is a complete page you can host anywhere.");
        }}>Download index.html</Button>
      </Row>
    </Stack>
  );
}

export function DomainAttachForm({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, site } = useSiteRecord(context);
  const [host, setHost] = useState("");
  if (!record) return <NoSite />;
  const valid = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host.trim().toLowerCase());
  const duplicate = site.domains.some((domain) => domain.host.toLowerCase() === host.trim().toLowerCase());
  return (
    <form
      id="domain-attach"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!valid || duplicate) return;
        const domain: DomainEntry = {
          id: `d-${Date.now().toString(36)}`,
          host: host.trim().toLowerCase(),
          primary: site.domains.length === 0,
          verified: false,
          dns: [
            { type: "A", name: "@", value: "Provided by the host once one is connected" },
            { type: "CNAME", name: "www", value: `${host.trim().toLowerCase()}.` },
            { type: "TXT", name: "_arlovi", value: `arlovi-site=${record.id}` },
          ],
        };
        await saveSite(context, record, { ...site, domains: [...site.domains, domain] }, `Domain ${domain.host} attached as unverified`);
        context.toast("Domain recorded", `${domain.host} is attached and unverified. Nothing was looked up.`);
        close();
      }}
    >
      <Field label="Host name" required error={host && !valid ? "Enter a host name such as northline.co.uk, with no scheme or path." : undefined}>
        <TextInput value={host} onChange={(event) => setHost(event.target.value)} invalid={Boolean(host) && (!valid || duplicate)} placeholder="northline.co.uk" required />
      </Field>
      {duplicate && <Notice tone="danger" title="That host is already attached">A host can only point at one site.</Notice>}
      <Notice tone="warning" title="Attached is not verified">
        The host and the DNS records it would need are stored with the site. Confirming that the records exist needs a DNS lookup, which this workspace does not make, so the domain stays unverified and the site is never shown as live.
      </Notice>
    </form>
  );
}

export function DnsInstructions({ context }: { context: ScreenContext }) {
  const { record, site } = useSiteRecord(context);
  const payload = context.overlayPayload as { id?: string } | undefined;
  const domain = site.domains.find((item) => item.id === payload?.id) ?? site.domains[0];
  if (!record) return <NoSite />;
  if (!domain) return <Empty title="No domain attached" icon={<Globe size={20} />}>Attach a domain first and the records it needs appear here.</Empty>;
  return (
    <Stack gap={3}>
      <p className="ds-prose">Add these records at your registrar for <strong>{domain.host}</strong>. The TXT record is how a host would later confirm this workspace asked for the domain.</p>
      <div className="t6-matrix-wrap">
        <table className="t6-matrix">
          <caption className="ds-sr-only">DNS records for {domain.host}</caption>
          <thead><tr><th scope="col">Type</th><th scope="col">Name</th><th scope="col">Value</th></tr></thead>
          <tbody>
            {domain.dns.map((entry) => (
              <tr key={`${entry.type}-${entry.name}`}><td><code>{entry.type}</code></td><td><code>{entry.name}</code></td><td><code>{entry.value}</code></td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <Notice tone="warning" title="The A record has no address yet">
        An address comes from the host that serves the site. None is connected, so that value is left as a description rather than a number that would not work.
      </Notice>
    </Stack>
  );
}

export function DomainCheck({ context }: { context: ScreenContext }) {
  const { record, site } = useSiteRecord(context);
  const { now } = useWorkspace();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const domain = site.domains.find((item) => item.id === payload?.id) ?? site.domains[0];
  const [ran, setRan] = useState(false);
  if (!record) return <NoSite />;
  if (!domain) return <Empty title="No domain to check" icon={<Globe size={20} />} />;
  const checks = [
    { label: "Host name is syntactically valid", state: /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain.host) ? "pass" : "fail", measured: "pattern match in this browser" },
    { label: "Records to add are recorded", state: domain.dns.length >= 2 ? "pass" : "warn", measured: `${domain.dns.length} records stored` },
    { label: "DNS resolves to this site", state: "warn", measured: "not attempted: a DNS lookup is a network call" },
    { label: "TLS certificate issued", state: "warn", measured: "not attempted: issued by the host" },
  ] as const;
  return (
    <Stack gap={3}>
      <div className="t6-checks">
        {checks.map((check) => (
          <div key={check.label} className="t6-check" data-state={check.state}>
            <span className="t6-check-dot" aria-hidden="true" />
            <div>
              <strong>{check.label}</strong>
              <p className="ds-subtle" style={{ fontSize: "var(--text-xs)" }}>{check.measured}</p>
            </div>
            <Pill tone={check.state === "pass" ? "success" : "warning"}>{check.state === "pass" ? "checked" : "not checked"}</Pill>
          </div>
        ))}
      </div>
      <Button
        variant="primary"
        disabled={ran}
        onClick={async () => {
          setRan(true);
          await context.mutate.log(`Domain check for ${domain.host}: two local checks passed, DNS and TLS could not be attempted from a browser.`, { entityId: record.id, type: "capability", capability: "not_connected" });
          context.toast("Check recorded", `${domain.host} stays unverified. The result is in the publishing log.`, "blocked");
        }}
      >
        {ran ? "Result recorded" : "Run the check and record the result"}
      </Button>
      <Notice tone="warning" title="Two of four checks cannot be run here">
        The result written to the log says exactly that, so a reader never takes an unverified domain for a working one. Checked at {context.dateTime(now)}.
      </Notice>
    </Stack>
  );
}

export function DeploymentIssue({ context }: { context: ScreenContext }) {
  const { record, site } = useSiteRecord(context);
  const payload = context.overlayPayload as { id?: string } | undefined;
  const entry = site.deployments.find((item) => item.id === payload?.id) ?? [...site.deployments].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))[0];
  if (!record) return <NoSite />;
  if (!entry) return <Empty title="No deployment recorded" icon={<Activity size={20} />} />;
  const previous = [...site.deployments].filter((item) => item.id !== entry.id && item.state === "exported").sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))[0];
  return (
    <Stack gap={3}>
      <Properties rows={[
        { label: "When", value: context.dateTime(entry.at) },
        { label: "Environment", value: entry.environment },
        { label: "Outcome", value: <Pill tone={entry.state === "exported" ? "success" : entry.state === "rolled_back" ? "warning" : "danger"}>{entry.state.replace("_", " ")}</Pill> },
        { label: "Pages", value: String(entry.pages) },
        { label: "Size", value: `${(entry.bytes / 1024).toFixed(1)} kB` },
        { label: "By", value: entry.actor },
      ]} />
      <p className="ds-prose">{entry.note}</p>
      {previous ? (
        <Button
          variant="secondary"
          onClick={async () => {
            await saveSite(context, record, {
              ...site,
              deployments: site.deployments.map((item) => (item.id === entry.id ? { ...item, state: "rolled_back" as const, note: `Rolled back to the export from ${previous.at}.` } : item)),
            }, `Deployment ${entry.id} rolled back to the export from ${previous.at}`);
            context.toast("Rolled back", "The record now shows this attempt as rolled back to the earlier export.");
          }}
        >
          Roll back to the export from {context.date(previous.at)}
        </Button>
      ) : (
        <Notice tone="neutral" title="Nothing to roll back to">No earlier successful export is recorded for this site.</Notice>
      )}
    </Stack>
  );
}

/* ================================================================ *
 * ARL-WEB-010 — Web Analytics
 * ================================================================ */

export function AnalyticsPanel({ context, lens }: { context: ScreenContext; lens: "Traffic" | "Conversion" | "Events" | "Content" }) {
  const { record, site, forms } = useSiteRecord(context);
  const submissions = useCollection("submissions");
  const events = useEvents(record?.id);
  const { now, org } = useWorkspace();
  const [compare, setCompare] = useState<"off" | "on">("off");

  const boundFormIds = useMemo(
    () => site.pages.flatMap((page) => page.blocks).filter((block) => block.type === "form").map((block) => block.props.formId).filter(Boolean),
    [site],
  );
  const siteSubmissions = useMemo(
    () => submissions.filter((row) => boundFormIds.includes(String(row.parentId ?? ""))),
    [submissions, boundFormIds],
  );
  const months = useMemo(() => [5, 4, 3, 2, 1, 0].map((back) => {
    const start = startOfMonth(addMonths(now, -back));
    const end = addMonths(start, 1);
    return {
      label: start.toLocaleString(org.locale, { month: "short" }),
      value: siteSubmissions.filter((row) => {
        const at = new Date(row.at ?? row.createdAt);
        return at >= start && at < end;
      }).length,
    };
  }), [siteSubmissions, now, org.locale]);

  if (!record) return <NoSite />;

  if (lens === "Traffic") {
    return (
      <Stack gap={5}>
        <StatRow>
          <Stat label="Visits" value="Unavailable" unavailable meta="No analytics source connected" onClick={() => context.openOverlay("Metric source", { metric: "visits" })} />
          <Stat label="Unique visitors" value="Unavailable" unavailable meta="Needs a counting service" onClick={() => context.openOverlay("Metric source", { metric: "visits" })} />
          <Stat prov="posted" label="Consent" value={site.analytics.consent.replace("_", " ")} meta="No banner has been shown" />
          <Stat prov="posted" label="Measured loss" value="100%" meta="Nothing is counted, so nothing is sampled" onClick={() => context.openOverlay("attribution note")} />
        </StatRow>
        <Notice tone="warning" title="There is no traffic figure to show">
          Counting a visit needs a request to reach a server. This site is a model and an export in your browser, so no visit has ever been observed. The panel is left blank rather than filled with a plausible number.
        </Notice>
        <Card eyebrow="NOT MEASURED" prov="unknown" title="What a connected source would add" subtitle="Stated so the gap is legible">
          <Properties rows={[
            { label: "Visits and sessions", value: <Pill tone="warning">Needs a counting service</Pill> },
            { label: "Referrer and campaign", value: <Pill tone="warning">Needs request headers</Pill> },
            { label: "Country and device", value: <Pill tone="warning">Needs request metadata</Pill> },
            { label: "Form submissions", value: <Pill tone="success">Already measured here</Pill> },
            { label: "Editing activity", value: <Pill tone="success">Already measured here</Pill> },
          ]} />
        </Card>
      </Stack>
    );
  }

  if (lens === "Conversion") {
    const perForm = forms
      .filter((form) => boundFormIds.includes(form.id))
      .map((form) => ({ form, count: submissions.filter((row) => row.parentId === form.id).length }));
    return (
      <Stack gap={5}>
        <StatRow>
          <Stat prov="posted" label="Submissions" value={String(siteSubmissions.length)} meta="Records created by a form on this site" />
          <Stat prov="posted" label="Forms embedded" value={String(boundFormIds.length)} meta={`${site.pages.filter((page) => page.blocks.some((block) => block.type === "form")).length} pages carry one`} />
          <Stat label="Conversion rate" value="Unavailable" unavailable meta="A rate needs a visit count" onClick={() => context.openOverlay("Metric source", { metric: "rate" })} />
          <Stat prov="posted" label="Latest" value={siteSubmissions.length ? context.relative([...siteSubmissions].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))[0].at) : "None"} meta="From the submission records" />
        </StatRow>
        <Row gap={3} wrap>
          <Segmented
            label="Compare periods"
            value={compare}
            onChange={setCompare}
            options={[{ value: "off" as const, label: "Last six months" }, { value: "on" as const, label: "Compare halves" }]}
          />
          <Button variant="secondary" onClick={() => {
            downloadCsv(`${org.slug}-site-conversions.csv`, ["month", "submissions"], months.map((month) => [month.label, month.value]));
            context.toast("Exported", "The monthly submission counts are in a CSV file.");
          }}>Export CSV</Button>
        </Row>
        <Card eyebrow="CONVERSION" prov="posted" title="Submissions by month" subtitle="Counted from submission records in this workspace">
          <BarChart
            title="Form submissions by month"
            height={220}
            format={(value) => String(Math.round(value))}
            series={compare === "on"
              ? [
                { name: "First three months", points: months.slice(0, 3).map((month) => ({ label: month.label, value: month.value })) },
                { name: "Last three months", points: months.slice(3).map((month) => ({ label: month.label, value: month.value })) },
              ]
              : [{ name: "Submissions", points: months }]}
            footer={`Total ${siteSubmissions.length} submissions. There is no visit denominator, so no percentage is shown.`}
          />
        </Card>
        {perForm.length > 0 && (
          <Card title="By form" subtitle="Each row is a form record">
            <Stack gap={2}>
              {perForm.map(({ form, count }) => (
                <Row key={form.id} gap={2}><span className="ds-grow">{form.title}</span><strong className="ds-num">{count}</strong></Row>
              ))}
            </Stack>
          </Card>
        )}
      </Stack>
    );
  }

  if (lens === "Events") {
    return (
      <Stack gap={4}>
        <Row gap={2}>
          <Button variant="secondary" onClick={() => context.openOverlay("event setup")}>Event setup</Button>
          <Button variant="ghost" onClick={() => {
            downloadCsv(`${org.slug}-site-events.csv`, ["at", "actor", "type", "message"], events.map((event) => [event.at, event.actor, event.type, event.message]));
            context.toast("Exported", `${events.length} events written to CSV.`);
          }}>Export events</Button>
        </Row>
        {events.length === 0 ? (
          <Empty title="No events recorded for this site" icon={<Activity size={20} />}>Editing, publishing and form submissions all write an event here.</Empty>
        ) : (
          <DataGrid
            rows={events}
            rowId={(row) => row.id}
            label="Site events"
            columns={[
              { key: "at", header: "When", primary: true, cell: (row) => context.dateTime(row.at), sortValue: (row) => row.at },
              { key: "type", header: "Type", cell: (row) => <Pill tone="neutral">{row.type}</Pill> },
              { key: "actor", header: "Actor", cell: (row) => row.actor },
              { key: "message", header: "Event", cell: (row) => row.message, filterValue: (row) => row.message },
            ]}
          />
        )}
        <Notice tone="info" title="These are workspace events, not visitor events">
          Every row was caused by someone working in this browser. A visitor event would need a collector on the hosted site.
        </Notice>
      </Stack>
    );
  }

  const pageRows = site.pages.map((page) => ({
    page,
    bytes: new TextEncoder().encode(pageHtml(site, page)).length,
    forms: page.blocks.filter((block) => block.type === "form").length,
  }));
  return (
    <Stack gap={4}>
      <DataGrid
        rows={pageRows}
        rowId={(row) => row.page.id}
        label="Content"
        columns={[
          { key: "name", header: "Page", primary: true, cell: (row) => row.page.name, sortValue: (row) => row.page.name, filterValue: (row) => row.page.name },
          { key: "path", header: "Address", cell: (row) => <code>{row.page.path}</code> },
          { key: "blocks", header: "Blocks", align: "end", cell: (row) => String(row.page.blocks.length), sortValue: (row) => row.page.blocks.length },
          { key: "bytes", header: "HTML", align: "end", cell: (row) => `${(row.bytes / 1024).toFixed(1)} kB`, sortValue: (row) => row.bytes },
          { key: "forms", header: "Form blocks", align: "end", cell: (row) => String(row.forms) },
          { key: "views", header: "Views", align: "end", cell: () => <span className="ds-subtle">Unavailable</span> },
        ]}
        summary={<span>Page weight is measured by generating the export. View counts stay blank because nothing counts them.</span>}
      />
      <Notice tone="info" title="Content performance without traffic">
        Structure can be compared without visitors: block count and document weight are real, and they are the two things a page owner can act on from here.
      </Notice>
    </Stack>
  );
}

export function MetricSource({ context }: { context: ScreenContext }) {
  const { record, site } = useSiteRecord(context);
  const submissions = useCollection("submissions");
  const payload = context.overlayPayload as { metric?: string } | undefined;
  if (!record) return <NoSite />;
  const metric = payload?.metric ?? "visits";
  if (metric === "visits" || metric === "rate") {
    return (
      <Stack gap={3}>
        <Properties rows={[
          { label: "Metric", value: metric === "rate" ? "Conversion rate" : "Visits" },
          { label: "Source", value: "None" },
          { label: "Why", value: "Counting a visit requires a request to reach a server. This workspace serves nothing and calls nothing." },
          { label: "State", value: <Pill tone="warning" dot>Unavailable</Pill> },
        ]} />
        <Notice tone="warning" title="No figure is shown for this metric">
          {metric === "rate"
            ? "A rate needs both a numerator and a denominator. Submissions are counted; visits are not, so the rate is left blank rather than computed from a guess."
            : "The panel shows unavailable with the reason, which is the only honest value."}
        </Notice>
      </Stack>
    );
  }
  const bound = site.pages.flatMap((page) => page.blocks).filter((block) => block.type === "form").map((block) => block.props.formId);
  const rows = submissions.filter((row) => bound.includes(String(row.parentId ?? "")));
  return (
    <Stack gap={3}>
      <p className="ds-subtle">Computed from {rows.length} submission records. Each row below is the source of the figure.</p>
      <DataGrid
        rows={rows}
        rowId={(row: Rec) => row.id}
        label="Metric sources"
        filterable={false}
        columns={[
          { key: "title", header: "Submission", primary: true, cell: (row: Rec) => row.title },
          { key: "at", header: "Received", cell: (row: Rec) => context.dateTime(row.at ?? row.createdAt) },
        ]}
      />
    </Stack>
  );
}

export function EventSetup({ context }: { context: ScreenContext }) {
  const { record, site } = useSiteRecord(context);
  if (!record) return <NoSite />;
  const candidates = [
    { name: "Form submitted", measurable: true, how: "A submission record is created, so the count is exact." },
    { name: "Page edited", measurable: true, how: "Each builder write records an audit event." },
    { name: "Export downloaded", measurable: true, how: "The export action records an event before the file is written." },
    { name: "Call to action clicked", measurable: false, how: "A click on the exported site needs a collector on the host." },
    { name: "Scroll depth", measurable: false, how: "Needs a script running on the hosted page." },
  ];
  return (
    <Stack gap={3}>
      <p className="ds-prose">An event can only be offered here if something in this workspace observes it. The list says which ones do.</p>
      <Stack gap={2}>
        {candidates.map((candidate) => (
          <Row key={candidate.name} gap={2} className="ds-panel" style={{ padding: "var(--space-3)" }}>
            <div className="ds-grow">
              <strong>{candidate.name}</strong>
              <p className="ds-subtle">{candidate.how}</p>
            </div>
            <Pill tone={candidate.measurable ? "success" : "warning"}>{candidate.measurable ? "Measured" : "Not available"}</Pill>
          </Row>
        ))}
      </Stack>
      <Checkbox label="Write an attention item when a form submission arrives" defaultChecked />
      <Notice tone="info" title="Consent comes first">
        Any counting on a hosted site would need the consent state on this site to be granted. It is currently {site.analytics.consent.replace("_", " ")}.
      </Notice>
    </Stack>
  );
}

export function AttributionNote({ context }: { context: ScreenContext }) {
  const { site } = useSiteRecord(context);
  return (
    <Stack gap={3}>
      <Properties rows={[
        { label: "Consent state", value: <Pill tone="warning">{site.analytics.consent.replace("_", " ")}</Pill> },
        { label: "Cookies set", value: "None" },
        { label: "Identifiers stored", value: "None" },
        { label: "Measured loss", value: "100% — nothing is counted at all" },
      ]} />
      <Notice tone="warning" title="Attribution is not partially available; it is absent">
        A site that counts nothing has no attribution model. When a counting service is connected, the share of visits lost to declined consent will be shown here as a measured figure, not as an estimate.
      </Notice>
      <Row gap={2}>
        <ShieldCheck size={16} aria-hidden="true" />
        <span className="ds-subtle">No personal data from a visitor has ever been in this workspace.</span>
      </Row>
    </Stack>
  );
}

export function RunAuditAction(context: ScreenContext, record: Rec, site: SiteModel, formNames: Record<string, string>, nowIso: string): Promise<void> {
  const issues = auditSite(site, formNames);
  const counts = issueCounts(issues);
  return context.mutate.patch(record.id, {
    fields: { ...record.fields, lastAuditAt: nowIso, auditFail: counts.fail, auditWarn: counts.warn, auditPass: counts.pass },
  }, { event: `Audit run: ${counts.fail} failing, ${counts.warn} to review, ${counts.pass} passing` }).then(() => {
    context.toast("Audit recorded", `${issues.length} checks computed. ${counts.fail} failing.`, counts.fail ? "blocked" : "ok");
  });
}


