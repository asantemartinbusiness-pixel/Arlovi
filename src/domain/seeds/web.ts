import { registerSeed } from "@/domain/seedRegistry";

/** Northline and Harbor each keep a fuller site than the single draft page in the base seed. */
registerSeed("web", (context) => {
  const now = new Date(context.now);
  const day = 86_400_000;
  const iso = (offsetDays: number) => new Date(now.getTime() - offsetDays * day).toISOString();

  const northlineBody = {
    theme: { font: "Inter", accent: "#234fe8", ink: "#17223a", paper: "#ffffff", radius: 14, scale: 100 },
    seo: {
      siteTitle: "Northline Atelier — lighting made in Clerkenwell",
      description: "Brass and linen lighting made to order in a Clerkenwell workshop, with a showroom open six days a week.",
      robots: "index",
      sitemap: true,
    },
    analytics: { consent: "not_asked" },
    pages: [
      {
        id: "home",
        name: "Home",
        path: "/",
        status: "published",
        seo: { title: "Northline Atelier — lighting made in Clerkenwell", description: "Brass and linen lighting made to order, with a Clerkenwell showroom.", noindex: false },
        blocks: [
          { id: "h-hero", type: "hero", props: { title: "Lamps for rooms you actually live in", body: "Brass, linen and a showroom five minutes from Farringdon.", align: "center", tone: "accent", padding: "roomy", ctaLabel: "Book a consultation", ctaTarget: "/contact" } },
          { id: "h-cols", type: "columns", props: { title: "Why people come to us", items: ["Made to order in three weeks", "Fitted by our own electricians", "Five-year guarantee on every fitting"], columns: 3 } },
          { id: "h-gal", type: "gallery", props: { title: "Recent installations", items: ["Arc Lamp in a Hackney loft", "Pendant run over a kitchen island", "Reading light in a Bloomsbury study"], columns: 3, alt: "Three installed Northline fittings" } },
          { id: "h-foot", type: "footer", props: { items: ["Terms", "Privacy", "Contact"], body: "Northline Atelier Ltd · GB 418 2275 61 · 14 Clerkenwell Green, London", tone: "soft", padding: "tight" } },
        ],
      },
      {
        id: "range",
        name: "Range",
        path: "/range",
        status: "published",
        seo: { title: "The range and what it costs", description: "Trade and retail pricing for shades, fittings and installation, all shown ex VAT.", noindex: false },
        blocks: [
          { id: "r-hero", type: "hero", props: { title: "The range", body: "Everything is quoted ex VAT, because most of our buyers are trade.", align: "start", tone: "soft", padding: "normal" } },
          { id: "r-price", type: "pricing", props: { title: "What it costs", plans: [{ name: "Shade only", price: "£180", note: "Ex VAT" }, { name: "Shade and fitting", price: "£420", note: "Ex VAT" }, { name: "Arc Lamp", price: "£900", note: "Ex VAT, three week lead" }] } },
          { id: "r-text", type: "text", props: { title: "Lead times", body: "Three weeks from a confirmed order. Rush work is possible in ten days with a surcharge agreed in writing first." } },
          { id: "r-foot", type: "footer", props: { items: ["Terms", "Privacy", "Contact"], body: "Prices shown ex VAT.", tone: "soft", padding: "tight" } },
        ],
      },
      {
        id: "work",
        name: "Work",
        path: "/work",
        status: "draft",
        seo: { title: "Work", description: "", noindex: false },
        blocks: [
          { id: "w-hero", type: "hero", props: { title: "Work", body: "A few installations we are allowed to show.", align: "start", tone: "plain", padding: "normal" } },
          { id: "w-img", type: "image", props: { title: "Clerkenwell workshop", body: "The bench where every shade is finished.", alt: "" } },
          { id: "w-gal", type: "gallery", props: { title: "Installations", items: ["Hackney loft", "Bloomsbury study", "Islington restaurant"], columns: 3, alt: "" } },
        ],
      },
      {
        id: "contact",
        name: "Contact",
        path: "/contact",
        status: "published",
        seo: { title: "Book a consultation", description: "Ask for a showroom consultation or a quote for a fitted installation.", noindex: false },
        blocks: [
          { id: "c-hero", type: "hero", props: { title: "Book a consultation", body: "Tell us the room and we will tell you what fits.", align: "center", tone: "plain", padding: "normal" } },
          { id: "c-form", type: "form", props: { title: "Ask for a consultation", body: "We reply within two working days.", items: ["Name", "Email", "What the room is for"], ctaLabel: "Send the enquiry", formId: "nl-forms-001" } },
          { id: "c-foot", type: "footer", props: { items: ["Terms", "Privacy", "Contact"], body: "14 Clerkenwell Green, London EC1R 0DP", tone: "soft", padding: "tight" } },
        ],
      },
    ],
    nav: {
      header: [
        { id: "nav-home", label: "Home", target: "/", kind: "page", children: [] },
        { id: "nav-range", label: "Range", target: "/range", kind: "page", children: [] },
        { id: "nav-work", label: "Work", target: "/work", kind: "page", children: [] },
        { id: "nav-contact", label: "Contact", target: "/contact", kind: "page", children: [] },
      ],
      footer: [
        { id: "fnav-terms", label: "Terms", target: "/terms", kind: "page", children: [] },
        { id: "fnav-privacy", label: "Privacy", target: "/privacy", kind: "page", children: [] },
      ],
      redirects: [
        { id: "red-1", from: "/products", to: "/range", code: 301 },
        { id: "red-2", from: "/gallery", to: "/work", code: 301 },
      ],
    },
    components: [
      { id: "cmp-hero", name: "Showroom hero", shared: true, variants: ["centred", "left with image"], usedOn: ["Home", "Contact"], blocks: [{ id: "cmp-hero-b", type: "hero", props: { title: "Lamps for rooms you actually live in", body: "Brass, linen and a showroom five minutes from Farringdon.", align: "center", tone: "accent", padding: "roomy" } }] },
      { id: "cmp-foot", name: "Legal footer", shared: false, variants: [], usedOn: ["Home", "Range", "Contact"], blocks: [{ id: "cmp-foot-b", type: "footer", props: { items: ["Terms", "Privacy", "Contact"], tone: "soft", padding: "tight" } }] },
    ],
    cms: {
      collections: [
        {
          id: "col-fittings",
          name: "Fittings",
          slug: "fittings",
          fields: [
            { id: "f-name", name: "Name", type: "text", required: true, refCollection: "" },
            { id: "f-desc", name: "Description", type: "longtext", required: false, refCollection: "" },
            { id: "f-price", name: "Price ex VAT", type: "number", required: true, refCollection: "" },
            { id: "f-lead", name: "Lead weeks", type: "number", required: false, refCollection: "" },
          ],
        },
        {
          id: "col-stories",
          name: "Installations",
          slug: "installations",
          fields: [
            { id: "s-title", name: "Title", type: "text", required: true, refCollection: "" },
            { id: "s-body", name: "Story", type: "longtext", required: false, refCollection: "" },
            { id: "s-fitting", name: "Fitting", type: "reference", required: false, refCollection: "fittings" },
            { id: "s-date", name: "Completed", type: "date", required: false, refCollection: "" },
          ],
        },
      ],
      entries: [
        { id: "ent-arc", collectionId: "col-fittings", title: "Arc Lamp", status: "published", values: { "f-name": "Arc Lamp", "f-desc": "Brass arc with a linen shade, floor mounted.", "f-price": "900", "f-lead": "3" } },
        { id: "ent-pend", collectionId: "col-fittings", title: "Clerkenwell pendant", status: "published", values: { "f-name": "Clerkenwell pendant", "f-desc": "Single pendant, three finishes.", "f-price": "420", "f-lead": "2" } },
        { id: "ent-shade", collectionId: "col-fittings", title: "Linen shade", status: "draft", values: { "f-name": "Linen shade", "f-desc": "Replacement shade in four sizes.", "f-price": "180", "f-lead": "" } },
        { id: "ent-loft", collectionId: "col-stories", title: "Hackney loft", status: "published", values: { "s-title": "Hackney loft", "s-body": "Nine pendants over a long table, dimmed on one circuit.", "s-fitting": "Clerkenwell pendant", "s-date": "" } },
      ],
    },
    forms: [
      {
        id: "sf-consult",
        name: "Consultation enquiry",
        formRecordId: "nl-forms-001",
        fields: [
          { id: "sf-name", label: "Name", type: "text", required: true },
          { id: "sf-email", label: "Email", type: "email", required: true },
          { id: "sf-room", label: "What the room is for", type: "text", required: false },
        ],
        consent: "Keep my enquiry on file so the studio can reply about a consultation.",
        honeypot: true,
        route: "record",
        webhook: "",
      },
    ],
    domains: [
      {
        id: "dom-primary",
        host: "northline.co.uk",
        primary: true,
        verified: false,
        dns: [
          { type: "A", name: "@", value: "Provided by the host once one is connected" },
          { type: "CNAME", name: "www", value: "northline.co.uk." },
          { type: "TXT", name: "_arlovi", value: "arlovi-site=nl-sites-020" },
        ],
      },
    ],
    deployments: [
      { id: "dep-1", at: iso(9), environment: "preview", state: "exported", note: "Home and Range exported for review.", pages: 2, bytes: 7_400, actor: "Maya Chen" },
      { id: "dep-2", at: iso(4), environment: "production", state: "blocked", note: "Stopped at the hosting boundary. No hosting provider is connected.", pages: 4, bytes: 15_900, actor: "Maya Chen" },
    ],
  };

  const harborBody = {
    theme: { font: "Source Serif", accent: "#0f8780", ink: "#152321", paper: "#fffdf8", radius: 8, scale: 100 },
    seo: { siteTitle: "Harbor Supply — marine hardware, Brooklyn", description: "Cleats, rigging and deck hardware for working boats, stocked in Brooklyn.", robots: "index", sitemap: true },
    analytics: { consent: "declined" },
    pages: [
      {
        id: "hb-home",
        name: "Home",
        path: "/",
        status: "published",
        seo: { title: "Harbor Supply — marine hardware, Brooklyn", description: "Deck hardware and rigging for working boats, stocked in Brooklyn.", noindex: false },
        blocks: [
          { id: "hb-hero", type: "hero", props: { title: "Hardware for boats that work for a living", body: "Stocked in Brooklyn, shipped the same day.", align: "start", tone: "accent", padding: "roomy", ctaLabel: "See the catalog", ctaTarget: "/catalog" } },
          { id: "hb-cols", type: "columns", props: { title: "What we carry", items: ["Cleats and chocks", "Running rigging", "Deck fittings", "Fasteners by the box"], columns: 4 } },
          { id: "hb-foot", type: "footer", props: { items: ["Terms", "Shipping", "Contact"], body: "Harbor Supply · EIN 88-4410923 · 212 Van Brunt Street, Brooklyn", tone: "soft", padding: "tight" } },
        ],
      },
      {
        id: "hb-catalog",
        name: "Catalog",
        path: "/catalog",
        status: "published",
        seo: { title: "Catalog", description: "", noindex: false },
        blocks: [
          { id: "hb-cat-hero", type: "hero", props: { title: "Catalog", body: "Trade pricing on request.", align: "start", tone: "plain", padding: "normal" } },
          { id: "hb-cat-img", type: "image", props: { title: "Warehouse", body: "Row three, deck hardware.", alt: "" } },
        ],
      },
      {
        id: "hb-contact",
        name: "Contact",
        path: "/contact",
        status: "draft",
        seo: { title: "Contact", description: "Ask for a trade account or a shipping quote.", noindex: false },
        blocks: [
          { id: "hb-con-form", type: "form", props: { title: "Ask for a trade account", body: "We answer within one business day.", items: ["Name", "Company", "Email"], ctaLabel: "Send", formId: "" } },
        ],
      },
    ],
    nav: {
      header: [
        { id: "hb-nav-home", label: "Home", target: "/", kind: "page", children: [] },
        { id: "hb-nav-cat", label: "Catalog", target: "/catalog", kind: "page", children: [] },
        { id: "hb-nav-old", label: "Pricing", target: "/pricing", kind: "page", children: [] },
      ],
      footer: [],
      redirects: [],
    },
    components: [],
    cms: { collections: [], entries: [] },
    forms: [],
    domains: [],
    deployments: [],
  };

  return {
    records: [
      context.rec({
        org: "nl", collection: "sites", n: 20, title: "northline.co.uk",
        status: "active",
        summary: "Four pages, a theme, two content collections and one bound enquiry form. Exported, not hosted.",
        fields: { delivery: "not_connected", lastAuditAt: iso(3) },
        createdAt: iso(60),
        body: northlineBody,
      }),
      context.rec({
        org: "hb", collection: "sites", n: 20, title: "harborsupply.com",
        status: "active",
        owner: "Elena Ward",
        summary: "Three pages, no domain attached and a menu link that does not resolve.",
        fields: { delivery: "not_connected" },
        createdAt: iso(45),
        body: harborBody,
      }),
    ],
  };
});
