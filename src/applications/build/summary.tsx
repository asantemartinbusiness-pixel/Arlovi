import { OverlaySummary, Pill } from "@/design-system";
import type { OverlayDef, ScreenContext } from "@/platform/registry";
import { useAppRecord } from "./builder";
import { issueTotals, validateApp } from "./model";

/** Overlay head for any overlay that works on the routed project: which project, which environment label, how big. */
function ProjectSummary({ context }: { context: ScreenContext }) {
  const { record, model } = useAppRecord(context);
  if (!record) return null;
  const environment = model.settings.environment;
  const fields = model.entities.reduce((n, entity) => n + entity.fields.length, 0);
  const components = model.screens.reduce((n, screen) => n + screen.components.length, 0);
  const totals = issueTotals(validateApp(model));
  const last = [...model.releases].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))[0];
  const meta = [
    model.entities.length ? `${model.entities.length} ${model.entities.length === 1 ? "entity" : "entities"}, ${fields} fields` : "",
    model.screens.length ? `${model.screens.length} ${model.screens.length === 1 ? "screen" : "screens"}, ${components} components` : "",
    totals.fail ? `${totals.fail} failing ${totals.fail === 1 ? "check" : "checks"}` : "",
    last ? `${last.environment} ${last.state.replace("_", " ")} ${context.relative(last.at)}` : "",
  ].filter(Boolean);
  return (
    <OverlaySummary
      title={record.title}
      status={<Pill tone={environment === "production" ? "danger" : environment === "staging" ? "warning" : "neutral"} dot>{environment}</Pill>}
      meta={meta.length ? meta : ["Empty model"]}
    />
  );
}

export const projectSummary: NonNullable<OverlayDef["summary"]> = ({ close: _close, ...context }) => <ProjectSummary context={context} />;
