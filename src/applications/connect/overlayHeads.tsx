import { OverlaySummary, Pill } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { CAPABILITY_LABELS, CAPABILITY_TONE } from "@/platform/capability";
import { entryById } from "./catalog";
import { useConnector } from "./panels";

/**
 * Overlay head for anything about one provider: who it is, whether the
 * connection is real (the register's state, never a local claim) and what
 * consent exists. An id in the overlay payload wins over the route.
 */
export function ConnectorSummary({ context, eyebrow }: { context: ScreenContext; eyebrow?: string }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const routed = useConnector(context);
  const entry = entryById(payload?.id ?? "") ?? routed.entry;
  if (!entry) return null;
  const writes = entry.scopes.filter((scope) => scope.kind === "write").length;
  return (
    <OverlaySummary
      eyebrow={eyebrow ?? entry.category}
      title={entry.capability.label}
      status={<Pill tone={CAPABILITY_TONE[entry.capability.state]} dot>{CAPABILITY_LABELS[entry.capability.state]}</Pill>}
      meta={[entry.capability.provider, `Consent: none given`, `${entry.scopes.length - writes} read · ${writes} write`]}
    />
  );
}

export const connectorSummary = (eyebrow?: string) =>
  ({ close: _close, ...context }: ScreenContext & { close: () => void }) => <ConnectorSummary context={context} eyebrow={eyebrow} />;
