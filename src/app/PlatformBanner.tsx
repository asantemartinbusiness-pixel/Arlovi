import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, ShieldAlert, X } from "lucide-react";
import { Button } from "@/design-system";
import type { Priority } from "@/platform/attention";

/** Persistent application-level warning with explicit semantic importance. */
export function PlatformBanner({
  priority, title, children, action, actionLabel, onDismiss,
}: {
  priority: Priority; title: string; children: ReactNode;
  action?: () => void; actionLabel?: string; onDismiss?: () => void;
}) {
  const serious = priority === "P0" || priority === "P1";
  const warning = priority === "P2";
  const Icon = serious ? ShieldAlert : warning ? AlertTriangle : priority === "P5" ? CheckCircle2 : Info;
  return <section className="an-platform-banner" data-priority={priority} role={serious ? "alert" : "status"}>
    <span className="an-platform-banner-icon"><Icon size={17}/></span>
    <div className="an-platform-banner-copy"><strong>{title}</strong><div>{children}</div></div>
    {action && actionLabel && <Button size="sm" variant="secondary" onClick={action}>{actionLabel}</Button>}
    {onDismiss && <button type="button" className="an-platform-banner-close" aria-label={"Dismiss " + title} onClick={onDismiss}><X size={15}/></button>}
  </section>;
}
