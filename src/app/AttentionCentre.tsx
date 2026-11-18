import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, AtSign, Bell, CheckCheck, Clock3, Inbox, Search, Settings2, ShieldAlert, X } from "lucide-react";
import { Button, Drawer, Pill } from "@/design-system";
import {
  attentionCounts, headerAttentionCounts, isDecisionItem, isNotificationItem,
  PRIORITY_LABEL, PRIORITY_TONE, type AttentionItem,
} from "@/platform/attention";
import { attentionReceiptKey, attentionSnoozed } from "@/platform/attentionReceipts";
import {
  DEFAULT_NOTIFICATION_PREFERENCES, normalizeNotificationPreferences,
  notificationCategory, notificationPreferenceKey, safeNotificationPath,
} from "@/platform/notificationExperience";
import { useWorkspace } from "@/platform/workspace";
import { appEntry } from "@/app/catalog";
import { useUi } from "@/runtime/ui";
import { NotificationSettings } from "@/app/NotificationSettings";
import "./notification-experience.css";

export type AttentionView = "for-you" | "approvals" | "updates" | "urgent" | "history" | "settings";

const VIEW_LABELS: { value: AttentionView; label: string }[] = [
  { value: "for-you", label: "For you" },
  { value: "approvals", label: "Actions" },
  { value: "updates", label: "Updates" },
  { value: "urgent", label: "Urgent" },
  { value: "history", label: "History" },
];

function safeSummary(item: AttentionItem, detailed: boolean): string {
  if (!detailed && (notificationCategory(item) === "security" || /payroll|personal|confidential/i.test(item.group))) {
    return "Open the authorised record to see sensitive details.";
  }
  return item.body;
}

