import { registerSeed } from "@/domain/seedRegistry";

/** A richer form than the three-field enquiry in the base seed, with answers against it. */
registerSeed("forms", (context) => {
  const now = new Date(context.now);
  const day = 86_400_000;
  const iso = (offsetDays: number, hour = 10) => {
    const date = new Date(now.getTime() - offsetDays * day);
    date.setUTCHours(hour, 15, 0, 0);
    return date.toISOString();
  };

  const tradeFields = [
    { id: "t-company", type: "text", label: "Company name", required: true, help: "As it appears on your invoices.", minLength: 2, maxLength: 80 },
    { id: "t-reg", type: "text", label: "Company registration number", required: false, help: "Leave empty if you are a sole trader.", sensitive: true },
    { id: "t-trade", type: "select", label: "What kind of work do you do?", required: true, options: ["Interior design", "Architecture", "Contractor", "Retail", "Other"] },
    { id: "t-other", type: "text", label: "Tell us what kind of work", required: true, help: "Only asked when the trade above is Other." },
    { id: "t-sec-contact", type: "section", label: "Who we should speak to" },
    { id: "t-name", type: "text", label: "Your name", required: true },
    { id: "t-email", type: "email", label: "Email", required: true, pattern: "email" },
    { id: "t-phone", type: "text", label: "Telephone", required: false, pattern: "phone" },
    { id: "t-break", type: "pagebreak", label: "Page break" },
    { id: "t-sec-order", type: "section", label: "About the work" },
    { id: "t-value", type: "number", label: "Approximate annual spend, in pounds", required: false, min: 0, max: 500000 },
    { id: "t-rooms", type: "multiselect", label: "Which fittings interest you?", options: ["Pendants", "Wall lights", "Floor lamps", "Bespoke"] },
    { id: "t-when", type: "date", label: "When do you need the first delivery?" },
    { id: "t-cert", type: "fileref", label: "Name of the certificate you will send", help: "We ask for proof of trade before opening an account." },
    { id: "t-notes", type: "longtext", label: "Anything else", maxLength: 1200 },
    { id: "t-declare", type: "checkbox", label: "I confirm the details above are accurate", required: true },
  ];

  const tradeLogic = [
    { id: "lg-other", targetId: "t-other", action: "show", whenFieldId: "t-trade", operator: "equals", value: "Other" },
    { id: "lg-cert", targetId: "t-cert", action: "require", whenFieldId: "t-trade", operator: "not_equals", value: "Retail" },
    { id: "lg-value", targetId: "t-value", action: "show", whenFieldId: "t-company", operator: "answered", value: "" },
  ];

  const tradeBody = {
    fields: tradeFields,
    logic: tradeLogic,
    theme: { accent: "#234fe8", ink: "#17223a", paper: "#ffffff", radius: 12, width: "narrow", font: "Inter" },
    settings: {
      notifyEnabled: true,
      notifyTo: "accounts@northline.example",
      confirmation: "Thank you. We will look at your application and come back within two working days.",
      retentionDays: 540,
      access: "link",
      closed: false,
      closeMessage: "Trade applications are closed while we catch up on the backlog.",
      version: 3,
    },
  };

  const visitBody = {
    fields: [
      { id: "v-name", type: "text", label: "Name", required: true },
      { id: "v-email", type: "email", label: "Email", required: true, pattern: "email" },
      { id: "v-date", type: "date", label: "Which day suits you?", required: true },
      { id: "v-party", type: "number", label: "How many people", min: 1, max: 8 },
      { id: "v-access", type: "longtext", label: "Anything we should know about access", maxLength: 600 },
      { id: "v-rating", type: "rating", label: "How well do you know our range already?" },
    ],
    logic: [
      { id: "vl-access", targetId: "v-access", action: "show", whenFieldId: "v-party", operator: "greater_than", value: "2" },
    ],
    theme: { accent: "#0f8780", ink: "#17223a", paper: "#fbfaf7", radius: 18, width: "narrow", font: "Source Serif" },
    settings: {
      notifyEnabled: false, notifyTo: "", confirmation: "Booked in our book. Someone will confirm the time.",
      retentionDays: 180, access: "link", closed: false, closeMessage: "Visits are closed for the holidays.", version: 2,
    },
  };

  const harborBody = {
    fields: [
      { id: "h-name", type: "text", label: "Name", required: true },
      { id: "h-email", type: "email", label: "Email", required: true, pattern: "email" },
      { id: "h-vessel", type: "text", label: "Vessel name" },
      { id: "h-part", type: "longtext", label: "Which part do you need?", required: true },
      { id: "h-urgent", type: "checkbox", label: "This is holding a boat alongside" },
    ],
    logic: [],
    theme: { accent: "#0f8780", ink: "#152321", paper: "#fffdf8", radius: 8, width: "wide", font: "Source Serif" },
    settings: {
      notifyEnabled: true, notifyTo: "counter@harborsupply.example", confirmation: "We have it. The counter will call you back.",
      retentionDays: 365, access: "link", closed: false, closeMessage: "Closed.", version: 1,
    },
  };

  const submission = (n: number, parent: string, title: string, offsetDays: number, fields: Record<string, string | number | boolean>, status = "new") =>
    context.rec({
      org: "nl", collection: "submissions", n, title, status,
      summary: `Answered version ${fields.formVersion ?? 1} of the form.`,
      parentId: parent, at: iso(offsetDays), createdAt: iso(offsetDays),
      fields,
    });

  return {
    records: [
      context.rec({
        org: "nl", collection: "forms", n: 20, title: "Trade account application",
        status: "live",
        summary: "Fifteen questions over two pages, with three rules and a sensitive registration number.",
        createdAt: iso(120),
        body: tradeBody,
      }),
      context.rec({
        org: "nl", collection: "forms", n: 21, title: "Showroom visit booking",
        status: "live",
        summary: "A short booking form; the access question only appears for parties over two.",
        createdAt: iso(60),
        body: visitBody,
      }),
      context.rec({
        org: "nl", collection: "forms", n: 22, title: "Winter catalogue feedback",
        status: "draft",
        summary: "Drafted after the November mailing. Not published yet.",
        createdAt: iso(10),
        body: {
          fields: [
            { id: "w-rate", type: "rating", label: "How useful was the catalogue?", required: true },
            { id: "w-why", type: "longtext", label: "What would you change?" },
          ],
          logic: [],
          theme: { accent: "#b43e18", ink: "#17223a", paper: "#ffffff", radius: 12, width: "narrow", font: "Inter" },
          settings: { notifyEnabled: false, notifyTo: "", confirmation: "Thank you.", retentionDays: 365, access: "link", closed: false, closeMessage: "Closed.", version: 1 },
        },
      }),
      context.rec({
        org: "hb", collection: "forms", n: 20, title: "Parts enquiry", owner: "Elena Ward",
        status: "live",
        summary: "Counter enquiry form for parts that are not on the shelf.",
        createdAt: iso(80),
        body: harborBody,
      }),

      submission(20, "nl-forms-020", "Marlow & Finch", 12, {
        "Company name": "Marlow & Finch", "Company registration number": "09234118",
        "What kind of work do you do?": "Interior design", "Your name": "Claire Finch",
        Email: "claire@marlowfinch.example", Telephone: "020 7946 0821",
        "Approximate annual spend, in pounds": "18000", "Which fittings interest you?": "Pendants, Wall lights",
        "Name of the certificate you will send": "vat-certificate.pdf",
        "I confirm the details above are accurate": "yes",
        formVersion: 3, notificationState: "not_sent_no_mail_provider",
      }, "routed"),
      submission(21, "nl-forms-020", "Redhill Build", 8, {
        "Company name": "Redhill Build", "Company registration number": "11874402",
        "What kind of work do you do?": "Contractor", "Your name": "Sam Idowu",
        Email: "sam@redhillbuild.example", "Approximate annual spend, in pounds": "42000",
        "Which fittings interest you?": "Bespoke", "Name of the certificate you will send": "trade-ref.pdf",
        "I confirm the details above are accurate": "yes",
        formVersion: 3, notificationState: "not_sent_no_mail_provider",
      }, "reviewed"),
      submission(22, "nl-forms-020", "Oak & Slate", 3, {
        "Company name": "Oak & Slate", "What kind of work do you do?": "Other",
        "Tell us what kind of work": "Set dressing for television",
        "Your name": "Nina Petrova", Email: "nina@oakslate.example",
        "I confirm the details above are accurate": "yes",
        formVersion: 3, notificationState: "not_sent_no_mail_provider",
      }),
      submission(23, "nl-forms-021", "Theo Marsh", 6, {
        Name: "Theo Marsh", Email: "theo@marsh.example", "Which day suits you?": "2026-11-22",
        "How many people": "4", "Anything we should know about access": "One of us uses a wheelchair.",
        "How well do you know our range already?": "3",
        formVersion: 2, notificationState: "not_requested",
      }, "reviewed"),
      submission(24, "nl-forms-021", "Amina Rahman", 2, {
        Name: "Amina Rahman", Email: "amina@rahman.example", "Which day suits you?": "2026-11-29",
        "How many people": "2", "How well do you know our range already?": "5",
        formVersion: 2, notificationState: "not_requested",
      }),
      context.rec({
        org: "hb", collection: "submissions", n: 20, title: "Dockside Charters", owner: "Elena Ward",
        status: "new", summary: "Answered version 1 of the parts enquiry.",
        parentId: "hb-forms-020", at: iso(4), createdAt: iso(4),
        fields: {
          Name: "Ray Oyelaran", Email: "ray@docksidecharters.example", "Vessel name": "Marguerite",
          "Which part do you need?": "Stainless bow chock, 10 inch, to match an older pair.",
          "This is holding a boat alongside": "yes",
          formVersion: 1, notificationState: "not_sent_no_mail_provider",
        },
      }),
    ],
  };
});
