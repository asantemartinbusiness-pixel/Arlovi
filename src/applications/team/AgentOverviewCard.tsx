import { Avatar, Card, Pill } from "@/design-system";
import type { Rec } from "@/domain/types";
import { AgentTeamsOf } from "./AgentTeamsPanels";
import "./team-agent-overview.css";

interface AgentOverviewCardProps {
  agent: Rec;
  department: string;
  spendCeiling: string;
  permittedActions: number;
  grantedTools: number;
  totalTools: number;
}

/**
 * AI employee contract overview, not a real human profile or a running agent.
 * Keep the recorded contract state separate from model/runtime availability.
 */
export function AgentOverviewCard({
  agent, department, spendCeiling, permittedActions, grantedTools, totalTools,
}: AgentOverviewCardProps) {
  const role = String(agent.fields.role ?? "AI employee");
  const manager = String(agent.fields.manager ?? "Unassigned");
  const autonomy = String(agent.fields.autonomy ?? "draft").replace(/_/g, " ");
  const status = agent.status === "active" ? "Contract active" : agent.status === "paused" ? "Contract paused" : `Contract ${agent.status}`;
  const tone = agent.status === "active" ? "success" : agent.status === "paused" ? "warning" : "neutral";

  return (
    <Card
      span={7}
      className="team-agent-overview"
      aria-label={`AI employee profile: ${agent.title}`}
      machine={agent.status === "active"}
      title={(
        <div className="team-agent-overview__heading">
          <Avatar name={agent.title} kind="ai" size="lg" />
          <div className="team-agent-overview__heading-text">
            <h2>{agent.title}</h2>
            <p>{role}</p>
          </div>
        </div>
      )}
      actions={<Pill dot tone={tone}>{status}</Pill>}
    >
      <p className="team-agent-overview__summary">{agent.summary || "No contract description recorded."}</p>

      <div className="team-agent-overview__body">
        <section className="team-agent-overview__section" aria-label="Operating limits">
          <h3>Operating limits</h3>
          <dl className="team-agent-overview__metrics">
            <div className="team-agent-overview__metric">
              <dt>Autonomy</dt>
              <dd>{autonomy}</dd>
            </div>
            <div className="team-agent-overview__metric">
              <dt>Spend ceiling</dt>
              <dd className="team-agent-overview__figure">{spendCeiling}</dd>
            </div>
            <div className="team-agent-overview__metric">
              <dt>Permitted actions</dt>
              <dd className="team-agent-overview__figure">{permittedActions}</dd>
            </div>
            <div className="team-agent-overview__metric">
              <dt>Tools granted</dt>
              <dd className="team-agent-overview__figure">{grantedTools} <span>of {totalTools}</span></dd>
            </div>
          </dl>
        </section>

        <section className="team-agent-overview__section team-agent-overview__reporting" aria-label="Reporting and teams">
          <h3>Reporting & teams</h3>
          <dl className="team-agent-overview__details">
            <div><dt>Reports to</dt><dd>{manager}</dd></div>
            <div><dt>Department</dt><dd>{department}</dd></div>
            <div><dt>Agent teams</dt><dd><AgentTeamsOf agentId={agent.id} /></dd></div>
          </dl>
        </section>
      </div>

      <div className="team-agent-overview__connection" role="note">
        <div className="team-agent-overview__connection-copy">
          <strong>Model connection</strong>
          <span>Contract settings are recorded; no model provider is connected to run work.</span>
        </div>
        <Pill tone="warning">Not connected</Pill>
      </div>
    </Card>
  );
}
