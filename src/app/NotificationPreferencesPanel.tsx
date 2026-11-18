import { ArrowLeft, BellOff, Clock3, LockKeyhole, Settings2, ShieldCheck } from "lucide-react";
import { Button } from "@/design-system";
import { useWorkspace } from "@/platform/workspace";
import { DEFAULT_NOTIFICATION_PREFERENCES, NOTIFICATION_CATEGORIES, type NotificationDeliveryMode } from "@/platform/notificationPolicy";
import { useUi } from "@/runtime/ui";

export function NotificationPreferencesPanel({ onBack, onOpenChannels }: {
  onBack: () => void; onOpenChannels: () => void;
}) {
  const { org, actor } = useWorkspace();
  const key = `${org.id}:${encodeURIComponent(actor)}`;
  const pref = useUi(state => state.notificationSettings[key]) ?? DEFAULT_NOTIFICATION_PREFERENCES;
  const save = useUi(state => state.setNotificationSettings);
  const updateMode = (category: keyof typeof pref.modes, value: NotificationDeliveryMode) =>
    save(key, { ...pref, modes: { ...pref.modes, [category]: value } });
  return (
    <section className="nt-preferences" aria-label="Personal notification preferences">
      <div className="nt-pref-lead">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft size={15}/> Back to notifications</Button>
        <div className="nt-pref-title"><Settings2 size={19}/><div><h3>Your notification preferences</h3><p>Choose what interrupts you. Everything still remains in your in-app activity feed.</p></div></div>
      </div>
      <label className="nt-pref-focus">
        <span><BellOff size={18}/><span><strong>Focus mode</strong><small>Quiet routine and non-critical interruptions while you work.</small></span></span>
        <input type="checkbox" checked={pref.focusMode} onChange={event => save(key, { ...pref, focusMode: event.target.checked })}/>
      </label>
      <div className="nt-pref-section">
        <div className="nt-pref-section-heading"><span>NOTIFICATION CATEGORY</span><span>DELIVERY MODE</span></div>
        {NOTIFICATION_CATEGORIES.map(category => (
          <label className="nt-pref-category" key={category.id}>
            <span><strong>{category.label}</strong><small>{category.detail}</small></span>
            {category.id === "security"
              ? <span className="nt-pref-locked"><LockKeyhole size={13}/> Mandatory</span>
              : <select value={pref.modes[category.id]} onChange={event => updateMode(category.id, event.target.value as NotificationDeliveryMode)}>
                  <option value="immediate">Immediate</option>
                  <option value="digest">Digest</option>
                  <option value="quiet">Quiet</option>
                </select>}
          </label>
        ))}
      </div>
      <div className="nt-pref-section">
        <div className="nt-pref-section-heading"><span>PRIVACY</span></div>
        <label className="nt-pref-focus">
          <span><ShieldCheck size={18}/><span><strong>Hide notification previews</strong><small>Use discreet summaries in the global notification panel.</small></span></span>
          <input type="checkbox" checked={pref.preview === "private"}
            onChange={event => save(key, { ...pref, preview: event.target.checked ? "private" : "standard" })}/>
        </label>
      </div>
      <div className="nt-pref-provider">
        <Clock3 size={18}/>
        <div><strong>Delivery channels and quiet-hour schedules</strong>
          <p>In-app updates are available. Email, push and SMS require their own verified delivery service. Browser-only preferences do not synchronise between devices.</p>
          <Button size="sm" variant="secondary" onClick={onOpenChannels}>Open notification policies</Button>
        </div>
      </div>
      <div className="nt-pref-foot"><span>Saved locally for this workspace profile.</span>
        <Button size="sm" variant="ghost" onClick={() => save(key, DEFAULT_NOTIFICATION_PREFERENCES)}>Restore defaults</Button></div>
    </section>
  );
}
