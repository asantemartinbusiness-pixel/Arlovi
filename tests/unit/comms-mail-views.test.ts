import { describe, expect, it } from "vitest";
import { filterMailView, relatedMailContext } from "@/applications/comms/mailViews";
import type { Rec } from "@/domain/types";

const rec = (id: string, collection: string, fields: Record<string, unknown>): Rec =>
  ({ id, collection, fields, title: id }) as unknown as Rec;

describe("mail views and related records", () => {
  const messages = [
    rec("a", "emailThreads", { folder: "inbox", unread: true }),
    rec("b", "emailThreads", { folder: "inbox", taskId: "task1" }),
    rec("c", "emailThreads", { folder: "inbox", risk: "phishing" }),
  ];

  it("filters unread, follow-up and flagged messages independently", () => {
    expect(filterMailView(messages, "all")).toHaveLength(3);
    expect(filterMailView(messages, "unread").map((row) => row.id)).toEqual(["a"]);
    expect(filterMailView(messages, "followup").map((row) => row.id)).toEqual(["b"]);
    expect(filterMailView(messages, "flagged").map((row) => row.id)).toEqual(["c"]);
  });

  it("links only matching local contact and referenced task", () => {
    const thread = rec("thread", "emailThreads", { from: "customer@example.com", to: "team@example.org", taskId: "task1", folder: "inbox" });
    const contact = rec("contact1", "contacts", { email: "customer@example.com" });
    const task = rec("task1", "tasks", { sourceThreadId: "thread" });
    const context = relatedMailContext(thread, [contact], [task]);
    expect(context.contact?.id).toBe("contact1");
    expect(context.task?.id).toBe("task1");
    expect(relatedMailContext(thread, [], []).contact).toBeUndefined();
  });
});
