import { registerSeed, type SeedContext } from "@/domain/seedRegistry";
import type { Rec } from "@/domain/types";

/* ====================================================================== *
 * Communications, Email, Calendar & Meetings fixtures.
 *
 * Channels with real threads and reactions, email threads that stop at the
 * mail-provider boundary, and a meeting diary laid out around the seed clock
 * so the day, week and month views all have something in them.
 * ====================================================================== */

function at(now: string, offsetDays: number, hour = 9, minute = 0): string {
  const base = new Date(now);
  base.setUTCDate(base.getUTCDate() + offsetDays);
  base.setUTCHours(hour, minute, 0, 0);
  return base.toISOString();
}

interface ChannelSeed {
  n: number; title: string; topic: string; visibility: "public" | "private"; kind: "channel" | "group";
  members: string; unread: number; status?: string;
}

const CHANNELS: ChannelSeed[] = [
  { n: 20, title: "winter-collection", topic: "Everything about the winter run, from glaze to trade list.", visibility: "public", kind: "channel", members: "Maya Chen,Theo Marsh,Sable Nguyen,Rowan Patel,Fiona Buchanan,Priya Shah,Nia Okonkwo", unread: 4 },
  { n: 21, title: "commercial", topic: "Trade accounts, quotes and the showroom diary.", visibility: "public", kind: "channel", members: "Priya Shah,Iris Lindqvist,Maya Chen,Amara Bello,Jonah Adeyemi", unread: 2 },
  { n: 22, title: "workshop", topic: "Bench planning, tooling and safety.", visibility: "public", kind: "channel", members: "Rowan Patel,Sable Nguyen,Daniel Okafor,Marcus Reiss,Tobias Lund", unread: 0 },
  { n: 23, title: "care-escalations", topic: "Cases that need a maker or the founder.", visibility: "public", kind: "channel", members: "Clara Mendoza,Priya Shah,Sable Nguyen,Wren Ashby", unread: 3 },
  { n: 24, title: "finance-private", topic: "Payroll, pricing and anything with a number attached.", visibility: "private", kind: "channel", members: "Maya Chen,Jonah Adeyemi,Elena Voss,Hugh Tennant", unread: 1 },
  { n: 25, title: "design-review", topic: "Weekly crit. Post work before Thursday.", visibility: "public", kind: "channel", members: "Maya Chen,Theo Marsh,Fiona Buchanan,Kenji Watanabe", unread: 0 },
  { n: 26, title: "studio-random", topic: "Lunch, dogs and the good coffee place.", visibility: "public", kind: "channel", members: "Everyone", unread: 0 },
  { n: 27, title: "refit-2026", topic: "Archived: the first refit plan, superseded in October.", visibility: "public", kind: "channel", members: "Maya Chen,Priya Shah,Theo Marsh", unread: 0, status: "archived" },
  { n: 28, title: "Maya, Priya", topic: "Direct message", visibility: "private", kind: "group", members: "Maya Chen,Priya Shah", unread: 2 },
  { n: 29, title: "Winter launch crew", topic: "Group message for the trade preview.", visibility: "private", kind: "group", members: "Maya Chen,Priya Shah,Amara Bello,Iris Lindqvist", unread: 0 },
];

interface MessageSeed {
  n: number; channel: number; author: string; kind: "human" | "ai"; offsetDays: number; hour: number; minute: number;
  title: string; text: string; thread?: number; reactions?: string; mentions?: string; fileRef?: string; pinned?: boolean;
}

