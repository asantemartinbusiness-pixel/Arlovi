import { useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/design-system";
import { useUi, type Toast } from "@/runtime/ui";

/** Short feedback expires; failures stay until dismissed, so important errors are not lost. */
function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useUi((state) => state.dismissToast);
  const sticky = toast.tone === "blocked" || toast.tone === "failed";
  useEffect(() => {
    if (sticky) return;
    const timer = window.setTimeout(() => dismiss(toast.id), 5500);
    return () => window.clearTimeout(timer);
  }, [toast.id, sticky, dismiss]);
  return (
    <div className="ds-toast" data-tone={toast.tone} role={sticky ? "alert" : "status"}>
      <div className="ds-grow">
        <strong>{toast.title}</strong>
        <p>{toast.body}</p>
      </div>
      <Button variant="ghost" size="sm" iconOnly aria-label={"Dismiss: " + toast.title} onClick={() => dismiss(toast.id)}><X size={14}/></Button>
    </div>
  );
}

export function NotificationToastStack() {
  const toasts = useUi((state) => state.toasts);
  return <div className="ds-toasts" aria-label="Application messages">
    {toasts.map((toast) => <ToastItem key={toast.id} toast={toast}/>)}
  </div>;
}
