import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Drawer, Pill, Segmented, Empty } from "@/design-system";
import { attentionCounts, PRIORITY_LABEL, PRIORITY_TONE, type AttentionItem } from "@/platform/attention";
import { useMutations, useWorkspace } from "@/platform/workspace";
import { attentionReceiptKey } from "@/platform/attentionReceipts";
import { useUi } from "@/runtime/ui";

type View = "for-you" | "approvals" | "updates" | "resolved";

/**
 * Audit A06: scoped to the active organisation and routed to the active role,
 * with priority, grouping, and read / acknowledged / resolved kept apart.
 * Marking an item read never approves the thing it points at.
 */
export function AttentionCentre({ items, onClose, initialView = "for-you" }: { items: AttentionItem[]; onClose: () => void; initialView?: "for-you" | "approvals" | "updates" }) {
  const navigate = useNavigate();
  const { org, role, relative } = useWorkspace();
  const setReceipt = useUi((state) => state.setAttentionReceipt);
  const mutate = useMutations();
  const [view, setView] = useState<View>(initialView);
  const counts = attentionCounts(items);

  const shown = useMemo(() => {
    const live = items.filter((item) => !item.resolved);
    if (view === "approvals") return live.filter((item) => item.kind === "approval" || item.kind === "assignment" || item.kind === "interruption");
    if (view === "updates") return live.filter((item) => item.kind === "update" || item.kind === "mention" || item.kind === "system");
    if (view === "resolved") return items.filter((item) => item.resolved);
    return live;
  }, [items, view]);

  const groups = useMemo(() => {
    const map = new Map<string, AttentionItem[]>();
    for (const item of shown) {
      const list = map.get(item.group) ?? [];
      list.push(item);
      map.set(item.group, list);
    }
    return [...map.entries()];
  }, [shown]);

  async function markRead(item: AttentionItem) {
    // A generated alert is not the backing invoice, mission or approval record.
    setReceipt(attentionReceiptKey(org.id, role, item.id), { read: true });
    if (item.kind === "update" && item.sourceId === item.id) {
      await mutate.patch(item.sourceId, { fields: { read: true } }, { skipHistory: true });
    }
  }

  function acknowledge(item: AttentionItem) {
    // Acknowledgement is not authorization, approval or resolution.
    setReceipt(attentionReceiptKey(org.id, role, item.id), { read: true, acknowledged: true });
  }

  return (
    <Drawer
      open
      onOpenChange={(next) => { if (!next) onClose(); }}
      title={view === "approvals" ? "Inbox & decisions" : view === "updates" ? "Notifications" : "Attention"}
      subtitle={`${org.name} · ${counts.unread} unread, ${counts.approvals} awaiting a decision`}
      width={440}
      footer={<span className="ds-subtle">Reading an item does not approve it. Decisions are taken on the record.</span>}
    >
      <div className="ds-stack ds-gap-4">
        <Segmented
          label="Attention view"
          value={view}
          onChange={setView}
          options={[
            { value: "for-you", label: `For you (${counts.total})` },
            { value: "approvals", label: "Decisions & assignments" },
            { value: "updates", label: "Updates" },
            { value: "resolved", label: "Resolved" },
          ]}
        />

        {groups.length === 0 && (
          <Empty title="Nothing is waiting" >
            Items appear here when something in {org.name} needs a decision, passes a date, or is addressed to the {org.shortName} role you are viewing.
          </Empty>
        )}

        {groups.map(([group, groupItems]) => (
          <section key={group} className="ds-stack ds-gap-2">
            <h3 style={{ fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--fg-subtle)" }}>
              {group} · {groupItems.length}
            </h3>
            {groupItems.map((item) => {
              const read = item.read;
              return (
                <article
                  key={item.id}
                  className="ds-panel"
                  style={{ padding: "var(--space-3)", borderInlineStartWidth: 3, borderInlineStartColor: read ? "var(--border-default)" : "var(--accent)" }}
                >
                  <div className="ds-row ds-gap-2" style={{ alignItems: "flex-start" }}>
                    <Pill tone={PRIORITY_TONE[item.priority]}>{PRIORITY_LABEL[item.priority]}</Pill>
                    <span className="ds-grow" />
                    <span className="ds-subtle">{relative(item.at)}</span>
                  </div>
                  <strong style={{ display: "block", marginBlock: 6, fontWeight: read ? 550 : 680 }}>{item.title}</strong>
                  <p className="ds-subtle">{item.body}</p>
                  <div className="ds-row ds-gap-2" style={{ marginBlockStart: "var(--space-3)" }}>
                    {item.route && (
                      <Button size="sm" variant="secondary" onClick={() => { navigate(item.route!); onClose(); }}>
                        {item.kind === "approval" ? "Review on the record" : "Open"}
                      </Button>
                    )}
                    {!read && <Button size="sm" variant="ghost" onClick={() => { void markRead(item); }}>Mark read</Button>}
                    {!item.acknowledged && <Button size="sm" variant="ghost" onClick={() => acknowledge(item)}>Acknowledge</Button>}
                  </div>
                </article>
              );
            })}
          </section>
        ))}
      </div>
    </Drawer>
  );
}
