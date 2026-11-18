import { useEffect, useState, type ReactNode } from "react";
import { Skeleton, Stack } from "@/design-system";
import type { ScreenContext, ScreenDef } from "@/platform/registry";

/* ====================================================================== *
 * ANALYTICS — never compute a figure from a partial read.
 *
 * Every application's records are loaded in the background after start-up.
 * A figure recomputed before Finance's journals have landed would be a real
 * number from an incomplete ledger, so Analytics screens wait until every
 * application's records are in this workspace and say so meanwhile.
 * ====================================================================== */

let seedsReady = false;
let waiting: Promise<void> | null = null;

function whenSeeded(): Promise<void> {
  if (!waiting) {
    waiting = import("@/applications")
      .then((module) => module.loadAllSeeds())
      .then(() => { seedsReady = true; })
      .catch(() => { seedsReady = true; /* a failed fixture load is reported by the shell; do not block forever */ });
  }
  return waiting;
}

export function AnalyticsReady({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(seedsReady);
  useEffect(() => {
    if (ready) return;
    let live = true;
    void whenSeeded().then(() => { if (live) setReady(true); });
    return () => { live = false; };
  }, [ready]);
  if (!ready) {
    return (
      <div role="status" aria-busy="true" className="an-loading">
        <Stack gap={3}>
          <strong>Reading every record in this workspace…</strong>
          <span className="ds-subtle">Figures are computed only once all of them have been read, so none is shown from a partial ledger.</span>
          <Skeleton height={72} />
          <Skeleton height={180} />
        </Stack>
      </div>
    );
  }
  return <>{children}</>;
}

/** Wraps every tab and surface of the Analytics screens in the readiness gate. */
export function gateScreens(screens: Record<string, ScreenDef>): Record<string, ScreenDef> {
  return Object.fromEntries(Object.entries(screens).map(([id, screen]) => [id, {
    ...screen,
    surface: screen.surface ? (context: ScreenContext) => <AnalyticsReady>{screen.surface!(context)}</AnalyticsReady> : undefined,
    tabs: screen.tabs?.map((tab) => ({ ...tab, render: (context: ScreenContext) => <AnalyticsReady>{tab.render(context)}</AnalyticsReady> })),
  }]));
}
