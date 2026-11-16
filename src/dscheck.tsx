import { createRoot } from "react-dom/client";
import {
  Avatar, Button, Card, DataGrid, Empty, Grid, Meter, Notice, Pill, Properties, Row, Stack, Stat, StatRow, TabPanel, Tabs,
} from "@/design-system";
import "@/design-system";

/**
 * Isolated design-system check surface. Renders the primitives in both
 * appearances so palette, type and the provenance materials can be reviewed
 * without depending on any application module.
 */

interface Line {
  id: string;
  ref: string;
  who: string;
  status: string;
  prov: "posted" | "human" | "agent" | "unknown";
  amount: string;
  when: string;
}

const rows: Line[] = [
  { id: "1", ref: "INV-1052", who: "Lumen & Co", status: "paid", prov: "posted", amount: "£2,480.00", when: "2 Nov 2026" },
  { id: "2", ref: "INV-1053", who: "Hartwell Interiors", status: "overdue", prov: "unknown", amount: "£1,152.00", when: "28 Oct 2026" },
  { id: "3", ref: "INV-1054", who: "Marlowe Studio", status: "draft", prov: "human", amount: "£860.00", when: "11 Nov 2026" },
  { id: "4", ref: "INV-1055", who: "Beacon Hotels", status: "agent draft", prov: "agent", amount: "£5,310.00", when: "13 Nov 2026" },
];

function Panel() {
  return (
    <div style={{ background: "var(--bg-canvas)", color: "var(--fg-default)", padding: 32, minHeight: "100vh" }}>
      <p className="ds-eyebrow">Design check</p>
      <h1 style={{ marginBlock: "8px 4px" }}>Invoice list</h1>
      <p className="ds-muted" style={{ marginBottom: 24 }}>
        Every element that asserts a fact carries the material of its source.
      </p>

      <Tabs
        label="views"
        value="All"
        onChange={() => undefined}
        items={[{ id: "All", label: "All", count: 4 }, { id: "Open", label: "Open", count: 2 }, { id: "Paid", label: "Paid", count: 1 }]}
      />

      <div style={{ height: 20 }} />
      <TabPanel id="All">
      <StatRow>
        <Stat label="Receivable" value="£9,802.00" prov="posted" meta="4 open invoices" />
        <Stat label="Overdue" value="£1,152.00" prov="posted" meta="1 past due · 17 days" />
        <Stat label="Agent drafts" value="£5,310.00" prov="agent" meta="awaiting your approval" />
        <Stat label="Bank feed" value="Not connected" unavailable meta="Balances come from posted journals" />
      </StatRow>

      <div style={{ height: 20 }} />
      <Grid>
        <Card span={8} eyebrow="Ledger" prov="posted" title="Open invoices" subtitle="Posted figures, this browser only" flush>
          <DataGrid
            rows={rows}
            rowId={(row) => row.id}
            label="Invoices"
            filterable={false}
            rowTone={(row) => (row.status === "overdue" ? "danger" : undefined)}
            columns={[
              { key: "ref", header: "Reference", primary: true, cell: (row) => <span className="ds-num">{row.ref}</span> },
              { key: "who", header: "Customer", cell: (row) => row.who },
              {
                key: "status",
                header: "Status",
                cell: (row) => (
                  <Pill tone={row.status === "paid" ? "success" : row.status === "overdue" ? "danger" : row.prov === "agent" ? "accent" : "neutral"}>
                    {row.status}
                  </Pill>
                ),
              },
              { key: "when", header: "Due", cell: (row) => <span className="ds-num">{row.when}</span> },
              { key: "amount", header: "Amount", align: "end", cell: (row) => row.amount },
            ]}
          />
        </Card>

        <Card span={4} eyebrow="AI workforce" prov="agent" title="Idris Cole" subtitle="Finance agent · local contract">
          <Stack gap={3}>
            <Row gap={2}><Avatar name="Idris Cole" kind="ai" /><span className="ds-grow">Drafted 3 invoices</span><Pill tone="accent">agent</Pill></Row>
            <Row gap={2}><Avatar name="Jonah Adeyemi" /><span className="ds-grow">Posted 11 journals</span><Pill>person</Pill></Row>
            <Meter value={62} max={100} label="Budget used" />
            <Properties rows={[{ label: "Authority", value: "Draft only" }, { label: "Cost", value: <span className="ds-num">£0.00</span> }]} />
            <Notice tone="warning" title="No model is connected">Drafts are composed from records in this workspace.</Notice>
          </Stack>
        </Card>

        <Card span={4} machine eyebrow="Running" title="Winter trade launch" subtitle="Mission · step 3 of 7">
          <p style={{ fontSize: "var(--text-sm)" }}>
            Gathering quote lines from the catalogue. The mission stops before anything leaves this browser.
          </p>
        </Card>

        <Card span={4} title="Controls">
          <Row gap={2} wrap>
            <Button variant="primary">Post journal</Button>
            <Button variant="secondary">Export</Button>
            <Button variant="ghost">Cancel</Button>
            <Button variant="outline-danger">Void</Button>
          </Row>
        </Card>

        <Card span={4} title="Empty">
          <Empty title="Nothing to reconcile">Imported statement lines appear here.</Empty>
        </Card>
      </Grid>
      </TabPanel>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Panel />);
