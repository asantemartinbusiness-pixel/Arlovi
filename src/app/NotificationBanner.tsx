import type { ReactNode } from "react";
import { AlertCircle, Info, ShieldAlert, TriangleAlert } from "lucide-react";
import "./notifications.css";

export type BannerTone = "info" | "warning" | "danger" | "success";

/** Persistent event state belongs to its source, not to this visual component. */
export function NotificationBanner({ tone, title, children, action }: {
  tone: BannerTone; title: string; children: ReactNode; action?: ReactNode;
}) {
  const Icon = tone === "danger" ? ShieldAlert : tone === "warning" ? TriangleAlert : tone === "success" ? AlertCircle : Info;
  return <section className="nt-banner" data-tone={tone} role={tone === "danger" ? "alert" : "status"}>
    <Icon size={18} aria-hidden="true"/>
    <div className="nt-banner-copy"><strong>{title}</strong><div>{children}</div></div>
    {action && <div className="nt-banner-action">{action}</div>}
  </section>;
}
