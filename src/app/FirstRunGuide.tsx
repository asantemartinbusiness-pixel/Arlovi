import { Link, useLocation } from "react-router-dom";
import { ArrowUpRight, Check, Circle, X } from "lucide-react";
import { Button, Pill } from "@/design-system";
import { appEntry } from "@/app/catalog";
import { useCollections, useMutations, useWorkspace } from "@/platform/workspace";
import "./first-run.css";

/**
 * Frontend-only headquarters handoff after completing company setup.
 * Completion is derived from actual local records: a draft is never represented
 * as an invitation delivered, an AI employee operating, or a mission executed.
 */
export function FirstRunGuide() {
  const { org } = useWorkspace();
  const location = useLocation();
  const mutations = useMutations();
  const records = useCollections(["organizations", "members", "sources", "agents", "missions", "preferences"]);
  const preference = records.preferences.find((item) => item.fields.kind === "getting_started");
  const force = new URLSearchParams(location.search).get("gettingStarted") === "1";
  if (!org.ownerName || (preference?.fields.dismissed === true && !force)) return null;

  const humanTeam = records.members.filter((member) => member.fields.kind === "human" && member.fields.role !== "owner");
  const reviewableKnowledge = records.sources.filter((source) => source.status === "indexed" || source.status === "verified");
  const activeAgents = records.agents.filter((agent) => agent.status === "active");
  const approvedMissions = records.missions.filter((mission) => ["approved", "running", "completed"].includes(mission.status));
  const pinned = records.preferences.filter((item) => item.fields.pinned === true);
  const tasks = [
    {
      id: "identity", title: "Company headquarters", detail: "Company profile and region recorded",
      complete: records.organizations.some((record) => record.id === org.id),
      to: appEntry("ADMIN", org.slug), action: "Review identity",
    },
    {
      id: "knowledge", title: "Review Company Brain sources",
      detail: reviewableKnowledge.length ? `${reviewableKnowledge.length} source(s) approved` : "Your founding notes are held for human review",
      complete: reviewableKnowledge.length > 0,
      to: appEntry("BRAIN", org.slug), action: "Open Brain",
    },
    {
      id: "team", title: "Organize your people",
      detail: humanTeam.length ? `${humanTeam.length} human teammate draft(s) to review` : "Add people and set their access",
      complete: humanTeam.some((person) => person.status === "active"),
      to: appEntry("ADMIN", org.slug).replace(/\/organization$/, "/members"), action: "Open people",
    },
    {
      id: "agents", title: "Configure your AI workforce",
      detail: activeAgents.length ? `${activeAgents.length} active local contract(s)` : "Specialists start as drafts without model execution",
      complete: activeAgents.length > 0,
      to: appEntry("TEAM", org.slug), action: "Review AI team",
    },
    {
      id: "mission", title: "Approve a first mission",
      detail: approvedMissions.length ? `${approvedMissions.length} approved local mission(s)` : "Your initial mission is a reviewable draft",
      complete: approvedMissions.length > 0,
      to: appEntry("MISSION", org.slug), action: "Mission Control",
    },
    {
      id: "apps", title: "Make the workspace yours",
      detail: pinned.length ? `${pinned.length} native app(s) pinned` : "Pin the applications you use most",
      complete: pinned.length > 0,
      to: appEntry("HQ", org.slug), action: "Explore apps",
    },
  ];
  const complete = tasks.filter((task) => task.complete).length;

  async function dismiss() {
    if (preference) {
      await mutations.patch(preference.id, { fields: { dismissed: true } }, { event: "Getting-started guidance dismissed" });
    } else {
      await mutations.create({
        collection: "preferences", title: "Getting-started guidance", status: "active",
        fields: { kind: "getting_started", dismissed: true },
        summary: "Keep this local onboarding guide hidden unless explicitly reopened.",
      }, "Getting-started guidance dismissed");
    }
  }

  return (
    <section className="hq-intro" aria-label="Your company getting started">
      <div className="hq-intro-top">
        <div>
          <div className="hq-intro-eyebrow">YOUR WORKSPACE IS READY</div>
          <h2>Welcome to {org.name}.</h2>
          <p>Bring the people, intelligence and applications in your headquarters together. Each step opens a real part of your company.</p>
        </div>
        <Button variant="ghost" size="sm" iconOnly aria-label="Dismiss getting-started guidance" onClick={() => { void dismiss(); }}>
          <X size={17} />
        </Button>
      </div>
      <div className="hq-intro-progress">
        <span><strong>{complete} of {tasks.length}</strong> foundations reviewed</span>
        <div role="progressbar" aria-label="Company setup progress" aria-valuemin={0} aria-valuemax={tasks.length} aria-valuenow={complete}>
          <span style={{ width: `${(complete / tasks.length) * 100}%` }} />
        </div>
        <Pill tone={complete === tasks.length ? "success" : "info"}>{complete === tasks.length ? "Ready to operate locally" : "Continue setup"}</Pill>
      </div>
      <div className="hq-intro-grid">
        {tasks.map((task) => (
          <Link key={task.id} to={task.to} className="hq-intro-item">
            <span className="hq-intro-symbol" data-complete={task.complete ? "true" : "false"}>
              {task.complete ? <Check size={16} strokeWidth={2.5} /> : <Circle size={16} strokeWidth={1.7} />}
            </span>
            <span className="hq-intro-item-copy">
              <strong>{task.title}</strong>
              <span>{task.detail}</span>
              <em>{task.action} <ArrowUpRight size={13} /></em>
            </span>
          </Link>
        ))}
      </div>
      <p className="hq-intro-boundary">This company is saved locally in your browser. Invitations, provider services and autonomous execution are not activated until configured and explicitly authorised.</p>
    </section>
  );
}