export function AttentionCentre({
  items, onClose, initialView = "for-you",
}: {
  items: AttentionItem[];
  onClose: () => void;
  initialView?: AttentionView;
}) {
  const navigate = useNavigate();
  const { org, actor, relative, now } = useWorkspace();
  const receipts = useUi((s) => s.attentionReceipts);
  const updateReceipt = useUi((s) => s.setAttentionReceipt);
  const updateReceipts = useUi((s) => s.setAttentionReceipts);
  const prefKey = notificationPreferenceKey(org.id, actor);
  const savedPrefs = useUi((s) => s.notificationPreferences[prefKey]);
  const prefs = normalizeNotificationPreferences(savedPrefs ?? DEFAULT_NOTIFICATION_PREFERENCES);
  const [view, setView] = useState<AttentionView>(initialView);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const counts = attentionCounts(items.filter(item => !attentionSnoozed(item, receipts, org.id, actor, now)));
  const { decisions } = headerAttentionCounts(items);

  const shown = useMemo(() => {
    if (view === "settings") return [];
    return items.filter((item) => {
      const snoozed = attentionSnoozed(item, receipts, org.id, actor, now);
      if (view === "history") {
        if (!item.resolved && !snoozed) return false;
      } else if (item.resolved || snoozed) return false;
      if (view === "approvals" && !isDecisionItem(item)) return false;
      if (view === "updates" && !isNotificationItem(item)) return false;
      if (view === "urgent" && item.priority !== "P0" && item.priority !== "P1") return false;
      if (unreadOnly && item.read) return false;
      const text = [item.title, item.body, item.group, item.kind].join(" ").toLowerCase();
      return text.includes(query.trim().toLowerCase());
    });
  }, [items, view, unreadOnly, query, receipts, org.id, actor, now]);

  const groups = useMemo(() => {
    const byGroup = new Map<string, AttentionItem[]>();
    for (const item of shown) {
      const group = item.group || "Other activity";
      const rows = byGroup.get(group) ?? [];
      rows.push(item);
      byGroup.set(group, rows);
    }
    return [...byGroup.entries()];
  }, [shown]);

  function receiptKey(item: AttentionItem) {
    return attentionReceiptKey(org.id, actor, item.id);
  }
  function markRead(item: AttentionItem, value: boolean) {
    updateReceipt(receiptKey(item), { read: value });
  }
  function acknowledge(item: AttentionItem) {
    updateReceipt(receiptKey(item), { read: true, acknowledged: true });
  }
  function snooze(item: AttentionItem, hours: number) {
    updateReceipt(receiptKey(item), { snoozedUntil: new Date(Date.now() + hours * 3600000).toISOString() });
  }
  function markVisibleRead() {
    const changes: Record<string, { read: boolean }> = {};
    for (const item of shown) if (!item.read) changes[receiptKey(item)] = { read: true };
    updateReceipts(changes);
  }
  function openItem(item: AttentionItem) {
    const route = safeNotificationPath(item.route, org.slug);
    if (!route) return;
    if (!item.read) markRead(item, true);
    navigate(route);
    onClose();
  }

  return (
    <Drawer
      open
      onOpenChange={(next) => { if (!next) onClose(); }}
      width={475}
      title={view === "settings" ? "Notification settings" : view === "approvals" ? "Inbox & decisions" : "Notifications"}
      subtitle={org.name + " · " + counts.unread + " unread · " + decisions + " awaiting action"}
      footer={<div className="an-footer">
        <span>Reading a notification never approves work.</span>
        <Button size="sm" variant="secondary" onClick={() => { navigate(appEntry("INBOX", org.slug)); onClose(); }}>Open full Inbox <ArrowRight size={14}/></Button>
      </div>}
    >
      <div className="an-root">
        <div className="an-topline">
          <div className="an-topline-heading"><Bell size={17}/><span>{view === "settings" ? "Control your attention" : "What needs your attention"}</span></div>
          <button type="button" className="an-icon-btn" onClick={() => setView(view === "settings" ? "for-you" : "settings")}
            aria-label={view === "settings" ? "Back to notifications" : "Notification settings"} title="Notification preferences">
            {view === "settings" ? <X size={16}/> : <Settings2 size={16}/>}
          </button>
        </div>

        {view === "settings" ? <NotificationSettings/> : <>
          <div className="an-view-tabs" role="group" aria-label="Notification filters">
            {VIEW_LABELS.map((option) =>
              <button key={option.value} type="button" aria-pressed={view === option.value}
                onClick={() => { setView(option.value); setDetailsId(null); }}>
                {option.label}{option.value === "approvals" && decisions > 0 ? <span>{decisions > 99 ? "99+" : decisions}</span> : null}
              </button>
            )}
          </div>
          <div className="an-tools">
            <label className="an-search">
              <Search size={15} aria-hidden="true"/>
              <span className="ds-sr-only">Search notifications</span>
              <input type="search" value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Search notifications" aria-label="Search notifications"/>
            </label>
            <label className="an-unread-toggle"><input type="checkbox" checked={unreadOnly} onChange={e => setUnreadOnly(e.target.checked)}/> Unread</label>
          </div>
          <div className="an-list-heading">
            <span>{shown.length} {shown.length === 1 ? "item" : "items"} · {prefs.focusMode ? "Focus mode on" : "Current workspace"}</span>
            {shown.some(item => !item.read) &&
              <button type="button" onClick={markVisibleRead}><CheckCheck size={14}/> Mark shown read</button>
            }
          </div>
          {groups.length === 0 && (
            <div className="an-empty" role="status">
              <span><CheckCheck size={26}/></span>
              <h3>You're all caught up</h3>
              <p>{view === "history" ? "No resolved or snoozed items match your filters." : "Nothing in this view right now. Important activity will appear here when it concerns you."}</p>
              {(query || unreadOnly) && <button type="button" onClick={() => { setQuery(""); setUnreadOnly(false); }}>Clear filters</button>}
            </div>
          )}
          {groups.map(([name, rows]) => (
            <section className="an-section" key={name} aria-label={name}>
              <h3>{name} <span>{rows.length}</span></h3>
              <div className="an-events">
                {rows.map(item => {
                  const actionable = isDecisionItem(item);
                  const urgent = item.priority === "P0" || item.priority === "P1";
                  const route = safeNotificationPath(item.route, org.slug);
                  const snoozed = attentionSnoozed(item, receipts, org.id, actor, now);
                  const why = detailsId === item.id;
                  return (
                    <article className="an-event" key={item.id} data-unread={!item.read} data-priority={item.priority}>
                      <div className="an-event-main">
                        <span className="an-event-icon" aria-hidden="true">
                          {urgent ? <ShieldAlert size={18}/> : item.kind === "mention" ? <AtSign size={18}/> :
                            actionable ? <Inbox size={18}/> : <Bell size={18}/>}
                        </span>
                        <div className="an-event-content">
                          <div className="an-event-meta"><span>{name}</span><time>{relative(item.at)}</time></div>
                          <strong>{item.title}{!item.read && <span className="an-unread-dot" aria-label="Unread"/>}</strong>
                          <p>{safeSummary(item, prefs.previews === "full")}</p>
                          <div className="an-event-badges">
                            {urgent && <Pill tone={PRIORITY_TONE[item.priority]}>{PRIORITY_LABEL[item.priority]}</Pill>}
                            {actionable && <span className="an-action-label">Needs action</span>}
                            {snoozed && <span className="an-action-label">Snoozed</span>}
                          </div>
                          <div className="an-event-actions">
                            {route && <button type="button" className="an-primary-action" onClick={() => openItem(item)}>{actionable ? "Review" : "Open"} <ArrowRight size={13}/></button>}
                            {!item.read && <button type="button" onClick={() => markRead(item, true)}>Mark read</button>}
                            {item.read && !item.resolved && <button type="button" onClick={() => markRead(item, false)}>Unread</button>}
                            {!item.acknowledged && !item.resolved && <button type="button" onClick={() => acknowledge(item)}>Acknowledge</button>}
                            {!urgent && !item.resolved && !snoozed && <button type="button" onClick={() => snooze(item, 1)}><Clock3 size={13}/> Snooze 1h</button>}
                            <button type="button" aria-expanded={why} onClick={() => setDetailsId(why ? null : item.id)}>Why me?</button>
                          </div>
                          {why && <div className="an-why">
                            <strong>Why you're seeing this</strong>
                            <p>{item.assignee ? "Assigned to " + item.assignee + ". " : item.audience.length ? "Sent to the " + item.audience.join(", ") + " role view. " : "Relevant to this workspace. "}
                              {item.group} · {PRIORITY_LABEL[item.priority]} priority. Reading or acknowledging does not change its underlying business status.
                            </p>
                            {!route && <p>This notification has no verified destination in the current organisation.</p>}
                          </div>}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
          <p className="an-local-note">Read, acknowledgement, focus and snooze preferences are browser-local. They do not authorise business actions or sync between devices yet.</p>
        </>}
      </div>
    </Drawer>
  );
}