const MESSAGES: MessageSeed[] = [
  { n: 20, channel: 20, author: "Maya Chen", kind: "human", offsetDays: -2, hour: 9, minute: 12, title: "Warm glaze approved", text: "The warm glaze is approved for the whole winter run. The cool glaze is parked until spring.", reactions: "👍:Theo Marsh,Sable Nguyen,Fiona Buchanan;🎉:Priya Shah", pinned: true },
  { n: 21, channel: 20, author: "Sable Nguyen", kind: "human", offsetDays: -2, hour: 9, minute: 31, title: "Re: Warm glaze approved", text: "Good. I will run the next sixty on the warm batch and keep the two cool samples on the shelf.", thread: 20, reactions: "👍:Maya Chen" },
  { n: 22, channel: 20, author: "Nia Okonkwo", kind: "ai", offsetDays: -2, hour: 9, minute: 40, title: "Re: Warm glaze approved", text: "Noted against the Arc Lamp production run. I have drafted a line for the trade catalogue brief; a person needs to approve it before it goes anywhere.", thread: 20 },
  { n: 23, channel: 20, author: "Rowan Patel", kind: "human", offsetDays: -1, hour: 8, minute: 5, title: "Second bench", text: "We cannot start the 140 batch on one bench. @Elena Voss where are we with the maker hire?", mentions: "Elena Voss", reactions: "👀:Maya Chen" },
  { n: 24, channel: 20, author: "Elena Voss", kind: "human", offsetDays: -1, hour: 8, minute: 44, title: "Re: Second bench", text: "Marta Nowak is at offer. The offer is drafted in this workspace and has not been sent — no mail provider is connected.", thread: 23 },
  { n: 25, channel: 20, author: "Fiona Buchanan", kind: "human", offsetDays: 0, hour: 8, minute: 20, title: "Colourway sheet", text: "Updated colourway sheet is attached for the catalogue shoot.", fileRef: "nl-documents-001", reactions: "👍:Maya Chen,Amara Bello" },
  { n: 26, channel: 21, author: "Priya Shah", kind: "human", offsetDays: -1, hour: 14, minute: 2, title: "Clerkenwell quote", text: "Leo at Martins wants the Clerkenwell quote by Monday. I have drafted it; delivery is still local only.", reactions: "👍:Maya Chen" },
  { n: 27, channel: 21, author: "Iris Lindqvist", kind: "human", offsetDays: -1, hour: 16, minute: 30, title: "Saturday cover", text: "I have asked for Saturday off. @Priya Shah can you cover the trade diary?", mentions: "Priya Shah" },
  { n: 28, channel: 21, author: "Idris Cole", kind: "ai", offsetDays: 0, hour: 7, minute: 55, title: "Open invoices", text: "INV-1048 is still open past its due date. I can draft a reminder; sending it needs a connected mail provider and a person to press send.", reactions: "👍:Jonah Adeyemi" },
  { n: 29, channel: 22, author: "Rowan Patel", kind: "human", offsetDays: -3, hour: 7, minute: 40, title: "Airflow retest", text: "Four of six positions pass now. Positions three and five still fail.", pinned: true },
  { n: 30, channel: 22, author: "Marcus Reiss", kind: "human", offsetDays: -3, hour: 10, minute: 12, title: "Re: Airflow retest", text: "Position five is the ductwork run. I will look at it with the contractor on Thursday.", thread: 29 },
  { n: 31, channel: 22, author: "Tobias Lund", kind: "ai", offsetDays: -1, hour: 6, minute: 30, title: "Cover gap on Saturday", text: "Iris has requested Saturday. With Daniel off the roster at weekends the showroom has one person. I have not changed the roster.", reactions: "👀:Rowan Patel" },
  { n: 32, channel: 23, author: "Clara Mendoza", kind: "human", offsetDays: -1, hour: 11, minute: 5, title: "Harrow House shade", text: "Harrow House is back about the off-centre shade. Case CARE-19. @Sable Nguyen can you look at the collar tolerance?", mentions: "Sable Nguyen" },
  { n: 33, channel: 23, author: "Sable Nguyen", kind: "human", offsetDays: -1, hour: 12, minute: 48, title: "Re: Harrow House shade", text: "It is the pin seat, not the collar. I can re-seat it on site in twenty minutes.", thread: 32, reactions: "🙏:Clara Mendoza" },
  { n: 34, channel: 23, author: "Wren Ashby", kind: "ai", offsetDays: 0, hour: 8, minute: 10, title: "Draft reply ready", text: "I have drafted a reply for CARE-19 from the approved shade-seating article. It is waiting for Clara to send.", thread: 32 },
  { n: 35, channel: 24, author: "Jonah Adeyemi", kind: "human", offsetDays: -2, hour: 15, minute: 20, title: "Payroll inputs", text: "November inputs are in. Nothing is filed and nothing is banked — this workspace cannot do either.", reactions: "👍:Elena Voss" },
  { n: 36, channel: 25, author: "Theo Marsh", kind: "human", offsetDays: -4, hour: 13, minute: 0, title: "Pendant maquette", text: "Three maquettes on the shelf for Thursday's crit.", reactions: "🔥:Maya Chen,Fiona Buchanan" },
  { n: 37, channel: 26, author: "Daniel Okafor", kind: "human", offsetDays: -1, hour: 12, minute: 15, title: "Coffee", text: "The good machine is fixed." , reactions: "🎉:Iris Lindqvist,Clara Mendoza,Theo Marsh" },
  { n: 38, channel: 28, author: "Priya Shah", kind: "human", offsetDays: 0, hour: 8, minute: 2, title: "Trade preview date", text: "Can we hold the trade preview on the Thursday after the refit reopens?" },
  { n: 39, channel: 28, author: "Maya Chen", kind: "human", offsetDays: 0, hour: 8, minute: 25, title: "Re: Trade preview date", text: "Yes, if joinery lands. Let us decide at Friday close.", thread: 38 },
  { n: 40, channel: 29, author: "Amara Bello", kind: "human", offsetDays: -2, hour: 17, minute: 10, title: "Invite list", text: "Forty-two trade contacts on the list. I will not send anything until the date is fixed." },
];

