import { useEffect, useRef } from "react";
import { Minus, Plus, RotateCcw, X } from "lucide-react";
import { useUi } from "@/runtime/ui";
import "./display-preferences.css";

type Density = "compact" | "balanced" | "comfortable";

export function DisplayPreferences({ onClose }: { onClose: () => void }) {
  const scale = useUi(state => state.interfaceScale);
  const density = useUi(state => state.density);
  const setScale = useUi(state => state.setInterfaceScale);
  const setDensity = useUi(state => state.setDensity);
  const panel = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButton.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab" || !panel.current) return;
      const elements = Array.from(panel.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])'));
      if (!elements.length) return;
      if (event.shiftKey && document.activeElement === elements[0]) { event.preventDefault(); elements[elements.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === elements[elements.length - 1]) { event.preventDefault(); elements[0].focus(); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); previousFocus?.focus(); };
  }, [onClose]);

  return (
    <div className="display-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={panel} className="display-panel" role="dialog" aria-modal="true" aria-labelledby="display-title" aria-describedby="display-description">
        <header className="display-panel-heading">
          <div>
            <h2 id="display-title">Display & scaling</h2>
            <p id="display-description">Make Arlovi fit the way you work.</p>
          </div>
          <button ref={closeButton} type="button" className="display-icon-button" aria-label="Close display settings" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="display-panel-body">
          <div className="display-section-head">
            <label htmlFor="display-scale">Interface scale</label>
            <output htmlFor="display-scale" aria-live="off">{scale}%</output>
          </div>
          <p className="display-help">Adjust text, spacing and controls across every application.</p>
          <div className="display-range-row">
            <button type="button" className="display-icon-button" aria-label="Decrease interface scale by 5 percent" disabled={scale <= 75} onClick={() => setScale(scale - 5)}><Minus size={17}/></button>
            <input id="display-scale" type="range" min={75} max={150} step={5} value={scale} onChange={event => setScale(Number(event.target.value))} aria-valuetext={`${scale} percent`}/>
            <button type="button" className="display-icon-button" aria-label="Increase interface scale by 5 percent" disabled={scale >= 150} onClick={() => setScale(scale + 5)}><Plus size={17}/></button>
          </div>
          <div className="display-range-labels"><span>75% · Smaller</span><span>150% · Larger</span></div>
          <fieldset className="display-density">
            <legend>Interface density</legend>
            <p className="display-help">Choose how closely information is arranged.</p>
            <div className="display-density-options">
              {([["compact", "Compact"], ["balanced", "Balanced"], ["comfortable", "Spacious"]] as [Density, string][]).map(([value, label]) => (
                <label key={value} className="display-density-option" data-active={density === value}>
                  <input type="radio" name="display-density" value={value} checked={density === value} onChange={() => setDensity(value)}/>
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="display-preview" aria-label="Sample workspace card">
            <span className="display-preview-eyebrow">Preview</span>
            <div className="display-preview-card">
              <span className="display-preview-title">Workspace overview</span>
              <span className="display-preview-caption">Active projects</span>
              <strong>24</strong>
              <span className="display-preview-pill">View projects</span>
            </div>
          </div>
          <p className="display-help">Your choices are saved in this browser. Browser zoom and operating-system accessibility settings remain available.</p>
        </div>
        <footer className="display-panel-footer">
          <button type="button" className="display-reset" onClick={() => { setScale(100); setDensity("balanced"); }}><RotateCcw size={15}/> Reset defaults</button>
          <button type="button" className="display-done" onClick={onClose}>Done</button>
        </footer>
      </section>
    </div>
  );
}
