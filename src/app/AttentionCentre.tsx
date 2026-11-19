import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, BellOff, CheckCheck, ChevronRight, Clock3, Inbox, Settings2, ShieldAlert } from "lucide-react";
import { Button, Drawer, Pill, Empty } from "@/design-system";
import {
  headerAttentionCounts, isDecisionItem, isNotificationItem, PRIORITY_LABEL,
  PRIORITY_TONE, type AttentionItem,
} from "@/platform/attention";
import { useWorkspace } from "@/platform/workspace";
import { attentionReceiptKey, type PresentedAttentionItem } from "@/platform/attentionReceipts";
import { DEFAULT_NOTIFICATION_PREFERENCES, groupNotificationUpdates, isUrgent, notificationCategory } from "@/platform/notificationPolicy";
import { appEntry } from "@/app/catalog";
import { clockNow } from "@/platform/clock";
import { useUi } from "@/runtime/ui";
import { NotificationPreferencesPanel } from "./NotificationPreferencesPanel";
import "./notifications.css";

type View = "for-you" | "approvals" | "updates" | "urgent" | "snoozed" | "resolved" | "settings";

/** Inbox remains the action authority: reading, acknowledging and snoozing never approve work. */
export function AttentionCentre({ items, onClose, initialView = "for-you" }: {
  items: PresentedAttentionItem[]; onClose: () => void; initialView?: View;
}) {
  const navigate = useNavigate();
  const { org, role, actor, relative } = useWorkspace();
  const setReceipt = useUi(state => state.setAttentionReceipt);
  const scope = `${org.id}:${encodeURIComponent(actor)}`;
  const preferences = useUi(state => state.notificationSettings[scope]) ?? DEFAULT_NOTIFICATION_PREFERENCES;
  const [view, setView] = useState<View>(initialView);
  const [explanation, setExplanation] = useState<string | null>(null);
  const pendingDecisions = headerAttentionCounts(items).decisions;

  const shown = useMemo(() => {
    if (view === "resolved") return items.filter(item => item.resolved);
    if (view === "snoozed") return items.filter(item => !item.resolved && item.snoozed);
    const live = items.filter(item => !item.resolved && !item.snoozed);
    if (view === "approvals") return live.filter(isDecisionItem);
    if (view === "updates") return live.filter(isNotificationItem);
    if (view === "urgent") return live.filter(item => isUrgent(item.priority));
    return live;
  }, [items, view]);

  const grouped = useMemo(() => groupNotificationUpdates(shown), [shown]);
  const unreadCount = items.filter(item => !item.resolved && !item.read && !item.snoozed).length;
  const receipt = (item: AttentionItem, update: { read?: boolean; acknowledged?: boolean; snoozedUntil?: string }) =>
    setReceipt(attentionReceiptKey(org.id, role, item.id, actor), update);

  function markRead(item: AttentionItem) {
    // Do not mutate the shared source notification: other employees have their own read state.
    receipt(item, { read: true });
  }
  function acknowledge(item: AttentionItem) { receipt(item, { read: true, acknowledged: true }); }
  function snooze(item: AttentionItem) {
    if (isUrgent(item.priority) || notificationCategory(item) === "security") return;
    const until = new Date(clockNow().getTime() + 60 * 60 * 1000).toISOString();
    receipt(item, { read: true, snoozedUntil: until });
  }
  function explain(item: AttentionItem): string {
    if (item.assignee) return `Assigned to ${item.assignee}. Your current workspace role is ${role}.`;
    if (item.audience.length) return `Visible to ${item.audience.join(", ")} roles, including your current ${role} view.`;
    return `Published to ${org.name}'s workspace attention feed. Visibility is limited by the current role view.`;
  }
  function openItem(item: AttentionItem) {
    if (!item.route || !item.route.startsWith(`/o/${org.slug}/`)) return;
    markRead(item);
    navigate(item.route);
    onClose();
  }
  const openPolicies = () => { navigate(`/o/${org.slug}/inbox/settings`); onClose(); };

  return (
    <Drawer
      open
      onOpenChange={next => { if (!next) onClose(); }}
      title={view === "settings" ? "Notification preferences" : view === "approvals" ? "Inbox & decisions" : "Notifications"}
      subtitle={`${org.name} · ${unreadCount} unread · ${pendingDecisions} awaiting action`}
      width={468}
      head={view !== "settings"
        ? <Button variant="ghost" iconOnly size="sm" aria-label="Notification settings"
            onClick={() => setView("settings")}><Settings2 size={17}/></Button>
        : undefined}
      footer={<div className="nt-drawer-footer">
        <span>{view === "settings" ? "Local preferences · provider delivery not configured" : "Reading is not approval."}</span>
        <Button size="sm" variant="secondary" onClick={() => { navigate(appEntry("INBOX", org.slug)); onClose(); }}>Open full Inbox <ChevronRight size={14}/></Button>
      </div>}
    >
      {view === "settings" ? <NotificationPreferencesPanel onBack={() => setView("updates")} onOpenChannels={openPolicies}/> :
      <div className="nt-centre">
        <nav className="nt-tabs" aria-label="Notification views">
          {([
            ["for-you","For you"],["approvals","Actions"],["updates","Updates"],
            ["urgent","Urgent"],["snoozed","Snoozed"],["resolved","Resolved"],
          ] as const).map(([id, label]) => (
            <button type="button" key={id} aria-current={view === id ? "page" : undefined}
              onClick={() => { setView(id); setExplanation(null); }}>{label}</button>
          ))}
        </nav>
        <div className="nt-summary">
          <div><span>Unread</span><strong>{unreadCount}</strong></div>
          <div><span>Needs action</span><strong>{pendingDecisions}</strong></div>
          <div><span>Urgent</span><strong>{items.filter(item => !item.resolved && isUrgent(item.priority)).length}</strong></div>
        </div>
        <div className="nt-feed-bar">
          <span>{shown.length} {shown.length === 1 ? "item" : "items"} in this view</span>
          {shown.some(item => !item.read) && <button type="button" onClick={() =>
            shown.filter(item => !item.read).forEach(markRead)}>
            <CheckCheck size={14}/> Mark visible read
          </button>}
        </div>
        {grouped.length === 0 && <Empty title={view === "snoozed" ? "Nothing snoozed" : view === "resolved" ? "No resolved items" : "You're all caught up"}>
          {view === "approvals" ? "No decisions are waiting on this role view." : view === "snoozed" ? "Snoozed items return here when their hour is up." : view === "resolved" ? "Items you finish appear here." :
            "New activity shows up here. Quieter items stay in the full Inbox."}
        </Empty>}
        <div className="nt-groups">
          {grouped.slice(0, 40).map(group => (
            <section className="nt-group" key={group.id}>
              {group.items.length > 1 && <div className="nt-group-heading"><span>{group.label}</span><span>Related activity</span></div>}
              {group.items.map(item => {
                const actionable = isDecisionItem(item);
                const sensitive = preferences.preview === "private" &&
                  (notificationCategory(item) === "security" || item.priority <= "P2");
                return <article className="nt-item" key={item.id} data-read={item.read} data-urgent={isUrgent(item.priority)}>
                  <div className="nt-item-top">
                    <span className="nt-kind-icon" aria-hidden="true">
                      {notificationCategory(item) === "security" ? <ShieldAlert size={17}/> :
                        actionable ? <Inbox size={17}/> : <Bell size={17}/>}
                    </span>
                    <div className="nt-item-body">
                      <div className="nt-item-line"><span>{item.group}</span><time>{relative(item.at)}</time></div>
                      <strong>{item.title}</strong>
                      <p>{sensitive ? "Sensitive details are hidden. Open the authorised record to review." : item.body}</p>
                      <div className="nt-item-status">
                        <Pill tone={PRIORITY_TONE[item.priority]}>{PRIORITY_LABEL[item.priority]}</Pill>
                        {!item.read && <span className="nt-unread">Unread</span>}
                        {actionable && item.read && <span>Still needs action</span>}
                      </div>
                      <div className="nt-item-actions">
                        {item.route && item.route.startsWith(`/o/${org.slug}/`) &&
                          <Button size="sm" variant="secondary" onClick={() => openItem(item)}>
                            {actionable ? "Review" : "Open"}
                          </Button>}
                        {!item.read && <button onClick={() => markRead(item)} type="button">Mark read</button>}
                        {item.read && <button onClick={() => receipt(item, { read: false })} type="button">Mark unread</button>}
                        {!item.acknowledged && <button onClick={() => acknowledge(item)} type="button">Acknowledge</button>}
                        {!isUrgent(item.priority) && notificationCategory(item) !== "security" && !item.snoozed && !item.resolved &&
                          <button onClick={() => snooze(item)} type="button"><Clock3 size={12}/> Snooze 1h</button>}
                        {item.snoozed && <button onClick={() => receipt(item, { snoozedUntil: "" })} type="button"><BellOff size={12}/> Unsnooze</button>}
                        <button type="button" aria-expanded={explanation === item.id}
                          onClick={() => setExplanation(explanation === item.id ? null : item.id)}>Why me?</button>
                      </div>
                      {explanation === item.id && <div className="nt-explanation">{explain(item)}
                        <p>Read and acknowledgement do not authorise, complete or resolve the source record.</p>
                      </div>}
                    </div>
                  </div>
                </article>;
              })}
            </section>
          ))}
        </div>
        {grouped.length > 40 && <p className="nt-overflow">Showing the first 40 groups. Open the full Inbox to review all activity.</p>}
      </div>}
    </Drawer>
  );
}