interface EmailSeed {
  n: number; subject: string; folder: string; from: string; to: string; unread: boolean; risk: string;
  offsetDays: number; labels: string; summary: string;
  messages: { from: string; at: string; body: string; external: boolean }[];
}

function emails(ctx: SeedContext): EmailSeed[] {
  return [
    {
      n: 20, subject: "Oak for the trade counter — revised date", folder: "inbox", from: "orders@thamestimber.example", to: "maya@northline.example",
      unread: true, risk: "none", offsetDays: -1, labels: "supplier,refit",
      summary: "Thames Timber have pushed the oak delivery by two weeks.",
      messages: [
        { from: "orders@thamestimber.example", at: at(ctx.now, -1, 9, 14), body: "Morning Maya — the kiln run slipped. Earliest we can get the oak to Clerkenwell is a fortnight on Tuesday. Sorry for the short notice.", external: true },
        { from: "maya@northline.example", at: at(ctx.now, -1, 10, 2), body: "Understood. Please confirm in writing so I can move the joinery task. Is there any chance of a partial delivery for the counter top only?", external: false },
      ],
    },
    {
      n: 21, subject: "Clerkenwell quote", folder: "drafts", from: "priya@northline.example", to: "leo@martins.example",
      unread: false, risk: "none", offsetDays: 0, labels: "trade",
      summary: "Local draft with the trade pricing. Nothing has been sent.",
      messages: [
        { from: "priya@northline.example", at: at(ctx.now, 0, 8, 40), body: "Hello Leo — the quote for the Clerkenwell order is attached. Trade pricing holds for thirty days and the lead time is six weeks from deposit.", external: false },
      ],
    },
    {
      n: 22, subject: "URGENT: update your payment details", folder: "spam", from: "accounts@northline-billing.example", to: "jonah@northline.example",
      unread: true, risk: "phishing", offsetDays: -2, labels: "quarantined",
      summary: "Flagged as phishing. The sender domain does not match any supplier on record.",
      messages: [
        { from: "accounts@northline-billing.example", at: at(ctx.now, -2, 3, 11), body: "Dear supplier, our bank account has changed. Please update your records and pay all outstanding invoices to the new account immediately. Reply with confirmation.", external: true },
      ],
    },
    {
      n: 23, subject: "Harrow House — the shade again", folder: "inbox", from: "a.rahman@harrowhouse.example", to: "care@northline.example",
      unread: true, risk: "none", offsetDays: -1, labels: "care",
      summary: "Linked to case CARE-19.",
      messages: [
        { from: "a.rahman@harrowhouse.example", at: at(ctx.now, -1, 10, 55), body: "The pendant above the stair is still sitting a few degrees off. Could someone come and look before the end of the month?", external: true },
      ],
    },
    {
      n: 24, subject: "Trade preview — save the date?", folder: "sent", from: "priya@northline.example", to: "trade-list@northline.example",
      unread: false, risk: "none", offsetDays: -6, labels: "trade,campaign",
      summary: "Sent before the mail provider was disconnected; kept for the record.",
      messages: [
        { from: "priya@northline.example", at: at(ctx.now, -6, 11, 30), body: "We are reopening the showroom this winter and would like to show you the new collection first. A date will follow once the refit is finished.", external: false },
      ],
    },
    {
      n: 25, subject: "Insurance renewal documents", folder: "inbox", from: "renewals@kestrelbrokers.example", to: "maya@northline.example",
      unread: false, risk: "none", offsetDays: -4, labels: "legal",
      summary: "Public liability renewal. Linked to a legal obligation.",
      messages: [
        { from: "renewals@kestrelbrokers.example", at: at(ctx.now, -4, 14, 20), body: "Please find the renewal schedule for your public liability cover. The policy lapses at the start of next month if we do not hear from you.", external: true },
      ],
    },
    {
      n: 26, subject: "Application — maker, brass bench", folder: "archive", from: "s.achebe@example.com", to: "jobs@northline.example",
      unread: false, risk: "none", offsetDays: -21, labels: "hiring",
      summary: "Archived into the recruitment pipeline.",
      messages: [
        { from: "s.achebe@example.com", at: at(ctx.now, -21, 20, 5), body: "I saw the bench role through the craft guild. Eight years brazing and finishing; portfolio link below.", external: true },
      ],
    },
    {
      n: 27, subject: "Re: catalogue shoot dates", folder: "inbox", from: "kenji@example.com", to: "amara@northline.example",
      unread: false, risk: "none", offsetDays: -3, labels: "campaign",
      summary: "Two studio days held provisionally.",
      messages: [
        { from: "kenji@example.com", at: at(ctx.now, -3, 16, 40), body: "I can hold two days in the first week. Let me know once the shot list is agreed.", external: true },
        { from: "amara@northline.example", at: at(ctx.now, -3, 17, 15), body: "Holding both. Shot list goes to you as soon as Maya signs it off.", external: false },
      ],
    },
    {
      n: 28, subject: "Reminder: INV-1048", folder: "drafts", from: "jonah@northline.example", to: "accounts@claridge.example",
      unread: false, risk: "none", offsetDays: 0, labels: "finance",
      summary: "Drafted by the finance agent, waiting for a person to send it.",
      messages: [
        { from: "jonah@northline.example", at: at(ctx.now, 0, 7, 58), body: "A gentle reminder that invoice INV-1048 is now past its due date. The payment details are unchanged from our last invoice.", external: false },
      ],
    },
  ];
}

