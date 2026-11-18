import type { Rec } from "@/domain/types";
import { folderOf } from "./mailbox";

export type MailView = "all" | "unread" | "followup" | "flagged";

/** Views are local presentation filters, not provider-side mailbox changes. */
export function filterMailView(threads: Rec[], view: MailView): Rec[] {
  switch (view) {
    case "unread": return threads.filter((thread) => thread.fields.unread === true);
    case "followup": return threads.filter((thread) => Boolean(thread.fields.taskId) || thread.fields.followUp === true);
    case "flagged": return threads.filter((thread) => thread.fields.risk === "phishing" || thread.fields.flagged === true);
    default: return threads;
  }
}

export function relatedMailContext(thread: Rec, contacts: Rec[], tasks: Rec[]) {
  const addresses = [thread.fields.from, thread.fields.to, thread.fields.cc]
    .flatMap((value) => String(value ?? "").split(/[,;]/))
    .map((address) => address.trim().toLowerCase())
    .filter(Boolean);
  const contact = contacts.find((row) => addresses.includes(String(row.fields.email ?? "").toLowerCase()));
  const task = tasks.find((row) => row.id === thread.fields.taskId || row.fields.sourceThreadId === thread.id);
  return { contact, task, folder: folderOf(thread) };
}
