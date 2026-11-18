import { useEffect, useState } from "react";
import { CheckCircle2, Info, ShieldAlert, TriangleAlert, X } from "lucide-react";
import { Button } from "@/design-system";
import { useUi, type Toast } from "@/runtime/ui";
import "./notifications.css";

function NotificationToast({ toast }: { toast: Toast }) {
  const dismiss = useUi(state => state.dismissToast);
  const [hovered, setHovered] = useState(false);
  useEffect(() => {
    const duration = toast.durationMs ?? (toast.tone === "failed" || toast.tone === "blocked" ? 0 : 5500);
    if (duration <= 0 || hovered) return;
    const timer = window.setTimeout(() => dismiss(toast.id), duration);
    return () => window.clearTimeout(timer);
  }, [toast.id, toast.tone, toast.durationMs, hovered, dismiss]);
  const Icon = toast.tone === "ok" ? CheckCircle2 :
    toast.tone === "failed" ? ShieldAlert : toast.tone === "blocked" ? TriangleAlert : Info;
  return (
    <section className="ds-toast nt-toast" data-tone={toast.tone} role={toast.tone === "failed" ? "alert" : "status"}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setHovered(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setHovered(false); }}>
      <Icon size={17} className="nt-toast-icon" aria-hidden="true"/>
      <div className="ds-grow nt-toast-content">
        <strong>{toast.title}</strong>
        <p>{toast.body}</p>
        {toast.onAction && toast.actionLabel && <Button size="sm" variant="secondary" onClick={() => { toast.onAction?.(); dismiss(toast.id); }}>{toast.actionLabel}</Button>}
      </div>
      <Button variant="ghost" size="sm" iconOnly aria-label={`Dismiss: ${toast.title}`} onClick={() => dismiss(toast.id)}>
        <X size={14}/>
      </Button>
    </section>
  );
}

export function NotificationToastStack() {
  const toasts = useUi(state => state.toasts);
  if (!toasts.length) return null;
  return <div className="ds-toasts nt-toast-stack" aria-label="Application status messages">
    {toasts.map(toast => <NotificationToast key={toast.id} toast={toast}/>)}
  </div>;
}