interface MeetingSeed {
  n: number; title: string; offsetDays: number; startHour: number; startMinute: number; minutes: number;
  where: string; organizer: string; attendees: string; agenda: string; status: string; recurring?: boolean;
}

const MEETINGS: MeetingSeed[] = [
  { n: 20, title: "Bench stand-up", offsetDays: 0, startHour: 8, startMinute: 30, minutes: 15, where: "Workshop", organizer: "Rowan Patel", attendees: "Rowan Patel,Sable Nguyen,Daniel Okafor", agenda: "Yesterday, today, anything blocked.", status: "scheduled", recurring: true },
  { n: 21, title: "Winter collection review", offsetDays: 0, startHour: 11, startMinute: 0, minutes: 60, where: "Studio table", organizer: "Maya Chen", attendees: "Maya Chen,Theo Marsh,Fiona Buchanan,Rowan Patel", agenda: "Glaze decision, batch two, catalogue shot list.", status: "scheduled" },
  { n: 22, title: "Refit site walk", offsetDays: 0, startHour: 14, startMinute: 30, minutes: 45, where: "Showroom", organizer: "Priya Shah", attendees: "Priya Shah,Marcus Reiss,Theo Marsh", agenda: "First fix progress and the joinery delay.", status: "scheduled" },
  { n: 23, title: "Trade account call — Martins", offsetDays: 1, startHour: 10, startMinute: 0, minutes: 30, where: "Phone", organizer: "Priya Shah", attendees: "Priya Shah,Leo Martins", agenda: "Clerkenwell quote and lead times.", status: "scheduled" },
  { n: 24, title: "People catch-up", offsetDays: 1, startHour: 15, startMinute: 0, minutes: 30, where: "Back office", organizer: "Elena Voss", attendees: "Elena Voss,Maya Chen", agenda: "Maker offer, Yvonne handover, probation dates.", status: "scheduled" },
  { n: 25, title: "Design crit", offsetDays: 4, startHour: 13, startMinute: 0, minutes: 90, where: "Studio table", organizer: "Maya Chen", attendees: "Maya Chen,Theo Marsh,Fiona Buchanan,Kenji Watanabe", agenda: "Three pendant maquettes.", status: "scheduled", recurring: true },
  { n: 26, title: "Interview — Samuel Achebe", offsetDays: 3, startHour: 11, startMinute: 0, minutes: 60, where: "Workshop", organizer: "Rowan Patel", attendees: "Rowan Patel,Sable Nguyen,Samuel Achebe", agenda: "Bench trial and finishing questions.", status: "scheduled" },
  { n: 27, title: "Interview — Tomas Bianchi", offsetDays: 3, startHour: 15, startMinute: 0, minutes: 45, where: "Showroom", organizer: "Priya Shah", attendees: "Priya Shah,Iris Lindqvist,Tomas Bianchi", agenda: "Showroom scenario and trade accounts.", status: "scheduled" },
  { n: 28, title: "Numbers with Jonah", offsetDays: 2, startHour: 9, startMinute: 30, minutes: 45, where: "Back office", organizer: "Jonah Adeyemi", attendees: "Jonah Adeyemi,Maya Chen,Hugh Tennant", agenda: "Unmatched statement lines and the refit spend.", status: "scheduled", recurring: true },
  { n: 29, title: "Safety walkthrough", offsetDays: 7, startHour: 8, startMinute: 0, minutes: 60, where: "Workshop", organizer: "Rowan Patel", attendees: "Rowan Patel,Maya Chen,Sable Nguyen,Daniel Okafor,Marcus Reiss", agenda: "Sign-off on guarding and extraction.", status: "scheduled" },
  { n: 30, title: "Catalogue shoot day one", offsetDays: 14, startHour: 9, startMinute: 0, minutes: 480, where: "Workshop", organizer: "Amara Bello", attendees: "Amara Bello,Kenji Watanabe,Fiona Buchanan", agenda: "Product stills against the warm glaze.", status: "tentative" },
  { n: 31, title: "Friday close", offsetDays: -1, startHour: 16, startMinute: 0, minutes: 30, where: "Back office", organizer: "Jonah Adeyemi", attendees: "Jonah Adeyemi,Maya Chen", agenda: "Ledger, unmatched lines, week ahead.", status: "finished", recurring: true },
  { n: 32, title: "Supplier review — Thames Brass", offsetDays: -4, startHour: 11, startMinute: 0, minutes: 45, where: "Phone", organizer: "Rowan Patel", attendees: "Rowan Patel,Maya Chen", agenda: "Collar lead times and the single-supplier risk.", status: "finished" },
  { n: 33, title: "All-studio briefing", offsetDays: 21, startHour: 17, startMinute: 0, minutes: 45, where: "Showroom", organizer: "Maya Chen", attendees: "Everyone", agenda: "Winter run, refit date, trade preview.", status: "scheduled" },
  { n: 34, title: "Month-end review", offsetDays: -16, startHour: 10, startMinute: 0, minutes: 60, where: "Back office", organizer: "Jonah Adeyemi", attendees: "Jonah Adeyemi,Maya Chen,Elena Voss", agenda: "Payroll approved, ledger closed.", status: "finished" },
];

