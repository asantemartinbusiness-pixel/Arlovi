import { Bell, Clock3, Focus, LockKeyhole, Mail, MonitorSmartphone, ShieldCheck, Volume2 } from "lucide-react";
import { useWorkspace } from "@/platform/workspace";
import { useUi } from "@/runtime/ui";
import {
  DEFAULT_NOTIFICATION_PREFERENCES, NOTIFICATION_CATEGORIES, normalizeNotificationPreferences,
  notificationPreferenceKey, type NotificationFrequency,
} from "@/platform/notificationExperience";

export function NotificationSettings() {
  const { org, actor } = useWorkspace();
  const key = notificationPreferenceKey(org.id, actor);
  const raw = useUi((state) => state.notificationPreferences[key]);
  const update = useUi((state) => state.setNotificationPreferences);
  const prefs = normalizeNotificationPreferences(raw ?? DEFAULT_NOTIFICATION_PREFERENCES);

  return (
    <section className="an-settings" aria-label="Notification preferences">
      <div className="an-settings-heading">
        <h3>Your notification preferences</h3>
        <p>Choose which events interrupt you. Every authorised event still remains available in the workspace Inbox.</p>
        <span className="an-local-label"><LockKeyhole size={13}/> Saved in this browser for {actor} · {org.shortName}</span>
      </div>
      <div className="an-settings-card">
        <label className="an-switch-line">
          <span className="an-settings-icon"><Focus size={18}/></span>
          <span className="an-switch-copy"><strong>Focus mode</strong><small>Quiet normal interruptions while you work. Critical security items remain visible.</small></span>
          <input type="checkbox" checked={prefs.focusMode} onChange={e => update(key, { focusMode: e.target.checked })} />
        </label>
        <label className="an-switch-line">
          <span className="an-settings-icon"><Volume2 size={18}/></span>
          <span className="an-switch-copy"><strong>Notification sounds</strong><small>Preference for supported in-app notification sounds; no audio is currently played.</small></span>
          <input type="checkbox" checked={prefs.sound} onChange={e => update(key, { sound: e.target.checked })} />
        </label>
      </div>
      <div className="an-settings-card">
        <h4><Bell size={16}/> What should interrupt you?</h4>
        <p className="an-settings-help">Immediate events are eligible for contextual attention. Digest and Quiet settings do not remove them from your bell or Inbox.</p>
        {NOTIFICATION_CATEGORIES.map(category => (
          <label className="an-category" key={category.id}>
            <span><strong>{category.label}</strong><small>{category.description}</small></span>
            {category.id === "security"
              ? <span className="an-locked">Always visible</span>
              : <select aria-label={category.label + " notification frequency"}
                  value={prefs.categories[category.id]}
                  onChange={e => update(key, { categories: { ...prefs.categories, [category.id]: e.target.value as NotificationFrequency } })}>
                  <option value="immediate">Immediate</option>
                  <option value="digest">Digest</option>
                  <option value="quiet">Quiet</option>
                </select>
            }
          </label>
        ))}
      </div>
      <div className="an-settings-card">
        <h4><Clock3 size={16}/> Privacy & digest</h4>
        <label className="an-category">
          <span><strong>Message previews</strong><small>Keep sensitive details out of condensed notification previews.</small></span>
          <select aria-label="Notification preview privacy" value={prefs.previews} onChange={e => update(key, { previews: e.target.value === "full" ? "full" : "limited" })}>
            <option value="limited">Limited</option>
            <option value="full">Detailed</option>
          </select>
        </label>
        <label className="an-category">
          <span><strong>Preferred digest time</strong><small>Used when a real delivery scheduler is connected.</small></span>
          <input type="time" aria-label="Preferred digest time" value={prefs.digestTime} onChange={e => update(key, { digestTime: e.target.value })}/>
        </label>
      </div>
      <div className="an-settings-card an-channel-status">
        <h4><MonitorSmartphone size={16}/> Delivery channels</h4>
        <div><Bell size={15}/><span>In-app bell & Inbox</span><strong>Available</strong></div>
        <div><Mail size={15}/><span>Email digest</span><small>Requires verified mail provider</small></div>
        <div><MonitorSmartphone size={15}/><span>Browser push</span><small>Requires push service and permission</small></div>
        <p className="an-settings-help"><ShieldCheck size={13}/> Delivery settings do not grant access to records or approve business decisions.</p>
      </div>
    </section>
  );
}
