import { useEffect, useRef } from "react";
import { Minus, Plus, RotateCcw, X } from "lucide-react";
import { useUi } from "@/runtime/ui";
import { SCALE_DEFAULT, SCALE_MAX, SCALE_MIN, SCALE_STEP } from "@/runtime/interfaceScale";
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
      const elements = Array.from(panel.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled])'));
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
          <p className="display-help">100% is Arlovi’s new standard size (formerly 80%). Reduce it to make the interface smaller; 0% keeps a usable minimum.</p>
          <div className="display-range-row">
            <button type="button" className="display-icon-button" aria-label="Decrease interface scale by 5 percent" disabled={scale <= SCALE_MIN} onClick={() => setScale(scale - SCALE_STEP)}><Minus size={17}/></button>
            <input id="display-scale" type="range" min={SCALE_MIN} max={SCALE_MAX} step={SCALE_STEP} value={scale} onChange={event => setScale(Number(event.target.value))} aria-valuetext={scale === SCALE_DEFAULT ? "100 percent, standard size" : scale === SCALE_MIN ? "0 percent, minimum usable size" : `${scale} percent of adjustable size range`}/>
            <button type="button" className="display-icon-button" aria-label="Increase interface scale by 5 percent" disabled={scale >= SCALE_MAX} onClick={() => setScale(scale + SCALE_STEP)}><Plus size={17}/></button>
          </div>
          <div className="display-range-labels"><span>0% · Minimum</span><span>100% · Default</span></div>
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
          <button type="button" className="display-reset" onClick={() => { setScale(SCALE_DEFAULT); setDensity("balanced"); }}><RotateCcw size={15}/> Reset defaults</button>
          <button type="button" className="display-done" onClick={onClose}>Done</button>
        </footer>
      </section>
    </div>
  );
}