registerSeed("comms", (ctx) => {
  const records: Rec[] = [
    ...CHANNELS.map((channel) => ctx.rec({
      org: "nl", collection: "channels", n: channel.n, title: channel.title, status: channel.status ?? "active",
      summary: channel.topic, owner: "Maya Chen",
      tags: [channel.visibility, channel.kind],
      fields: {
        kind: channel.kind, visibility: channel.visibility, topic: channel.topic,
        members: channel.members, memberCount: channel.members === "Everyone" ? 14 : channel.members.split(",").length,
        unread: channel.unread, muted: channel.title === "studio-random",
      },
    })),
    ...MESSAGES.map((message) => ctx.rec({
      org: "nl", collection: "messages", n: message.n, title: message.title,
      status: message.pinned ? "pinned" : "sent",
      summary: message.text, owner: message.author,
      parentId: `nl-channels-${String(message.channel).padStart(3, "0")}`,
      at: at(ctx.now, message.offsetDays, message.hour, message.minute),
      tags: message.kind === "ai" ? ["ai"] : [],
      fields: {
        author: message.author, kind: message.kind,
        threadRootId: message.thread ? `nl-messages-${String(message.thread).padStart(3, "0")}` : "",
        reactions: message.reactions ?? "", mentions: message.mentions ?? "",
        fileRef: message.fileRef ?? "", pinned: Boolean(message.pinned),
      },
    })),
    ...emails(ctx).map((email) => ctx.rec({
      org: "nl", collection: "emailThreads", n: email.n, title: email.subject,
      status: email.folder === "drafts" ? "draft" : email.folder,
      summary: email.summary, owner: "Maya Chen",
      at: at(ctx.now, email.offsetDays, 9),
      tags: email.labels.split(","),
      fields: {
        folder: email.folder, from: email.from, to: email.to, unread: email.unread,
        risk: email.risk, labels: email.labels, delivery: "not_connected",
        messageCount: email.messages.length,
      },
      body: { messages: email.messages },
    })),
    ...MEETINGS.map((meeting) => ctx.rec({
      org: "nl", collection: "meetings", n: meeting.n, title: meeting.title, status: meeting.status,
      summary: meeting.agenda, owner: meeting.organizer,
      startAt: at(ctx.now, meeting.offsetDays, meeting.startHour, meeting.startMinute),
      endAt: at(ctx.now, meeting.offsetDays, meeting.startHour + Math.floor(meeting.minutes / 60), meeting.startMinute + (meeting.minutes % 60)),
      at: at(ctx.now, meeting.offsetDays, meeting.startHour, meeting.startMinute),
      tags: meeting.recurring ? ["recurring"] : [],
      fields: {
        where: meeting.where, organizer: meeting.organizer, attendees: meeting.attendees,
        agenda: meeting.agenda, minutes: meeting.minutes, recurring: Boolean(meeting.recurring),
        conferencing: "not_connected", accepted: meeting.status === "finished" ? meeting.attendees.split(",").length : 0,
      },
      body: meeting.status === "finished"
        ? { notes: `${meeting.agenda} Decisions and actions were recorded in this workspace.`, actions: [{ label: "Follow up in the next session", owner: meeting.organizer, done: false }] }
        : undefined,
    })),
    ...[
      { n: 20, title: "Leo Martins — missed", contact: "nl-contacts-002", direction: "inbound", offset: -1, duration: 0, outcome: "missed", voicemail: true },
      { n: 21, title: "Sofia Berg — showroom visit", contact: "nl-contacts-003", direction: "inbound", offset: -2, duration: 240, outcome: "answered", voicemail: false },
      { n: 22, title: "Thames Timber — oak delay", contact: "", direction: "outbound", offset: -1, duration: 420, outcome: "answered", voicemail: false },
      { n: 23, title: "Harrow House — shade", contact: "nl-contacts-001", direction: "inbound", offset: -3, duration: 180, outcome: "answered", voicemail: false },
      { n: 24, title: "Unknown number", contact: "", direction: "inbound", offset: -4, duration: 0, outcome: "missed", voicemail: false },
      { n: 25, title: "Kestrel Brokers — renewal", contact: "", direction: "outbound", offset: -5, duration: 360, outcome: "answered", voicemail: false },
      { n: 26, title: "Claridge accounts — INV-1048", contact: "", direction: "outbound", offset: -2, duration: 0, outcome: "no answer", voicemail: true },
    ].map((call) => ctx.rec({
      org: "nl", collection: "calls", n: call.n, title: call.title,
      status: call.outcome === "missed" ? "missed" : call.voicemail ? "voicemail" : "done",
      summary: call.voicemail ? "Voicemail recorded as a local note. No telephony service is connected." : "Call noted against the contact record.",
      owner: "Priya Shah", at: at(ctx.now, call.offset, 11),
      fields: { contactId: call.contact, direction: call.direction, seconds: call.duration, outcome: call.outcome, voicemail: call.voicemail, queue: call.direction === "inbound" ? "Showroom" : "Direct" },
    })),
    ...[
      { n: 20, title: "Showroom reopening plan", status: "published", audience: "Everyone", offset: -5, acks: 11, body: "The refit is on site now. We are aiming to reopen for trade in five weeks; the date depends on the joinery delivery." },
      { n: 21, title: "New health and safety procedure", status: "published", audience: "Workshop", offset: -12, acks: 4, body: "The accident procedure has been rewritten. Everyone on the bench must read it and acknowledge it in Learning & Policies." },
      { n: 22, title: "Winter trade preview — save the date", status: "scheduled", audience: "Commercial", offset: 9, acks: 0, body: "We will hold a trade preview on the Thursday after the showroom reopens. The invitation list is drafted and not sent." },
      { n: 23, title: "Welcome Marcus Reiss", status: "published", audience: "Everyone", offset: -42, acks: 13, body: "Marcus joins as our lighting engineer and will own compliance for every fitting we make." },
      { n: 24, title: "Christmas closure dates", status: "draft", audience: "Everyone", offset: 0, acks: 0, body: "Draft: the studio closes from the 24th and reopens on the 2nd. Workshop cover for the Harrow House install is still to be agreed." },
      { n: 25, title: "Payroll date moved", status: "published", audience: "Everyone", offset: -20, acks: 12, body: "November pay lands a day early because of the weekend. Nothing about how pay is calculated has changed." },
    ].map((post) => ctx.rec({
      org: "nl", collection: "announcements", n: post.n, title: post.title, status: post.status,
      summary: post.body, owner: post.audience === "Workshop" ? "Rowan Patel" : "Maya Chen",
      at: at(ctx.now, post.offset, 9),
      fields: { audience: post.audience, acknowledgements: post.acks, requiresAck: post.audience === "Workshop", reach: post.audience === "Everyone" ? 14 : 5 },
      body: { html: `<p>${post.body}</p>` },
    })),
    ctx.rec({
      org: "nl", collection: "preferences", n: 20, title: "Maya Chen — mail identity", status: "active",
      summary: "Identity, signature and working hours for the owner view.", owner: "Maya Chen",
      fields: {
        kind: "commsIdentity", address: "maya@northline.example", displayName: "Maya Chen — Northline Atelier",
        workingStart: "08:30", workingEnd: "18:00", timezone: "Europe/London",
        presence: "In the studio", quietHours: "19:00–08:00", mentionsOnly: false,
        signature: "Maya Chen\nFounder, Northline Atelier\nClerkenwell, London",
      },
    }),
    ctx.rec({
      org: "hb", collection: "channels", n: 20, title: "yard", status: "active",
      summary: "Intake, racking and carrier bookings.", owner: "Elena Ward",
      fields: { kind: "channel", visibility: "public", topic: "Yard operations", members: "Elena Ward,Marcus Hale", memberCount: 2, unread: 1, muted: false },
    }),
    ctx.rec({
      org: "hb", collection: "messages", n: 20, title: "North bay quotes", status: "sent",
      summary: "Two racking quotes in, one supplier has not replied.", owner: "Marcus Hale",
      parentId: "hb-channels-020", at: at(ctx.now, -1, 13, 0),
      fields: { author: "Marcus Hale", kind: "human", threadRootId: "", reactions: "", mentions: "", fileRef: "", pinned: false },
    }),
    ctx.rec({
      org: "hb", collection: "meetings", n: 20, title: "Yard planning", status: "scheduled",
      summary: "Racking replacement sequencing.", owner: "Elena Ward",
      startAt: at(ctx.now, 1, 14, 0), endAt: at(ctx.now, 1, 15, 0), at: at(ctx.now, 1, 14, 0),
      fields: { where: "Yard office", organizer: "Elena Ward", attendees: "Elena Ward,Marcus Hale", agenda: "Sequence the bays so intake keeps running.", minutes: 60, recurring: false, conferencing: "not_connected", accepted: 1 },
    }),
  ];
  return { records };
});
