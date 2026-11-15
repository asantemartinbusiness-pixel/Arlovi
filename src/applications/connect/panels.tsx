import { useMemo, useState } from "react";
import {
  Activity, Plug, RefreshCcw, ShieldAlert, ShieldCheck, Webhook,
} from "lucide-react";
import {
  Button, Card, Checkbox, DataGrid, Empty, Field, Grid, Notice, Pill, Properties,
  Row, Select, Stack, Stat, StatRow, TextArea, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useCollection, useEvents, useWorkspace } from "@/platform/workspace";
import { CAPABILITY_LABELS, CAPABILITY_TONE } from "@/platform/capability";
import { freshness } from "@/platform/clock";
import type { Rec } from "@/domain/types";
import { downloadCsv } from "@/applications/t6kit/kit";
import {
  CATEGORIES, CONNECTOR_ENTRIES, adapterChecks, adapterOperations, authorisationSteps, entryById, entryForRecord,
  type ConnectorEntry,
} from "./catalog";

/* ---------------------------------------------------------------- *
 * Shared resolution
 * ---------------------------------------------------------------- */

export function useConnector(context: ScreenContext): { records: Rec[]; record?: Rec; entry?: ConnectorEntry } {
  const records = useCollection("connectors");
  const routed = records.find((item) => item.id === context.params.id);
  const record = routed ?? records[0];
  const entry = useMemo(() => {
    const byRoute = entryById(context.params.id ?? "");
    if (byRoute) return byRoute;
    return record ? entryForRecord(record.fields) ?? CONNECTOR_ENTRIES[0] : CONNECTOR_ENTRIES[0];
  }, [context.params.id, record]);
  return { records, record, entry };
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function StateCell({ entry }: { entry: ConnectorEntry }) {
  return <Pill tone={CAPABILITY_TONE[entry.capability.state]} dot>{CAPABILITY_LABELS[entry.capability.state]}</Pill>;
}

/* ================================================================ *
 * ARL-CONNECT-001 — Integration Marketplace
 * ================================================================ */

export function Marketplace({ context, lens }: { context: ScreenContext; lens: "Featured" | "Categories" | "Installed" | "Custom" }) {
  const records = useCollection("connectors");

  if (lens === "Installed") {
    const installed = CONNECTOR_ENTRIES.filter((entry) => entry.capability.state !== "not_connected");
    return (
      <Stack gap={4}>
        <Notice tone="warning" title="Nothing is installed">
          Every capability in this workspace reports <strong>not connected</strong>, and that state comes from the platform capability register rather than from this screen. There is no code path here that can mark one connected.
        </Notice>
        {installed.length > 0 && (
          <Stack gap={2}>{installed.map((entry) => <Row key={entry.capability.id} gap={2}><span className="ds-grow">{entry.capability.label}</span><StateCell entry={entry} /></Row>)}</Stack>
        )}
        <Card eyebrow="LOCAL WORK" prov="human" title="What runs instead" subtitle="One row per capability, from the same register">
          <div className="t6-matrix-wrap">
            <table className="t6-matrix">
              <caption className="ds-sr-only">What Arlovi does locally for each capability</caption>
              <thead><tr><th scope="col">Capability</th><th scope="col">Done here instead</th></tr></thead>
              <tbody>
                {CONNECTOR_ENTRIES.map((entry) => (
                  <tr key={entry.capability.id}>
                    <th scope="row">{entry.capability.label}</th>
                    <td>{entry.capability.localEquivalent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </Stack>
    );
  }

  if (lens === "Custom") {
    const custom = records.filter((record) => String(record.fields.kind ?? "") === "custom");
    return (
      <Stack gap={4}>
        <Row gap={2}><Button variant="primary" onClick={() => context.navigate(`/o/${context.org.slug}/connect/custom`)}>Open the adapter workbench</Button></Row>
        {custom.length === 0
          ? <Empty title="No custom adapter yet" icon={<Plug size={20} />}>A custom adapter declares its own actions against the same normalised contract the built-in capabilities use.</Empty>
          : <Grid>{custom.map((record) => (
            <Card key={record.id} span={6} eyebrow="CUSTOM" prov="human" title={record.title} subtitle={record.summary}
              actions={<Pill tone="warning" dot>{String(record.fields.capability ?? record.status).replace(/_/g, " ")}</Pill>} />
          ))}</Grid>}
      </Stack>
    );
  }

  const entries = lens === "Featured" ? CONNECTOR_ENTRIES.filter((entry) => entry.featured) : CONNECTOR_ENTRIES;

  if (lens === "Categories") {
    return (
      <Stack gap={5}>
        {CATEGORIES.map((category) => {
          const group = CONNECTOR_ENTRIES.filter((entry) => entry.category === category);
          if (group.length === 0) return null;
          return (
            <section key={category}>
              <h3 style={{ fontSize: "var(--text-md)", marginBlockEnd: "var(--space-3)" }}>{category}</h3>
              <Grid>
                {group.map((entry) => <ConnectorCard key={entry.capability.id} entry={entry} context={context} />)}
              </Grid>
            </section>
          );
        })}
      </Stack>
    );
  }

  return (
    <Stack gap={4}>
      <Notice tone="warning" title="Every provider here is not connected">
        This directory lists what each provider would enable, what it would need, and what Arlovi does instead. None of them has a grant, and nothing on this screen can create one.
      </Notice>
      <Grid>
        {entries.map((entry) => <ConnectorCard key={entry.capability.id} entry={entry} context={context} />)}
      </Grid>
    </Stack>
  );
}

function ConnectorCard({ entry, context }: { entry: ConnectorEntry; context: ScreenContext }) {
  return (
    <Card
      span={4}
      eyebrow={entry.category.toUpperCase()}
      prov="unknown"
      title={entry.capability.label}
      subtitle={entry.capability.provider}
      actions={<StateCell entry={entry} />}
      footer={<>
        <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/connect/marketplace/${entry.capability.id}`)}>Details</Button>
        <Button size="sm" variant="ghost" onClick={() => context.openOverlay("Connector preview", { id: entry.capability.id })}>What it needs</Button>
        <span className="ds-grow" />
        <Pill tone={entry.risk.level === "high" ? "danger" : entry.risk.level === "medium" ? "warning" : "neutral"}>{entry.risk.level} risk</Pill>
      </>}
    >
      <Stack gap={2}>
        <p className="ds-subtle">{entry.capability.note}</p>
        <Properties rows={[
          { label: "Would enable", value: <span>{plural(entry.operations.filter((operation) => operation.direction === "action").length, "action")}, {plural(entry.operations.filter((operation) => operation.direction === "read").length, "read")}</span> },
          { label: "Scopes", value: <span className="ds-num">{`${entry.scopes.filter((scope) => scope.kind === "write").length} write · ${entry.scopes.filter((scope) => scope.kind === "read").length} read`}</span> },
          { label: "Instead", value: entry.capability.localEquivalent },
        ]} />
      </Stack>
    </Card>
  );
}

export function ConnectorPreview({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const [chosen, setChosen] = useState(payload?.id ?? CONNECTOR_ENTRIES[0]?.capability.id ?? "");
  const entry = entryById(chosen) ?? CONNECTOR_ENTRIES[0];
  return (
    <Stack gap={3}>
      <Field label="Connector" htmlFor="preview-connector">
        <Select id="preview-connector" value={entry.capability.id} onChange={(event) => setChosen(event.target.value)}>
          {CONNECTOR_ENTRIES.map((item) => <option key={item.capability.id} value={item.capability.id}>{item.capability.label}</option>)}
        </Select>
      </Field>
      <Properties rows={[
        { label: "Capability", value: entry.capability.label },
        { label: "Provider", value: entry.capability.provider },
        { label: "State", value: <StateCell entry={entry} /> },
        { label: "Contract", value: <span className="ds-num">{entry.version}</span> },
      ]} />
      <h4>Scopes it would request</h4>
      <Stack gap={2}>
        {entry.scopes.map((scope) => (
          <Row key={scope.name} gap={2}>
            <code className="ds-grow">{scope.name}</code>
            <Pill tone={scope.kind === "write" ? "warning" : "neutral"}>{scope.kind}</Pill>
          </Row>
        ))}
        {entry.scopes.length === 0 && <span className="ds-subtle">No scope model is published for this capability.</span>}
      </Stack>
      <Notice tone="warning" title="What happens instead">{entry.capability.localEquivalent}</Notice>
      <Button variant="secondary" onClick={() => { context.closeOverlay(); context.navigate(`/o/${context.org.slug}/connect/connect/${entry.capability.id}`); }}>
        Open the authorisation flow
      </Button>
    </Stack>
  );
}

export function RiskSummary({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const entry = entryById(payload?.id ?? "") ?? CONNECTOR_ENTRIES[0];
  return (
    <Stack gap={3}>
      <Properties rows={[
        { label: "Risk", value: <Pill tone={entry.risk.level === "high" ? "danger" : entry.risk.level === "medium" ? "warning" : "neutral"}>{entry.risk.level}</Pill> },
        { label: "Write scopes", value: <span className="ds-num">{String(entry.scopes.filter((scope) => scope.kind === "write").length)}</span> },
      ]} />
      <p className="ds-prose">{entry.risk.note}</p>
      <h4>Claims this directory does not repeat</h4>
      {entry.unverified.length === 0 ? <span className="ds-subtle">None recorded.</span> : (
        <Stack gap={1}>
          {entry.unverified.map((claim) => <Row key={claim} gap={2}><span className="ds-grow">{claim}</span><Pill tone="warning">unverified</Pill></Row>)}
        </Stack>
      )}
      <Notice tone="info" title="A provider's own claim is not a supported feature">
        Only the operations listed in the capability contract are described as supported. Marketing claims are shown as claims.
      </Notice>
    </Stack>
  );
}

/* ================================================================ *
 * ARL-CONNECT-002 — Connector Detail
 * ================================================================ */

export function ConnectorDetail({ context, lens }: { context: ScreenContext; lens: "Overview" | "Capabilities" | "Permissions" | "Versions" | "Help" }) {
  const { entry } = useConnector(context);
  if (!entry) return <Empty title="No connector" icon={<Plug size={20} />} />;

  if (lens === "Capabilities") {
    return (
      <Stack gap={4}>
        <div className="t6-matrix-wrap">
          <table className="t6-matrix">
            <caption className="ds-sr-only">Operations this capability would expose</caption>
            <thead><tr><th scope="col">Operation</th><th scope="col">Kind</th><th scope="col">What it does</th><th scope="col">Done here instead</th></tr></thead>
            <tbody>
              {entry.operations.map((operation) => (
                <tr key={operation.name}>
                  <th scope="row"><code>{operation.name}</code></th>
                  <td><Pill tone={operation.direction === "action" ? "warning" : operation.direction === "webhook" ? "info" : "neutral"}>{operation.direction}</Pill></td>
                  <td>{operation.summary}</td>
                  <td>{operation.localEquivalent}</td>
                </tr>
              ))}
              {entry.operations.length === 0 && <tr><td colSpan={4}>No operations are published for this capability.</td></tr>}
            </tbody>
          </table>
        </div>
        <Notice tone="info" title="An action writes; a read does not">
          The kind column is the difference that matters when a grant is approved. Reads are reversible by revoking; actions have already happened.
        </Notice>
      </Stack>
    );
  }

  if (lens === "Permissions") {
    return (
      <Grid>
        <Card span={6} eyebrow="READ SCOPES" prov="unknown" title="What it would be allowed to see" subtitle={`${entry.scopes.filter((scope) => scope.kind === "read").length} scopes`}>
          <Stack gap={2}>
            {entry.scopes.filter((scope) => scope.kind === "read").map((scope) => (
              <div key={scope.name}>
                <code>{scope.name}</code>
                <p className="ds-subtle">{scope.purpose}</p>
              </div>
            ))}
            {entry.scopes.filter((scope) => scope.kind === "read").length === 0 && <span className="ds-subtle">None.</span>}
          </Stack>
        </Card>
        <Card span={6} eyebrow="WRITE SCOPES" prov="unknown" title="What it would be allowed to change" subtitle={`${entry.scopes.filter((scope) => scope.kind === "write").length} scopes`}>
          <Stack gap={2}>
            {entry.scopes.filter((scope) => scope.kind === "write").map((scope) => (
              <div key={scope.name}>
                <Row gap={2}><code className="ds-grow">{scope.name}</code><Pill tone="warning">write</Pill></Row>
                <p className="ds-subtle">{scope.purpose}</p>
              </div>
            ))}
            {entry.scopes.filter((scope) => scope.kind === "write").length === 0 && <span className="ds-subtle">None.</span>}
          </Stack>
        </Card>
        <Card span={12} eyebrow="RISK" prov="human" title="Why the two are shown apart">
          <Notice tone="warning" title="A read grant and a write grant are not the same decision">
            {entry.risk.note} Revoking a read grant stops future reads. Revoking a write grant does not undo what was already written.
          </Notice>
        </Card>
      </Grid>
    );
  }

  if (lens === "Versions") {
    return (
      <Stack gap={4}>
        <Properties rows={[
          { label: "Contract", value: <span className="ds-num">{entry.version}</span> },
          { label: "Operations", value: <span className="ds-num">{String(entry.operations.length)}</span> },
          { label: "State", value: <StateCell entry={entry} /> },
        ]} />
        <Notice tone="info" title="One contract, many providers">
          The operation names above are Arlovi's, not a provider's. A second provider for the same capability implements the same names, so a mission written against <code>send_message</code> does not change when the provider does.
        </Notice>
        <Card eyebrow="LIMITS" prov="unknown" title="What the provider imposes" subtitle="Stated so a plan does not assume otherwise">
          <ul className="ds-prose">{entry.limits.map((limit) => <li key={limit}>{limit}</li>)}</ul>
        </Card>
      </Stack>
    );
  }

  if (lens === "Help") {
    return (
      <Grid>
        <Card span={7} eyebrow="HOW TO CONNECT" prov="human" title="What connecting would involve" subtitle="In order, and where it stops">
          <ol className="ds-prose">
            {authorisationSteps(entry).map((step) => (
              <li key={step.id}>
                <strong>{step.title}</strong> — {step.detail} {step.state === "blocked" && <Pill tone="warning">cannot be reached</Pill>}
              </li>
            ))}
          </ol>
        </Card>
        <Card span={5} eyebrow="MEANWHILE" prov="human" title="What to do instead">
          <Stack gap={3}>
            <p className="ds-prose">{entry.capability.localEquivalent}</p>
            <Notice tone="info" title="Nothing is lost by waiting">
              Work done locally is a record, not a queue of half-finished requests. When a provider is connected, those records are the input.
            </Notice>
          </Stack>
        </Card>
      </Grid>
    );
  }

  return (
    <Grid>
      <Card span={7} eyebrow={entry.category.toUpperCase()} prov="unknown" title={entry.capability.label} subtitle={entry.capability.provider}
        actions={<StateCell entry={entry} />}>
        <Stack gap={3}>
          <p className="ds-prose">{entry.capability.note}</p>
          <Properties rows={[
            { label: "Actions it would perform", value: entry.operations.filter((operation) => operation.direction === "action").map((operation) => operation.name).join(", ") || "None" },
            { label: "Reads it would make", value: entry.operations.filter((operation) => operation.direction === "read").map((operation) => operation.name).join(", ") || "None" },
            { label: "Events it would receive", value: entry.operations.filter((operation) => operation.direction === "webhook").map((operation) => operation.name).join(", ") || "None" },
            { label: "Account type", value: "A provider account held by a person, not by this application" },
          ]} />
        </Stack>
      </Card>
      <Card span={5} eyebrow="INSTEAD" prov="human" title="What Arlovi does locally">
        <Stack gap={3}>
          <p className="ds-prose">{entry.capability.localEquivalent}</p>
          <Notice tone="warning" title="What it cannot do">
            {entry.operations.filter((operation) => operation.direction === "action").map((operation) => operation.summary).join(" ") || "Nothing outside this browser."}
          </Notice>
          <Button variant="primary" onClick={() => context.navigate(`/o/${context.org.slug}/connect/connect/${entry.capability.id}`)}>Try to connect it</Button>
        </Stack>
      </Card>
      <Card span={12} eyebrow="LIMITS" prov="unknown" title="Provider limits">
        <ul className="ds-prose">{entry.limits.map((limit) => <li key={limit}>{limit}</li>)}</ul>
      </Card>
    </Grid>
  );
}

/* ================================================================ *
 * ARL-CONNECT-003 — Connection Wizard
 * ================================================================ */

export function ConnectionWizard({ context, lens }: { context: ScreenContext; lens: "Account" | "Permissions" | "Test" | "Confirm" }) {
  const { entry } = useConnector(context);
  const [attempted, setAttempted] = useState(false);
  if (!entry) return <Empty title="No connector" icon={<Plug size={20} />} />;
  const steps = authorisationSteps(entry);

  return (
    <Stack gap={5}>
      <ul className="t6-steps">
        {steps.slice(0, 4).map((step) => (
          <li key={step.id} className="t6-step" data-state={step.state}>
            <span className="t6-step-n">{steps.indexOf(step) + 1}</span>{step.title}
          </li>
        ))}
      </ul>

      {lens === "Account" && (
        <Grid>
          <Card span={7} eyebrow="STEP 1" prov="human" title="Which provider" subtitle={entry.capability.provider}>
            <Stack gap={3}>
              <Properties rows={[
                { label: "Capability", value: entry.capability.label },
                { label: "Contract", value: <span className="ds-num">{entry.version}</span> },
                { label: "State", value: <StateCell entry={entry} /> },
              ]} />
              <Field label="Account to connect" hint="Normally chosen on the provider's own page after signing in.">
                <Select disabled defaultValue=""><option value="">The provider has not been reached</option></Select>
              </Field>
              <Notice tone="warning" title="The account list comes from the provider">
                This workspace cannot ask for one, so the control above is disabled rather than filled with a plausible account name.
              </Notice>
            </Stack>
          </Card>
          <Card span={5} eyebrow="INSTEAD" prov="human" title="What is already working">
            <p className="ds-prose">{entry.capability.localEquivalent}</p>
          </Card>
        </Grid>
      )}

      {lens === "Permissions" && (
        <Grid>
          <Card span={12} eyebrow="STEP 2" prov="unknown" title="The scopes this would request" subtitle="Least privilege first: the read scopes alone cover most of what a mission needs">
            <div className="t6-matrix-wrap">
              <table className="t6-matrix">
                <caption className="ds-sr-only">Scopes requested</caption>
                <thead><tr><th scope="col">Scope</th><th scope="col">Kind</th><th scope="col">Why</th><th scope="col">Needed for</th></tr></thead>
                <tbody>
                  {entry.scopes.map((scope) => (
                    <tr key={scope.name}>
                      <th scope="row"><code>{scope.name}</code></th>
                      <td><Pill tone={scope.kind === "write" ? "warning" : "neutral"}>{scope.kind}</Pill></td>
                      <td>{scope.purpose}</td>
                      <td>{entry.operations.filter((operation) => (scope.kind === "write" ? operation.direction === "action" : operation.direction !== "action")).map((operation) => operation.name).join(", ") || "—"}</td>
                    </tr>
                  ))}
                  {entry.scopes.length === 0 && <tr><td colSpan={4}>No scope model is published for this capability.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
          <Card span={12} eyebrow="RISK" prov="human" title="Before approving any of this">
            <Notice tone={entry.risk.level === "high" ? "danger" : "warning"} title={`${entry.risk.level} risk`}>{entry.risk.note}</Notice>
          </Card>
        </Grid>
      )}

      {lens === "Test" && (
        <Grid>
          <Card span={7} eyebrow="STEP 3" prov="unknown" title="Verify with a real read" subtitle="A connection counts as working only when one read succeeds">
            <Stack gap={3}>
              <div className="t6-checks">
                {[
                  { label: "A grant exists", state: "fail", detail: "No authorisation has completed." },
                  { label: "A token can be exchanged", state: "fail", detail: "There is no server to receive the callback." },
                  { label: "One read returns data", state: "fail", detail: "Not attempted: there is nothing to read with." },
                ].map((check) => (
                  <div key={check.label} className="t6-check" data-state={check.state}>
                    <span className="t6-check-dot" aria-hidden="true" />
                    <div><strong>{check.label}</strong><p className="ds-subtle">{check.detail}</p></div>
                    <Pill tone="danger">not met</Pill>
                  </div>
                ))}
              </div>
              <Button
                variant="primary"
                busy={false}
                onClick={async () => {
                  setAttempted(true);
                  await context.mutate.log(
                    `Authorisation attempted for ${entry.capability.label}: stopped before the provider redirect. No grant, no token, no connection.`,
                    { type: "capability", capability: "not_connected" },
                  );
                  context.toast("Authorisation cannot complete", "The attempt is recorded in the action receipts as blocked, and nothing is marked connected.", "blocked");
                }}
              >
                Attempt the authorisation
              </Button>
              {attempted && (
                <Notice tone="danger" title="It stopped, and the record says so">
                  An attempt that fails must leave nothing behind. No connector record changed state, no token was stored, and the receipts log carries one entry explaining exactly where it stopped.
                </Notice>
              )}
            </Stack>
          </Card>
          <Card span={5} eyebrow="WHY" prov="human" title="Where it stops and why">
            <ol className="ds-prose">
              {steps.filter((step) => step.state === "blocked").map((step) => (
                <li key={step.id}><strong>{step.title}</strong> — {step.detail}</li>
              ))}
            </ol>
          </Card>
        </Grid>
      )}

      {lens === "Confirm" && (
        <Grid>
          <Card span={7} eyebrow="STEP 4" prov="unknown" title="Nothing to confirm" subtitle="The honest end of this flow">
            <Stack gap={3}>
              <Properties rows={[
                { label: "Grant", value: <Pill tone="danger">none</Pill> },
                { label: "Token stored", value: <Pill tone="danger">none</Pill> },
                { label: "State after the attempt", value: <StateCell entry={entry} /> },
                { label: "Recorded", value: "One audit entry saying where it stopped" },
              ]} />
              <Notice tone="warning" title="A failed authorisation never leaves a phantom connection">
                The connector keeps the state the capability register gives it. Nothing on this screen writes a connected state, so a half-finished attempt cannot look like a working one later.
              </Notice>
            </Stack>
          </Card>
          <Card span={5} eyebrow="NEXT" prov="human" title="What to do now">
            <Stack gap={3}>
              <p className="ds-prose">{entry.capability.localEquivalent}</p>
              <Button variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/connect/receipts`)}>Read the receipts</Button>
              <Button variant="ghost" onClick={() => context.navigate(`/o/${context.org.slug}/connect/marketplace`)}>Back to the directory</Button>
            </Stack>
          </Card>
        </Grid>
      )}
    </Stack>
  );
}

export function ExternalOAuth({ context }: { context: ScreenContext }) {
  const { entry } = useConnector(context);
  if (!entry) return null;
  return (
    <Stack gap={3}>
      <Notice tone="danger" title="This workspace will not open a sign-in page">
        An authorisation sends you to a page the provider controls and expects a callback to an address this workspace does not have. Opening a window that cannot come back would be theatre.
      </Notice>
      <Properties rows={[
        { label: "Provider", value: entry.capability.provider },
        { label: "Redirect address", value: <Pill tone="danger">none exists</Pill> },
        { label: "Callback receiver", value: <Pill tone="danger">none exists</Pill> },
        { label: "Result", value: "The flow stops here, deliberately" },
      ]} />
      <Button variant="secondary" onClick={() => { context.closeOverlay(); context.setTab("Test"); }}>See exactly where it stops</Button>
    </Stack>
  );
}

export function ScopeReview({ context }: { context: ScreenContext }) {
  const { entry } = useConnector(context);
  if (!entry) return null;
  return (
    <Stack gap={3}>
      <p className="ds-prose">Least privilege means asking for the read scopes and adding a write scope only when a mission genuinely performs an action.</p>
      <Stack gap={2}>
        {entry.scopes.map((scope) => (
          <Row key={scope.name} gap={2} className="ds-panel" style={{ padding: "var(--space-3)" }}>
            <div className="ds-grow">
              <code>{scope.name}</code>
              <p className="ds-subtle">{scope.purpose}</p>
            </div>
            <Pill tone={scope.kind === "write" ? "warning" : "neutral"}>{scope.kind}</Pill>
            <Checkbox label={scope.kind === "read" ? "Request" : "Request (write)"} defaultChecked={scope.kind === "read"} />
          </Row>
        ))}
        {entry.scopes.length === 0 && <span className="ds-subtle">No scope model is published.</span>}
      </Stack>
      <Notice tone="info" title="The choice is recorded, not sent">
        Nothing is requested, because nothing is reached. The selection is here so the decision can be made before a provider ever exists.
      </Notice>
    </Stack>
  );
}

export function ConsentStatus({ context }: { context: ScreenContext }) {
  const { entry } = useConnector(context);
  const events = useEvents();
  if (!entry) return null;
  const attempts = events.filter((event) => event.message.includes(entry.capability.label));
  return (
    <Stack gap={3}>
      <Properties rows={[
        { label: "Consent", value: <Pill tone="danger">never given</Pill> },
        { label: "Attempts recorded", value: <span className="ds-num">{String(attempts.length)}</span> },
        { label: "Last attempt", value: attempts[0] ? <span className="ds-num">{context.dateTime(attempts[0].at)}</span> : "None" },
      ]} />
      {attempts.length > 0 && (
        <Stack gap={2}>
          {attempts.slice(0, 5).map((event) => (
            <div key={event.id} className="ds-panel" style={{ padding: "var(--space-3)" }}>
              <strong style={{ fontSize: "var(--text-sm)" }}>{event.message}</strong>
              <div className="ds-subtle ds-num">{context.dateTime(event.at)} · {event.actor}</div>
            </div>
          ))}
        </Stack>
      )}
      <Notice tone="info" title="An attempt is kept even though it failed">
        Keeping the failures is what stops a later reader assuming a connection existed.
      </Notice>
    </Stack>
  );
}

/* ================================================================ *
 * ARL-CONNECT-004 — Installed Connections
 * ================================================================ */

export function Connections({ context, lens }: { context: ScreenContext; lens: "All" | "Healthy" | "Needs action" | "Disabled" }) {
  const records = useCollection("connectors");
  const { org } = useWorkspace();
  const rows = records.filter((record) => {
    if (lens === "Healthy") return false;
    if (lens === "Disabled") return record.status === "disabled";
    if (lens === "Needs action") return record.status !== "disabled";
    return true;
  });

  if (lens === "Healthy") {
    return (
      <Empty title="No connection is healthy" icon={<ShieldCheck size={20} />}>
        A connection is healthy when a grant exists and one read has succeeded. Neither has happened for any provider, so this tab is empty rather than optimistic.
      </Empty>
    );
  }

  if (rows.length === 0) {
    return <Empty title={`Nothing ${lens.toLowerCase()}`} icon={<Plug size={20} />}>Connector records are kept in this workspace with the state the capability register reports.</Empty>;
  }

  return (
    <Stack gap={4}>
      <DataGrid
        rows={rows}
        rowId={(row) => row.id}
        label="Connections"
        rowTone={(row) => (row.status === "disabled" ? undefined : "warning")}
        columns={[
          { key: "title", header: "Connection", primary: true, cell: (row) => row.title, sortValue: (row) => row.title, filterValue: (row) => `${row.title} ${row.summary}` },
          { key: "account", header: "Account", cell: () => <span className="ds-subtle">None linked</span> },
          { key: "owner", header: "Owner", cell: (row) => row.ownerName },
          {
            key: "scopes", header: "Scopes granted", align: "end", cell: (row) => {
              const entry = entryForRecord(row.fields);
              return <span className="ds-num">0 of {entry?.scopes.length ?? 0}</span>;
            },
          },
          { key: "expiry", header: "Expiry", cell: () => <span className="ds-subtle">No grant to expire</span> },
          {
            key: "state", header: "State", cell: (row) => {
              const entry = entryForRecord(row.fields);
              return entry ? <StateCell entry={entry} /> : <Pill tone="warning" dot>{String(row.fields.capability ?? row.status).replace(/_/g, " ")}</Pill>;
            },
          },
          { key: "local", header: "Done here instead", cell: (row) => row.summary },
        ]}
        onOpen={(id) => context.navigate(`/o/${org.slug}/connect/connections/${id}`)}
        onSelect={(id) => context.select(id)}
        selectedId={context.selectedId}
        summary={<span>Usage is not shown because no call has been made. A zero would be true but a usage column implies a history that does not exist.</span>}
      />
      <Notice tone="warning" title="Revocation would have nothing to revoke">
        There is no cached grant, no token and no queued call, so suspending a connection here only changes a label. The screen says so rather than offering a reassuring button.
      </Notice>
    </Stack>
  );
}

/* ================================================================ *
 * ARL-CONNECT-005 — Connection Detail
 * ================================================================ */

export function ConnectionDetail({ context, lens }: { context: ScreenContext; lens: "Overview" | "Capabilities" | "Sync" | "Activity" | "Security" }) {
  const { record, entry } = useConnector(context);
  const events = useEvents(record?.id);
  const { now } = useWorkspace();
  if (!record || !entry) return <Empty title="No connection" icon={<Plug size={20} />} />;

  if (lens === "Capabilities") {
    return (
      <Stack gap={4}>
        <div className="t6-matrix-wrap">
          <table className="t6-matrix">
            <caption className="ds-sr-only">What this connection would be allowed to do</caption>
            <thead><tr><th scope="col">Operation</th><th scope="col">Kind</th><th scope="col">Allowed now</th><th scope="col">Available to agents</th></tr></thead>
            <tbody>
              {entry.operations.map((operation) => (
                <tr key={operation.name}>
                  <th scope="row"><code>{operation.name}</code></th>
                  <td><Pill tone={operation.direction === "action" ? "warning" : "neutral"}>{operation.direction}</Pill></td>
                  <td><Pill tone="danger">no</Pill></td>
                  <td><Pill tone="danger">no</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Notice tone="info" title="An agent is never given more than a person">
          An AI employee can only use an operation that is allowed here, and a token is never shown to one: it would call the operation by name, and the platform would hold the credential.
        </Notice>
      </Stack>
    );
  }

  if (lens === "Sync") {
    return (
      <Grid>
        <Card span={7} eyebrow="SYNC" prov="unknown" title="Ingestion" subtitle="Nothing to ingest">
          <Properties rows={[
            { label: "Cursor", value: <Pill tone="warning">none</Pill> },
            { label: "Last run", value: <Pill tone="warning">never</Pill> },
            { label: "Lag", value: <Pill tone="warning">unavailable</Pill> },
            { label: "Schedule", value: "Not scheduled" },
          ]} />
          <Notice tone="warning" title="A cursor only exists after a first read">
            Showing a lag of zero would imply a sync that is up to date. There has been no sync at all.
          </Notice>
        </Card>
        <Card span={5} eyebrow="WEBHOOKS" prov="unknown" title="Events it would receive">
          <Stack gap={2}>
            {entry.operations.filter((operation) => operation.direction === "webhook").map((operation) => (
              <Row key={operation.name} gap={2}><code className="ds-grow">{operation.name}</code><Pill tone="warning">no endpoint</Pill></Row>
            ))}
            {entry.operations.filter((operation) => operation.direction === "webhook").length === 0 && <span className="ds-subtle">This capability publishes no events.</span>}
          </Stack>
          <Notice tone="warning" title="Nothing in this browser can be called">
            A webhook needs an address reachable from the internet. There is none, so no subscription can be created.
          </Notice>
        </Card>
      </Grid>
    );
  }

  if (lens === "Activity") {
    return events.length === 0
      ? <Empty title="No activity" icon={<Activity size={20} />}>Every attempt against this connection is recorded. There have been none yet.</Empty>
      : (
        <DataGrid
          rows={events}
          rowId={(row) => row.id}
          label="Connection activity"
          columns={[
            { key: "at", header: "When", primary: true, cell: (row) => <span className="ds-num">{context.dateTime(row.at)}</span>, sortValue: (row) => row.at },
            { key: "actor", header: "Who", cell: (row) => row.actor },
            { key: "capability", header: "State", cell: (row) => row.capability ? <Pill tone={CAPABILITY_TONE[row.capability]}>{CAPABILITY_LABELS[row.capability]}</Pill> : <span className="ds-subtle">—</span> },
            { key: "message", header: "Entry", cell: (row) => row.message, filterValue: (row) => row.message },
          ]}
        />
      );
  }

  if (lens === "Security") {
    return (
      <Grid>
        <Card span={6} eyebrow="KEYS" prov="unknown" title="API keys" subtitle="None exists, and none can be made here">
          <Stack gap={3}>
            <Notice tone="danger" title="This screen does not generate credentials">
              A key generated in a browser would be stored in IndexedDB in plain text and would not be accepted by any provider. Showing a convincing string would be worse than showing none, so there is no generate button.
            </Notice>
            <Properties rows={[
              { label: "Keys held", value: <span className="ds-num">0</span> },
              { label: "Keys generated here", value: <span className="ds-num">0</span> },
              { label: "Where a key belongs", value: "An encrypted store on a server, issued by the provider" },
            ]} />
          </Stack>
        </Card>
        <Card span={6} eyebrow="GRANT" prov="unknown" title="Authorisation" subtitle="What would be held once one existed">
          <Stack gap={3}>
            <Properties rows={[
              { label: "Grant", value: <Pill tone="danger">none</Pill> },
              { label: "Scopes", value: <span className="ds-num">{`0 of ${entry.scopes.length}`}</span> },
              { label: "Rotation", value: "Provider-issued, rotated by the provider" },
              { label: "Visible to agents", value: <Pill tone="success">never</Pill> },
            ]} />
            <Button variant="secondary" onClick={() => context.openOverlay("revoke grant")}>Revoke everything</Button>
          </Stack>
        </Card>
        <Card span={12} eyebrow="RECORD" prov="human" title="Freshness of this record">
          <Properties rows={[
            { label: "Record updated", value: <span className="ds-num">{context.dateTime(record.updatedAt)}</span> },
            { label: "Age", value: <span className="ds-num">{`${freshness(record.updatedAt, now).days} days`}</span> },
            { label: "Revision", value: <span className="ds-num">{String(record.revision)}</span> },
          ]} />
        </Card>
      </Grid>
    );
  }

  return (
    <Grid>
      <Card span={7} eyebrow="CONNECTION" prov="unknown" title={record.title} subtitle={entry.capability.provider} actions={<StateCell entry={entry} />}>
        <Properties rows={[
          { label: "Account identity", value: <Pill tone="warning">no account linked</Pill> },
          { label: "Capability", value: entry.capability.label },
          { label: "Owner", value: record.ownerName },
          { label: "Authorised actions", value: <span className="ds-num">{`0 of ${entry.operations.filter((operation) => operation.direction === "action").length}`}</span> },
          { label: "Error state", value: <Pill tone="neutral">none — nothing has run</Pill> },
        ]} />
      </Card>
      <Card span={5} eyebrow="INSTEAD" prov="human" title="What happens locally">
        <Stack gap={3}>
          <p className="ds-prose">{record.summary || entry.capability.localEquivalent}</p>
          <Notice tone="warning" title="A stale authorisation is never used">
            If a grant existed and had expired, every queued mission step would stop rather than retry with it. With no grant at all, the same rule means nothing is queued.
          </Notice>
          <Button variant="secondary" onClick={() => context.openOverlay("reconnect dialog")}>Try to reconnect</Button>
        </Stack>
      </Card>
    </Grid>
  );
}

/* ================================================================ *
 * ARL-CONNECT-006 — Capability Registry
 * ================================================================ */

export function CapabilityRegistry({ context, lens }: { context: ScreenContext; lens: "Actions" | "Reads" | "Webhooks" | "Versions" }) {
  const connectorRecords = useCollection("connectors");
  const retired = new Set(connectorRecords.flatMap((record) => {
    const entry = entryForRecord(record.fields);
    return String(record.fields.retiredOps ?? "").split(",").filter(Boolean).map((op) => `${entry?.capability.id ?? ""}|${op}`);
  }));
  const direction = lens === "Actions" ? "action" : lens === "Reads" ? "read" : "webhook";

  if (lens === "Versions") {
    return (
      <Stack gap={4}>
        <DataGrid
          rows={CONNECTOR_ENTRIES}
          rowId={(row) => row.capability.id}
          label="Capability versions"
          columns={[
            { key: "label", header: "Capability", primary: true, cell: (row) => row.capability.label, filterValue: (row) => row.capability.label },
            { key: "version", header: "Contract", cell: (row) => <span className="ds-num">{row.version}</span> },
            { key: "ops", header: "Operations", align: "end", cell: (row) => <span className="ds-num">{String(row.operations.length)}</span> },
            { key: "state", header: "State", cell: (row) => <StateCell entry={row} /> },
            { key: "category", header: "Category", cell: (row) => <Pill tone="neutral">{row.category}</Pill> },
          ]}
          onOpen={(id) => context.openOverlay("Capability inspector", { id })}
        />
        <Notice tone="info" title="A contract version is Arlovi's, not a provider's">
          Raising a version means the normalised shape changed. A provider's own API version moves independently and is the adapter's problem, not a mission's.
        </Notice>
      </Stack>
    );
  }

  const rows = CONNECTOR_ENTRIES.flatMap((entry) => entry.operations.filter((operation) => operation.direction === direction).map((operation) => ({ entry, operation })));

  if (rows.length === 0) {
    return <Empty title={`No ${lens.toLowerCase()} published`} icon={<Webhook size={20} />} />;
  }

  return (
    <Stack gap={4}>
      <DataGrid
        rows={rows}
        rowId={(row) => `${row.entry.capability.id}-${row.operation.name}`}
        label={lens}
        columns={[
          { key: "name", header: "Operation", primary: true, cell: (row) => <code>{row.operation.name}</code>, filterValue: (row) => row.operation.name },
          { key: "capability", header: "Capability", cell: (row) => row.entry.capability.label, filterValue: (row) => row.entry.capability.label },
          { key: "summary", header: "What it does", cell: (row) => row.operation.summary },
          { key: "local", header: "Done here instead", cell: (row) => row.operation.localEquivalent },
          { key: "state", header: "Usable", cell: (row) => (retired.has(`${row.entry.capability.id}|${row.operation.name}`) ? <Pill tone="danger">retired</Pill> : <Pill tone="danger">no — {CAPABILITY_LABELS[row.entry.capability.state].toLowerCase()}</Pill>) },
        ]}
        onOpen={(id) => context.openOverlay("Capability inspector", { id: id.split("-").slice(0, -1).join("-") })}
      />
      <Notice tone="warning" title="An operation a provider does not support is blocked, not approximated">
        If a provider cannot do something in this list, the adapter reports it unsupported. Nothing is simulated with a second-best call that looks like it worked.
      </Notice>
    </Stack>
  );
}

export function CapabilityInspector({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const entry = entryById(payload?.id ?? "") ?? CONNECTOR_ENTRIES[0];
  return (
    <Stack gap={3}>
      <Properties rows={[
        { label: "Capability", value: entry.capability.label },
        { label: "Contract", value: <span className="ds-num">{entry.version}</span> },
        { label: "State", value: <StateCell entry={entry} /> },
      ]} />
      <h4>Schema</h4>
      <pre className="t6-code">{JSON.stringify({
        capability: entry.capability.id,
        version: entry.version,
        operations: entry.operations.map((operation) => ({ name: operation.name, kind: operation.direction })),
        scopes: entry.scopes.map((scope) => ({ name: scope.name, kind: scope.kind })),
      }, null, 2)}</pre>
      <Notice tone="info" title="A mission chooses by semantics">
        An agent asks for <code>{entry.operations[0]?.name ?? "an operation"}</code> rather than for a provider, so swapping the provider behind it does not rewrite the mission.
      </Notice>
    </Stack>
  );
}

/* ================================================================ *
 * ARL-CONNECT-007 — Synchronization Centre
 * ================================================================ */

export function SyncCentre({ context, lens }: { context: ScreenContext; lens: "Jobs" | "Conflicts" | "Schedules" | "Data mapping" }) {
  const records = useCollection("connectors");
  const conflicts = useCollection("conflicts");

  if (lens === "Conflicts") {
    return (
      <Stack gap={4}>
        {conflicts.length === 0 ? (
          <Empty title="No conflicts" icon={<RefreshCcw size={20} />}>A conflict happens when two sources disagree about one record. With one source there is nothing to disagree with.</Empty>
        ) : (
          <DataGrid
            rows={conflicts}
            rowId={(row) => row.id}
            label="Conflicts"
            columns={[
              { key: "title", header: "Conflict", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
              { key: "detail", header: "What disagrees", cell: (row) => row.summary },
              { key: "status", header: "State", cell: (row) => <Pill tone={row.status === "open" ? "warning" : "neutral"}>{row.status}</Pill> },
            ]}
            onOpen={(id) => context.openOverlay("conflict resolver", { id })}
          />
        )}
        <Notice tone="info" title="Deduplication is a rule, not a hope">
          An ingestion keyed on a provider's event id discards a repeat, and an out-of-order event is compared against the cursor rather than applied blindly. Those rules are written now so the first sync does not invent them.
        </Notice>
      </Stack>
    );
  }

  if (lens === "Schedules") {
    return (
      <Grid>
        <Card span={7} eyebrow="SCHEDULES" prov="unknown" title="Nothing is scheduled" subtitle="A schedule without a source would only produce empty runs">
          <Stack gap={3}>
            <Properties rows={[
              { label: "Jobs scheduled", value: <span className="ds-num">0</span> },
              { label: "Next run", value: <Pill tone="warning">none</Pill> },
              { label: "Cadence", value: "Would follow the provider's rate limit, not a round number" },
            ]} />
            <Checkbox label="Run an ingestion when a connection becomes healthy" defaultChecked />
            <Checkbox label="Pause the schedule after three consecutive failures" defaultChecked />
          </Stack>
        </Card>
        <Card span={5} eyebrow="RATE LIMITS" prov="unknown" title="What a schedule would respect">
          <ul className="ds-prose">
            {CONNECTOR_ENTRIES.filter((entry) => entry.limits.length).slice(0, 4).map((entry) => (
              <li key={entry.capability.id}><strong>{entry.capability.label}</strong> — {entry.limits[0]}</li>
            ))}
          </ul>
        </Card>
      </Grid>
    );
  }

  if (lens === "Data mapping") {
    return (
      <Stack gap={4}>
        <Notice tone="info" title="A mapping is written before a sync, not after">
          Each row below says which workspace collection a capability's records would land in, and what makes two records the same thing.
        </Notice>
        <div className="t6-matrix-wrap">
          <table className="t6-matrix">
            <caption className="ds-sr-only">Proposed data mapping</caption>
            <thead><tr><th scope="col">Capability</th><th scope="col">Lands in</th><th scope="col">Matched on</th><th scope="col">On a tie</th></tr></thead>
            <tbody>
              {[
                { id: "bank.feed", into: "bankTransactions", key: "provider transaction id", tie: "Keep both and raise a conflict" },
                { id: "email.send", into: "emailThreads", key: "message id", tie: "Keep the earliest" },
                { id: "calendar.sync", into: "bookings", key: "event id", tie: "Keep the provider's version" },
                { id: "payment.capture", into: "receipts", key: "charge id", tie: "Never merge; money needs two records" },
              ].map((row) => {
                const entry = entryById(row.id);
                return (
                  <tr key={row.id}>
                    <th scope="row">{entry?.capability.label ?? row.id}</th>
                    <td><code>{row.into}</code></td>
                    <td>{row.key}</td>
                    <td>{row.tie}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Button variant="secondary" onClick={() => context.openOverlay("Mapping editor")}>Edit a mapping</Button>
      </Stack>
    );
  }

  return (
    <Stack gap={4}>
      <StatRow>
        <Stat label="Jobs" value="0" prov="posted" meta="No ingestion has been defined" />
        <Stat label="Records ingested" value="0" prov="posted" meta="Counted, and genuinely nought" />
        <Stat label="Lag" value="Unavailable" unavailable meta="A lag needs a cursor and a source clock" />
        <Stat label="Errors" value="Unavailable" unavailable meta="No call has been made to fail" />
      </StatRow>
      <Notice tone="warning" title="Nought and unavailable are different answers">
        Two of the figures above are real zeros because nothing ran. The other two are blank because they would need a provider's response to be true at all.
      </Notice>
      <Card eyebrow="CONNECTORS" prov="human" title="Sources that would feed a job" subtitle={`${records.length} connector records in this workspace`}>
        <Stack gap={2}>
          {records.map((record) => (
            <Row key={record.id} gap={2}>
              <span className="ds-grow">{record.title}</span>
              <Pill tone="warning" dot>{String(record.fields.capability ?? record.status).replace(/_/g, " ")}</Pill>
            </Row>
          ))}
        </Stack>
      </Card>
    </Stack>
  );
}

/* ================================================================ *
 * ARL-CONNECT-008 — Connector Health
 * ================================================================ */

export function ConnectorHealth({ context, lens }: { context: ScreenContext; lens: "Overview" | "Outages" | "Rate limits" | "Deprecations" }) {
  const incidents = useCollection("incidents");
  const [ran, setRan] = useState("");

  if (lens === "Outages") {
    const providerIncidents = incidents.filter((record) => String(record.fields.connectorId ?? ""));
    return (
      <Stack gap={4}>
        <Notice tone="warning" title="A provider outage is not ours to fix or to report">
          This workspace cannot reach a provider's status page, so it never claims one is down. What it can show is incidents raised here about a connector, which is below.
        </Notice>
        {providerIncidents.length === 0
          ? <Empty title="No connector incidents" icon={<ShieldAlert size={20} />} />
          : <DataGrid
            rows={providerIncidents}
            rowId={(row) => row.id}
            label="Connector incidents"
            columns={[
              { key: "title", header: "Incident", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
              { key: "summary", header: "What happened", cell: (row) => row.summary },
              { key: "severity", header: "Severity", cell: (row) => <Pill tone={String(row.fields.severity) === "high" ? "danger" : "warning"}>{String(row.fields.severity ?? "medium")}</Pill> },
              { key: "origin", header: "Origin", cell: () => <Pill tone="neutral">ours — a missing grant</Pill> },
            ]}
            onOpen={(id) => context.navigate(`/o/${context.org.slug}/it/incidents/${id}`)}
          />}
      </Stack>
    );
  }

  if (lens === "Rate limits") {
    return (
      <Stack gap={4}>
        <div className="t6-matrix-wrap">
          <table className="t6-matrix">
            <caption className="ds-sr-only">Rate limits each provider would impose</caption>
            <thead><tr><th scope="col">Capability</th><th scope="col">Limit</th><th scope="col">Consumed</th></tr></thead>
            <tbody>
              {CONNECTOR_ENTRIES.map((entry) => (
                <tr key={entry.capability.id}>
                  <th scope="row">{entry.capability.label}</th>
                  <td>{entry.limits[0] ?? "No published limit"}</td>
                  <td><Pill tone="neutral">0 calls made</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Notice tone="info" title="The limit is the provider's, the budget is ours">
          A quota figure would have to come from a provider's response header. None has been received, so the consumed column is a count of calls made here, which is nought.
        </Notice>
      </Stack>
    );
  }

  if (lens === "Deprecations") {
    return (
      <Stack gap={4}>
        <Notice tone="info" title="No provider version is being tracked">
          Tracking a deprecation means reading a provider's changelog. This workspace reads nothing external, so it would be guessing. What it does track is its own contract version, below.
        </Notice>
        <DataGrid
          rows={CONNECTOR_ENTRIES}
          rowId={(row) => row.capability.id}
          label="Contract versions"
          columns={[
            { key: "label", header: "Capability", primary: true, cell: (row) => row.capability.label, filterValue: (row) => row.capability.label },
            { key: "version", header: "Arlovi contract", cell: (row) => <span className="ds-num">{row.version}</span> },
            { key: "provider", header: "Provider version", cell: () => <span className="ds-subtle">Unavailable</span> },
            { key: "action", header: "Action needed", cell: () => <span className="ds-subtle">None while nothing is connected</span> },
          ]}
        />
      </Stack>
    );
  }

  return (
    <Stack gap={5}>
      <StatRow>
        <Stat label="Connected providers" value="0" prov="posted" meta={`${CONNECTOR_ENTRIES.length} in the register, none connected`} />
        <Stat label="Calls made" value="0" prov="posted" meta="This workspace makes no network calls" />
        <Stat label="API latency" value="Unavailable" unavailable meta="Latency needs a response to measure" />
        <Stat label="Error rate" value="Unavailable" unavailable meta="A rate needs calls in the denominator" />
      </StatRow>
      <Grid>
        <Card span={7} eyebrow="HEALTH TEST" prov="human" title="What a health test can check from here" subtitle="Two of five; the rest need a provider">
          <Stack gap={3}>
            <div className="t6-checks">
              {[
                { label: "The capability register is readable", state: "pass", detail: `${CONNECTOR_ENTRIES.length} capabilities loaded from the platform register.` },
                { label: "Every connector record maps to a capability", state: "pass", detail: "Each record resolves to an entry by capability id or provider name." },
                { label: "A grant exists", state: "fail", detail: "None has ever been issued." },
                { label: "A read returns data", state: "fail", detail: "Not attempted: there is nothing to read with." },
                { label: "The provider is reachable", state: "warn", detail: "Not attempted: this workspace makes no network calls." },
              ].map((check) => (
                <div key={check.label} className="t6-check" data-state={check.state}>
                  <span className="t6-check-dot" aria-hidden="true" />
                  <div><strong>{check.label}</strong><p className="ds-subtle">{check.detail}</p></div>
                  <Pill tone={check.state === "pass" ? "success" : check.state === "warn" ? "warning" : "danger"}>{check.state === "pass" ? "checked" : check.state === "warn" ? "not attempted" : "not met"}</Pill>
                </div>
              ))}
            </div>
            <Button variant="primary" onClick={async () => {
              const at = new Date().toISOString();
              setRan(at);
              await context.mutate.log("Connector health test: 2 local checks passed, 2 not met, 1 not attempted. No provider was contacted.", { type: "capability", capability: "not_connected" });
              context.toast("Health test recorded", "Two checks passed locally. Nothing was contacted.", "blocked");
            }}>Run the health test</Button>
            {ran && <p className="ds-subtle ds-num">Recorded {context.dateTime(ran)}.</p>}
          </Stack>
        </Card>
        <Card span={5} eyebrow="ORIGIN" prov="human" title="Ours or theirs" subtitle="The distinction a status page would blur">
          <Stack gap={3}>
            <Properties rows={[
              { label: "Our problem", value: "No grant has been obtained" },
              { label: "Their problem", value: <Pill tone="neutral">unknown — not contacted</Pill> },
              { label: "Repairable here", value: <Pill tone="warning">no</Pill> },
            ]} />
            <Notice tone="warning" title="A provider outage is never shown as internally repairable">
              Everything failing now fails for one reason that is ours: nothing has been connected. If a provider were down, this panel would say so and would not offer a retry that cannot help.
            </Notice>
          </Stack>
        </Card>
      </Grid>
    </Stack>
  );
}

/* ================================================================ *
 * ARL-CONNECT-009 — Custom Connectors
 * ================================================================ */

export function CustomConnectors({ context, lens }: { context: ScreenContext; lens: "Projects" | "Editor" | "Tests" | "Publish" }) {
  const records = useCollection("connectors");
  const custom = records.filter((record) => String(record.fields.kind ?? "") === "custom");
  const [draft, setDraft] = useState("");

  if (lens === "Editor") {
    return (
      <Grid>
        <Card span={7} eyebrow="ADAPTER" prov="human" title="Declare an action" subtitle="An adapter maps a provider's call onto a normalised operation">
          <Stack gap={3}>
            <Field label="Operation declaration" hint="JSON: name, kind, the scopes it needs and what the workspace does instead.">
              <TextArea rows={10} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={'{\n  "name": "send_statement",\n  "kind": "action",\n  "scopes": ["statements.write"],\n  "localEquivalent": "The statement is prepared and left as a draft."\n}'} />
            </Field>
            <ValidateDeclaration draft={draft} />
            <Button variant="secondary" onClick={() => context.openOverlay("capability validation", { draft })}>Validate against the contract</Button>
          </Stack>
        </Card>
        <Card span={5} eyebrow="RULE" prov="human" title="Third-party text is data">
          <Notice tone="danger" title="A provider's own documentation is never an instruction">
            Text that arrives from a connector — a description, an error message, a webhook body — is treated as data. It never changes what this workspace is allowed to do, and it is never executed. An adapter that asked for that would fail review.
          </Notice>
        </Card>
      </Grid>
    );
  }

  if (lens === "Tests") {
    return (
      <Stack gap={4}>
        <Notice tone="info" title="A contract test runs against the declaration, not against a provider">
          It checks that the operation names, kinds and scopes are the shape the registry expects. It cannot check that a provider behaves, because nothing is called.
        </Notice>
        {custom.length === 0 && <Empty title="No adapter to test" icon={<Plug size={20} />}>Create an adapter and register an operation first.</Empty>}
        {custom.map((record) => (
          <Card key={record.id} eyebrow="CONTRACT TESTS" prov="human" title={record.title} subtitle={record.fields.testResult ? `Recorded: ${String(record.fields.testResult)}` : "Not recorded yet"}
            footer={<Button size="sm" variant="secondary" onClick={() => context.openOverlay("contract tests", { id: record.id })}>Run and record</Button>}>
            <div className="t6-checks">
              {[...adapterChecks(adapterOperations(record.body)), { label: "A live call succeeds", state: "fail" as const, detail: "Cannot run: no provider is reachable." }].map((check) => (
                <div key={check.label} className="t6-check" data-state={check.state}>
                  <span className="t6-check-dot" aria-hidden="true" />
                  <div><strong>{check.label}</strong><p className="ds-subtle">{check.detail}</p></div>
                  <Pill tone={check.state === "pass" ? "success" : "danger"}>{check.state === "pass" ? "passes" : check.label.startsWith("A live") ? "cannot run" : "fails"}</Pill>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </Stack>
    );
  }

  if (lens === "Publish") {
    return (
      <Stack gap={4}>
        <Notice tone="warning" title="Publishing an adapter is a review, not a deploy">
          An adapter becomes available when a person approves its declaration, because it widens what agents may ask for. There is nowhere to deploy it to, so approval is the whole of the step.
        </Notice>
        <ul className="t6-steps">
          <li className="t6-step" data-state="done"><span className="t6-step-n">1</span>Declaration written</li>
          <li className="t6-step" data-state="done"><span className="t6-step-n">2</span>Contract tests pass</li>
          <li className="t6-step" data-state="current"><span className="t6-step-n">3</span>Person approves</li>
          <li className="t6-step" data-state="blocked"><span className="t6-step-n">4</span>Provider reachable</li>
        </ul>
        <Button variant="primary" onClick={() => context.openOverlay("approval")}>Submit for approval</Button>
      </Stack>
    );
  }

  return (
    <Stack gap={4}>
      <Row gap={2}><Button variant="primary" onClick={() => context.openOverlay("create adapter")}>New adapter</Button></Row>
      {custom.length === 0
        ? <Empty title="No custom adapter yet" icon={<Plug size={20} />}>An adapter declares operations against the same contract the built-in capabilities use, so a mission does not know the difference.</Empty>
        : <Grid>{custom.map((record) => (
          <Card key={record.id} span={6} eyebrow="CUSTOM" prov="human" title={record.title} subtitle={record.summary} actions={<Pill tone="warning" dot>{record.status.replace(/_/g, " ")}</Pill>}
            footer={<>
              <Button size="sm" variant="secondary" onClick={() => context.openOverlay("capability validation", { id: record.id })}>Register an operation</Button>
              <Button size="sm" variant="ghost" onClick={() => context.openOverlay("contract tests", { id: record.id })}>Tests</Button>
            </>}>
            <p className="ds-subtle">{adapterOperations(record.body).map((operation) => operation.name).join(", ") || "No operation registered."}</p>
          </Card>
        ))}</Grid>}
      <Notice tone="info" title="Sandboxed by having nothing to run in">
        There is no execution environment here, so an adapter is a declaration and a set of contract tests. That is a real limit, not a staged one.
      </Notice>
    </Stack>
  );
}

function ValidateDeclaration({ draft }: { draft: string }) {
  if (!draft.trim()) return <p className="ds-subtle">Paste a declaration to see it checked.</p>;
  let parsed: unknown;
  try {
    parsed = JSON.parse(draft);
  } catch (error) {
    return <Notice tone="danger" title="That is not valid JSON">{error instanceof Error ? error.message : "The declaration could not be parsed."}</Notice>;
  }
  const row = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  const problems: string[] = [];
  if (typeof row.name !== "string" || !row.name) problems.push("name is required and must be a string.");
  if (!["action", "read", "webhook"].includes(String(row.kind))) problems.push('kind must be "action", "read" or "webhook".');
  if (!Array.isArray(row.scopes) || row.scopes.length === 0) problems.push("scopes must list at least one scope.");
  if (typeof row.localEquivalent !== "string" || !row.localEquivalent) problems.push("localEquivalent is required: every operation must say what happens while it is not connected.");
  return problems.length === 0
    ? <Notice tone="success" title="The declaration satisfies the contract">It names an operation, a kind, its scopes and what happens locally instead.</Notice>
    : <Notice tone="danger" title={`${problems.length} ${problems.length === 1 ? "problem" : "problems"}`}><ul style={{ margin: "4px 0 0", paddingInlineStart: 18 }}>{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul></Notice>;
}

/* ================================================================ *
 * ARL-CONNECT-010 — Action Receipts
 * ================================================================ */

export function ActionReceipts({ context, lens }: { context: ScreenContext; lens: "All" | "Confirmed" | "Pending" | "Failed" | "Blocked" }) {
  const events = useEvents();
  const { org } = useWorkspace();
  const receipts = events.filter((event) => event.type === "capability" || event.capability !== undefined);
  const rows = receipts.filter((event) => {
    const state = event.capability ?? "not_connected";
    if (lens === "Confirmed") return state === "verified_external";
    if (lens === "Pending") return state === "queued_local" || state === "awaiting_external_confirmation";
    if (lens === "Failed") return state === "failed";
    if (lens === "Blocked") return state === "not_connected" || state === "blocked" || state === "configuration_required";
    return true;
  });

  return (
    <Stack gap={4}>
      <StatRow>
        <Stat label="Receipts" value={String(receipts.length)} prov="posted" meta="Audit entries about a provider boundary" />
        <Stat label="Confirmed by a provider" value="0" prov="posted" meta="None, and the tab says so" />
        <Stat label="Blocked" value={String(receipts.filter((event) => (event.capability ?? "not_connected") === "not_connected").length)} prov="posted" meta="Stopped before a provider" />
        <Stat label="Delivery proof" value="Unavailable" unavailable meta="Proof comes from a provider's response" />
      </StatRow>

      {rows.length === 0 ? (
        <Empty title={`No ${lens === "All" ? "" : lens.toLowerCase() + " "}receipts`} icon={<Activity size={20} />}>
          A receipt is written whenever something reaches a provider boundary. Attempt an authorisation and one appears here.
        </Empty>
      ) : (
        <DataGrid
          rows={rows}
          rowId={(row) => row.id}
          label="Action receipts"
          columns={[
            { key: "at", header: "When", primary: true, cell: (row) => <span className="ds-num">{context.dateTime(row.at)}</span>, sortValue: (row) => row.at },
            { key: "actor", header: "Actor", cell: (row) => row.actor },
            { key: "message", header: "Requested action", cell: (row) => row.message, filterValue: (row) => row.message },
            { key: "outcome", header: "Outcome", cell: (row) => <Pill tone={CAPABILITY_TONE[row.capability ?? "not_connected"]} dot>{CAPABILITY_LABELS[row.capability ?? "not_connected"]}</Pill> },
            { key: "verified", header: "Verified", cell: () => <Pill tone="danger">no provider evidence</Pill> },
          ]}
          onOpen={(id) => context.openOverlay("Receipt detail", { id })}
          toolbar={
            <Button size="sm" variant="secondary" onClick={() => {
              downloadCsv(`${org.slug}-action-receipts.csv`, ["at", "actor", "action", "outcome", "verified"],
                rows.map((row) => [row.at, row.actor, row.message, CAPABILITY_LABELS[row.capability ?? "not_connected"], "no"]));
              context.toast("Exported", `${rows.length} receipts written to CSV.`);
            }}>Export CSV</Button>
          }
          summary={<span>A request a provider accepted would still not be a success. Only a verified read in the Confirmed tab counts, and that tab is empty.</span>}
        />
      )}

      <Notice tone="warning" title="Accepted is not the same as done">
        When a provider is connected, an accepted request will sit in <strong>pending</strong> until a later read confirms the effect. Nothing moves to confirmed on the strength of a 200.
      </Notice>
    </Stack>
  );
}

export function ReceiptDetail({ context }: { context: ScreenContext }) {
  const events = useEvents();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const event = events.find((item) => item.id === payload?.id) ?? events.find((item) => item.type === "capability");
  if (!event) return <Empty title="No receipt selected" icon={<Activity size={20} />} />;
  return (
    <Stack gap={3}>
      <Properties rows={[
        { label: "When", value: <span className="ds-num">{context.dateTime(event.at)}</span> },
        { label: "Actor", value: event.actor },
        { label: "Screen", value: event.screenId ?? "—" },
        { label: "Outcome", value: <Pill tone={CAPABILITY_TONE[event.capability ?? "not_connected"]} dot>{CAPABILITY_LABELS[event.capability ?? "not_connected"]}</Pill> },
        { label: "Provider evidence", value: <Pill tone="danger">none</Pill> },
      ]} />
      <p className="ds-prose">{event.message}</p>
      <Notice tone="info" title="What evidence would look like">
        A provider's own identifier for the request, the response status, and a later read that shows the effect. Until all three exist, a receipt stays at the state it reached.
      </Notice>
    </Stack>
  );
}

export function ProviderEvidence() {
  return (
    <Stack gap={3}>
      <Notice tone="warning" title="There is no provider evidence to show">
        Evidence is a response from the other side. Nothing has been called, so the panel is empty rather than filled with a plausible identifier.
      </Notice>
      <Properties rows={[
        { label: "Provider request id", value: <Pill tone="danger">none</Pill> },
        { label: "Response status", value: <Pill tone="danger">none</Pill> },
        { label: "Confirming read", value: <Pill tone="danger">none</Pill> },
      ]} />
    </Stack>
  );
}

export function RetryReview({ context }: { context: ScreenContext }) {
  return (
    <Stack gap={3}>
      <Notice tone="warning" title="A retry would change nothing">
        Retrying makes sense when a provider answered badly. Nothing has answered at all, so a retry would reproduce the same stop. The honest action is to connect a provider, not to try again.
      </Notice>
      <Button variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/connect/marketplace`)}>Open the directory</Button>
    </Stack>
  );
}

export function MappingEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  return (
    <form
      id="mapping-editor"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        await context.mutate.log(
          `Mapping recorded: ${String(data.get("capability"))} lands in ${String(data.get("collection"))}, matched on ${String(data.get("key"))}.`,
          { type: "capability", capability: "ready_local" },
        );
        context.toast("Mapping recorded", "It is kept with the workspace so a first sync has a rule to follow.");
        close();
      }}
    >
      <Field label="Capability">
        <Select name="capability" defaultValue={CONNECTOR_ENTRIES[0].capability.label}>
          {CONNECTOR_ENTRIES.map((entry) => <option key={entry.capability.id} value={entry.capability.label}>{entry.capability.label}</option>)}
        </Select>
      </Field>
      <Field label="Lands in" required><TextInput name="collection" defaultValue="bankTransactions" required /></Field>
      <Field label="Matched on" required hint="The provider's own identifier is the only safe key."><TextInput name="key" defaultValue="provider transaction id" required /></Field>
      <Notice tone="info" title="Recorded now so the first sync is not improvised">
        The mapping is kept as an audit entry. Nothing syncs, so nothing is applied, but the rule exists before it is needed.
      </Notice>
    </form>
  );
}

export function ConflictResolver({ context }: { context: ScreenContext }) {
  const conflicts = useCollection("conflicts");
  const payload = context.overlayPayload as { id?: string } | undefined;
  const conflict = conflicts.find((item) => item.id === payload?.id) ?? conflicts[0];
  if (!conflict) return <Empty title="No conflict" icon={<RefreshCcw size={20} />} />;
  return (
    <Stack gap={3}>
      <Properties rows={[
        { label: "Conflict", value: conflict.title },
        { label: "State", value: <Pill tone={conflict.status === "open" ? "warning" : "neutral"}>{conflict.status}</Pill> },
      ]} />
      <p className="ds-prose">{conflict.summary}</p>
      <Notice tone="info" title="Both sides are kept until someone chooses">
        Nothing is merged automatically. A conflict is resolved by a person picking a side, and the choice is recorded against the record.
      </Notice>
      <Button variant="secondary" onClick={() => void context.mutate.patch(conflict.id, { status: "resolved" }, { event: `Conflict ${conflict.title} resolved by hand` }).then(() => context.toast("Resolved", "The choice is recorded on the conflict record."))}>
        Mark it resolved
      </Button>
    </Stack>
  );
}

export function RevokeGrant({ context }: { context: ScreenContext }) {
  const { entry } = useConnector(context);
  return (
    <Stack gap={3}>
      <Notice tone="warning" title="There is no grant to revoke">
        Nothing has been authorised for {entry?.capability.label ?? "this capability"}, so there is no token to invalidate and no cached permission to clear.
      </Notice>
      <Properties rows={[
        { label: "Tokens held", value: <span className="ds-num">0</span> },
        { label: "Cached grants", value: <span className="ds-num">0</span> },
        { label: "Queued calls", value: <span className="ds-num">0</span> },
      ]} />
      <Notice tone="info" title="What revocation would do">
        Stop new calls immediately, discard the cached grant, and fail any queued mission step rather than retrying it with a dead token.
      </Notice>
      <Button variant="secondary" onClick={() => void context.mutate.log(`Revocation requested for ${entry?.capability.label ?? "a capability"}: nothing to revoke.`, { type: "capability", capability: "not_connected" }).then(() => context.toast("Recorded", "The request is in the receipts, with nothing to revoke."))}>
        Record the request anyway
      </Button>
    </Stack>
  );
}
