import { OverlaySummary, Pill } from "@/design-system";
import type { OverlayDef, ScreenContext } from "@/platform/registry";
import { useAppRecord } from "./builder";

/** Overlay head for any overlay that works on the routed project: which project, which environment label, how big. */
function ProjectSummary({ context }: { context: ScreenContext }) {
  const { record, model } = useAppRecord(context);
  if (!record) return null;
  const environment = model.settings.environment;
  return (
    <OverlaySummary
      title={record.title}
      status={<Pill tone={environment === "production" ? "danger" : environment === "staging" ? "warning" : "neutral"} dot>{environment}</Pill>}
      meta={[`${model.entities.length} entities`, `${model.screens.length} screens`, model.releases.length ? `${model.releases.length} release attempts` : "Never released"]}
    />
  );
}

export const projectSummary: NonNullable<OverlayDef["summary"]> = ({ close: _close, ...context }) => <ProjectSummary context={context} />;
