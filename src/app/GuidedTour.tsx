import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useWorkspace } from "@/platform/workspace";
import "./guided-tour.css";

type TourStep = { title: string; description: string; target: string };
const VERSION = "v1";
const STEPS: TourStep[] = [
  { title: "Your organisation", description: "This is your company home. Switch between workspaces you belong to using the organisation selector.", target: ".hq-orgswitch" },
  { title: "All your applications", description: "Use this rail to move between Arlovi's native applications without leaving your operating environment.", target: ".hq-rail" },
  { title: "Find your way", description: "Search and jump between tools with the command interface. You can also use Ctrl+K or ⌘K.", target: ".hq-search" },
  { title: "Ask Arlovi", description: "Open the AI companion here. Any capabilities that require an external provider will be marked as not connected.", target: '[aria-label="Ask Arlovi"]' },
  { title: "Your attention centre", description: "Review updates, outstanding work and items needing a decision in this space.", target: ".hq-bell" },
  { title: "Make it yours", description: "Your account menu contains personal preferences and a way to return to the getting-started guide.", target: '[aria-label^="Profile and preferences"]' },
];
type Pos = { top: number; left: number; width: number; target?: DOMRect };
const empty: Pos = { top: 110, left: 16, width: 340 };

export function GuidedTour() {
  const { org } = useWorkspace();
  const location = useLocation();
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [pos, setPos] = useState<Pos>(empty);
  const panel = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const progressKey = `arlovi-tour-${VERSION}-${org.id}`;

  useEffect(() => {
    const open = () => {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      let next = 0;
      try { const stored = Number(sessionStorage.getItem(progressKey)); if (Number.isFinite(stored)) next = Math.min(STEPS.length - 1, Math.max(0, stored)); } catch { /* optional */ }
      setStep(next);
      setActive(true);
    };
    window.addEventListener("arlovi:start-tour", open);
    return () => window.removeEventListener("arlovi:start-tour", open);
  }, [progressKey]);

  useEffect(() => {
    if (!active) return;
    try { sessionStorage.setItem(progressKey, String(step)); } catch { /* optional */ }
    const update = () => {
      const target = document.querySelector<HTMLElement>(STEPS[step].target);
      if (!target) { setPos(empty); return; }
      const rect = target.getBoundingClientRect();
      const width = Math.min(340, Math.max(260, window.innerWidth - 32));
      const left = Math.max(16, Math.min(window.innerWidth - width - 16, rect.left));
      const below = rect.bottom + 16 + 245 < window.innerHeight;
      const top = below ? rect.bottom + 16 : Math.max(16, rect.top - 240);
      setPos({ top, left, width, target: rect });
    };
    const target = document.querySelector<HTMLElement>(STEPS[step].target);
    target?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const focus = requestAnimationFrame(() => panel.current?.focus());
    return () => {
      cancelAnimationFrame(focus);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [active, step, location.pathname, progressKey]);

  function close(completed = false) {
    setActive(false);
    try {
      sessionStorage.removeItem(progressKey);
      if (completed) localStorage.setItem(`${progressKey}-completed`, "true");
    } catch { /* optional */ }
    requestAnimationFrame(() => returnFocus.current?.focus());
  }
  useEffect(() => {
    if (!active) return;
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close(); }
      if (event.key === "Tab") {
        const controls = panel.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
        if (!controls?.length) return;
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [active]);

  if (!active) return null;
  return (
    <div className="arlovi-tour-layer">
      <div className="arlovi-tour-scrim" aria-hidden="true" />
      {pos.target && <div className="arlovi-tour-focus" aria-hidden="true" style={{ top: pos.target.top - 5, left: pos.target.left - 5, width: pos.target.width + 10, height: pos.target.height + 10 }} />}
      <div className="arlovi-tour-panel" role="dialog" aria-modal="true" aria-labelledby="arlovi-tour-title" aria-describedby="arlovi-tour-description" tabIndex={-1} ref={panel} style={{ top: pos.top, left: pos.left, width: pos.width }}>
        <div className="arlovi-tour-head"><span>GETTING TO KNOW ARLOVI</span><button type="button" aria-label="Close tour" onClick={() => close()}><X size={16}/></button></div>
        <div className="arlovi-tour-bars" role="progressbar" aria-label="Tour progress" aria-valuemin={0} aria-valuemax={STEPS.length} aria-valuenow={step+1}>{STEPS.map((item, index) => <span key={item.title} data-done={index <= step}/>)}</div>
        <h2 id="arlovi-tour-title">{STEPS[step].title}</h2>
        <p id="arlovi-tour-description">{STEPS[step].description}</p>
        <div className="arlovi-tour-actions">
          <button type="button" className="arlovi-tour-skip" onClick={() => close()}>Skip</button>
          <div>
            <button type="button" className="arlovi-tour-back" disabled={step === 0} onClick={() => setStep(s => s - 1)}><ArrowLeft size={15}/> Back</button>
            <button type="button" className="arlovi-tour-next" onClick={() => step === STEPS.length - 1 ? close(true) : setStep(s => s + 1)}>{step === STEPS.length - 1 ? "Finish tour" : "Next"} <ArrowRight size={15}/></button>
          </div>
        </div>
      </div>
    </div>
  );
}
