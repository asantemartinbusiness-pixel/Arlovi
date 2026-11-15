import type { Rec } from "@/domain/types";

/* ====================================================================== *
 * Site model — the structural document behind every WEB screen.
 *
 * Records seeded before this module existed carry only `body.pages[].blocks`
 * with `{ title, body }` props, so every reader goes through `readSite`,
 * which fills the rest from defaults instead of throwing.
 * ====================================================================== */

export const BLOCK_TYPES = ["hero", "columns", "text", "image", "gallery", "form", "pricing", "footer"] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export interface Plan { name: string; price: string; note: string }

export interface BlockProps {
  title: string;
  body: string;
  align: "start" | "center";
  tone: "plain" | "soft" | "accent";
  padding: "tight" | "normal" | "roomy";
  columns: number;
  items: string[];
  plans: Plan[];
  /** Image/gallery description. Empty means the audit reports a missing alternative. */
  alt: string;
  /** Call to action, used by the export and by the Interactions tab. */
  ctaLabel: string;
  ctaTarget: string;
  /** Form embed: the id of a form record in this workspace. */
  formId: string;
}

export interface Block { id: string; type: BlockType; props: BlockProps }

export interface PageSeo { title: string; description: string; noindex: boolean }

export interface Page {
  id: string;
  name: string;
  path: string;
  status: "draft" | "published";
  seo: PageSeo;
  blocks: Block[];
}

export interface Theme {
  font: "Inter" | "Source Serif" | "IBM Plex Mono";
  accent: string;
  ink: string;
  paper: string;
  radius: number;
  scale: number;
}

export interface NavLink { id: string; label: string; target: string; kind: "page" | "external" | "anchor"; children: NavLink[] }
export interface Redirect { id: string; from: string; to: string; code: 301 | 302 }

export interface SiteComponentDef {
  id: string; name: string; shared: boolean; variants: string[]; usedOn: string[]; blocks: Block[];
}

export type CmsFieldType = "text" | "longtext" | "number" | "date" | "boolean" | "reference";
export interface CmsField { id: string; name: string; type: CmsFieldType; required: boolean; refCollection: string }
export interface CmsCollection { id: string; name: string; slug: string; fields: CmsField[] }
export interface CmsEntry { id: string; collectionId: string; title: string; status: "draft" | "published"; values: Record<string, string> }

export interface SiteFormField { id: string; label: string; type: string; required: boolean }
export interface SiteForm {
  id: string; name: string; formRecordId: string; fields: SiteFormField[];
  consent: string; honeypot: boolean; route: "record" | "review"; webhook: string;
  /** Version a person last published inside the workspace, and when. */
  publishedVersion?: number; publishedAt?: string; publishedBy?: string;
}

export interface DnsRecord { type: string; name: string; value: string }
export interface DomainEntry { id: string; host: string; primary: boolean; verified: boolean; dns: DnsRecord[] }

export interface DeployEntry {
  id: string; at: string; environment: "preview" | "staging" | "production";
  state: "exported" | "blocked" | "rolled_back"; note: string; pages: number; bytes: number; actor: string;
}

export interface SiteModel {
  pages: Page[];
  theme: Theme;
  nav: { header: NavLink[]; footer: NavLink[]; redirects: Redirect[] };
  components: SiteComponentDef[];
  cms: { collections: CmsCollection[]; entries: CmsEntry[] };
  forms: SiteForm[];
  domains: DomainEntry[];
  deployments: DeployEntry[];
  seo: { siteTitle: string; description: string; robots: "index" | "noindex"; sitemap: boolean };
  analytics: { consent: "not_asked" | "granted" | "declined" };
}

export const DEFAULT_THEME: Theme = {
  font: "Inter", accent: "#234fe8", ink: "#17223a", paper: "#ffffff", radius: 12, scale: 100,
};

export function emptyProps(): BlockProps {
  return {
    title: "", body: "", align: "start", tone: "plain", padding: "normal",
    columns: 3, items: [], plans: [], alt: "", ctaLabel: "", ctaTarget: "", formId: "",
  };
}

const BLOCK_SEEDS: Record<BlockType, Partial<BlockProps>> = {
  hero: { title: "A heading that says what you sell", body: "One sentence of context under it.", align: "center", tone: "accent", padding: "roomy", ctaLabel: "See the range", ctaTarget: "/" },
  columns: { title: "Three reasons to choose us", items: ["Made to order", "Showroom fittings", "Five-year guarantee"], columns: 3 },
  text: { title: "About this page", body: "Write the detail that a buyer asks for before they commit." },
  image: { title: "Workshop", alt: "", body: "" },
  gallery: { title: "Recent work", items: ["Brass pendant", "Linen shade", "Showroom wall"], columns: 3, alt: "" },
  form: { title: "Ask a question", body: "Answers come back from the studio.", formId: "" },
  pricing: { title: "What it costs", plans: [{ name: "Shade only", price: "£180", note: "Ex VAT" }, { name: "Shade and fitting", price: "£420", note: "Ex VAT" }] },
  footer: { title: "", body: "", items: ["Terms", "Privacy", "Contact"], tone: "soft", padding: "tight" },
};

export const BLOCK_LABELS: Record<BlockType, string> = {
  hero: "Hero", columns: "Columns", text: "Text", image: "Image",
  gallery: "Gallery", form: "Form embed", pricing: "Pricing", footer: "Footer",
};

export const BLOCK_HINTS: Record<BlockType, string> = {
  hero: "Headline, sentence, one call to action",
  columns: "Equal tiles that collapse on a phone",
  text: "Heading with a paragraph",
  image: "Single figure with an alternative description",
  gallery: "Grid of captioned figures",
  form: "Embeds a form from this workspace",
  pricing: "Named plans with a figure each",
  footer: "Link row and small print",
};

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}${Date.now().toString(36).slice(-4)}${counter.toString(36)}`;
}

export function makeBlock(type: BlockType): Block {
  return { id: nextId("b"), type, props: { ...emptyProps(), ...BLOCK_SEEDS[type] } };
}

export function makePage(name: string, path: string): Page {
  return {
    id: nextId("p"), name, path,
    status: "draft",
    seo: { title: name, description: "", noindex: false },
    blocks: [makeBlock("hero"), makeBlock("text")],
  };
}

/* ------------------------------ Reading ------------------------------ */

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function strList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function readBlock(raw: unknown, index: number): Block {
  const row = asRecord(raw);
  const props = asRecord(row.props);
  const type = (BLOCK_TYPES as readonly string[]).includes(str(row.type)) ? (str(row.type) as BlockType) : "text";
  const plans = Array.isArray(props.plans)
    ? props.plans.map((plan) => {
      const entry = asRecord(plan);
      return { name: str(entry.name, "Plan"), price: str(entry.price), note: str(entry.note) };
    })
    : [];
  return {
    id: str(row.id) || `b${index + 1}`,
    type,
    props: {
      ...emptyProps(),
      ...BLOCK_SEEDS[type],
      title: str(props.title, str(BLOCK_SEEDS[type].title)),
      body: str(props.body, str(BLOCK_SEEDS[type].body)),
      align: str(props.align) === "center" ? "center" : "start",
      tone: ["plain", "soft", "accent"].includes(str(props.tone)) ? (str(props.tone) as BlockProps["tone"]) : (BLOCK_SEEDS[type].tone ?? "plain"),
      padding: ["tight", "normal", "roomy"].includes(str(props.padding)) ? (str(props.padding) as BlockProps["padding"]) : (BLOCK_SEEDS[type].padding ?? "normal"),
      columns: num(props.columns, BLOCK_SEEDS[type].columns ?? 3),
      items: props.items === undefined ? (BLOCK_SEEDS[type].items ?? []) : strList(props.items),
      plans: plans.length ? plans : (BLOCK_SEEDS[type].plans ?? []),
      alt: str(props.alt),
      ctaLabel: str(props.ctaLabel, str(BLOCK_SEEDS[type].ctaLabel)),
      ctaTarget: str(props.ctaTarget, str(BLOCK_SEEDS[type].ctaTarget)),
      formId: str(props.formId),
    },
  };
}

function readPage(raw: unknown, index: number): Page {
  const row = asRecord(raw);
  const seo = asRecord(row.seo);
  const name = str(row.name, `Page ${index + 1}`);
  return {
    id: str(row.id) || `page-${index + 1}`,
    name,
    path: str(row.path, index === 0 ? "/" : `/${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`),
    status: str(row.status) === "published" ? "published" : "draft",
    seo: { title: str(seo.title, name), description: str(seo.description), noindex: seo.noindex === true },
    blocks: (Array.isArray(row.blocks) ? row.blocks : []).map(readBlock),
  };
}

function readNav(raw: unknown, depth = 0): NavLink[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, index) => {
    const row = asRecord(item);
    const kind = str(row.kind);
    return {
      id: str(row.id) || `n${depth}-${index + 1}`,
      label: str(row.label, "Link"),
      target: str(row.target, "/"),
      kind: kind === "external" || kind === "anchor" ? kind : "page",
      children: depth > 0 ? [] : readNav(row.children, depth + 1),
    };
  });
}

/** Normalised view of a site record. Never mutates the record. */
export function readSite(record: Rec | undefined): SiteModel {
  const body = asRecord(record?.body);
  const theme = asRecord(body.theme);
  const nav = asRecord(body.nav);
  const cms = asRecord(body.cms);
  const seo = asRecord(body.seo);
  const analytics = asRecord(body.analytics);
  const pages = (Array.isArray(body.pages) ? body.pages : []).map(readPage);
  const live = pages.length ? pages : [makePage("Home", "/")];
  const header = readNav(nav.header);
  return {
    pages: live,
    theme: {
      font: ["Inter", "Source Serif", "IBM Plex Mono"].includes(str(theme.font)) ? (str(theme.font) as Theme["font"]) : DEFAULT_THEME.font,
      accent: str(theme.accent, DEFAULT_THEME.accent),
      ink: str(theme.ink, DEFAULT_THEME.ink),
      paper: str(theme.paper, DEFAULT_THEME.paper),
      radius: num(theme.radius, DEFAULT_THEME.radius),
      scale: num(theme.scale, DEFAULT_THEME.scale),
    },
    nav: {
      header: header.length ? header : live.map((page) => ({ id: `nav-${page.id}`, label: page.name, target: page.path, kind: "page" as const, children: [] })),
      footer: readNav(nav.footer),
      redirects: (Array.isArray(nav.redirects) ? nav.redirects : []).map((item, index) => {
        const row = asRecord(item);
        return { id: str(row.id) || `r${index + 1}`, from: str(row.from), to: str(row.to), code: num(row.code, 301) === 302 ? 302 : 301 as 301 | 302 };
      }),
    },
    components: (Array.isArray(body.components) ? body.components : []).map((item, index) => {
      const row = asRecord(item);
      return {
        id: str(row.id) || `c${index + 1}`,
        name: str(row.name, `Section ${index + 1}`),
        shared: row.shared === true,
        variants: strList(row.variants),
        usedOn: strList(row.usedOn),
        blocks: (Array.isArray(row.blocks) ? row.blocks : []).map(readBlock),
      };
    }),
    cms: {
      collections: (Array.isArray(cms.collections) ? cms.collections : []).map((item, index) => {
        const row = asRecord(item);
        return {
          id: str(row.id) || `col${index + 1}`,
          name: str(row.name, `Collection ${index + 1}`),
          slug: str(row.slug, "entries"),
          fields: (Array.isArray(row.fields) ? row.fields : []).map((field, fi) => {
            const entry = asRecord(field);
            const type = str(entry.type);
            return {
              id: str(entry.id) || `f${fi + 1}`,
              name: str(entry.name, `Field ${fi + 1}`),
              type: (["text", "longtext", "number", "date", "boolean", "reference"].includes(type) ? type : "text") as CmsFieldType,
              required: entry.required === true,
              refCollection: str(entry.refCollection),
            };
          }),
        };
      }),
      entries: (Array.isArray(cms.entries) ? cms.entries : []).map((item, index) => {
        const row = asRecord(item);
        const values = asRecord(row.values);
        return {
          id: str(row.id) || `e${index + 1}`,
          collectionId: str(row.collectionId),
          title: str(row.title, `Entry ${index + 1}`),
          status: str(row.status) === "published" ? "published" : "draft",
          values: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value ?? "")])),
        };
      }),
    },
    forms: (Array.isArray(body.forms) ? body.forms : []).map((item, index) => {
      const row = asRecord(item);
      return {
        id: str(row.id) || `sf${index + 1}`,
        name: str(row.name, `Form ${index + 1}`),
        formRecordId: str(row.formRecordId),
        fields: (Array.isArray(row.fields) ? row.fields : []).map((field, fi) => {
          const entry = asRecord(field);
          return { id: str(entry.id) || `ff${fi + 1}`, label: str(entry.label, `Field ${fi + 1}`), type: str(entry.type, "text"), required: entry.required === true };
        }),
        consent: str(row.consent, "Keep my enquiry on file so the studio can reply."),
        honeypot: row.honeypot !== false,
        route: str(row.route) === "review" ? "review" : "record",
        webhook: str(row.webhook),
        ...(typeof row.publishedVersion === "number" ? { publishedVersion: row.publishedVersion, publishedAt: str(row.publishedAt), publishedBy: str(row.publishedBy) } : {}),
      };
    }),
    domains: (Array.isArray(body.domains) ? body.domains : []).map((item, index) => {
      const row = asRecord(item);
      return {
        id: str(row.id) || `d${index + 1}`,
        host: str(row.host),
        primary: row.primary === true,
        verified: row.verified === true,
        dns: (Array.isArray(row.dns) ? row.dns : []).map((entry) => {
          const dns = asRecord(entry);
          return { type: str(dns.type, "A"), name: str(dns.name, "@"), value: str(dns.value) };
        }),
      };
    }),
    deployments: (Array.isArray(body.deployments) ? body.deployments : []).map((item, index) => {
      const row = asRecord(item);
      const state = str(row.state);
      const environment = str(row.environment);
      return {
        id: str(row.id) || `dep${index + 1}`,
        at: str(row.at),
        environment: (["preview", "staging", "production"].includes(environment) ? environment : "preview") as DeployEntry["environment"],
        state: (["exported", "blocked", "rolled_back"].includes(state) ? state : "blocked") as DeployEntry["state"],
        note: str(row.note),
        pages: num(row.pages, 0),
        bytes: num(row.bytes, 0),
        actor: str(row.actor),
      };
    }),
    seo: {
      siteTitle: str(seo.siteTitle, record?.title ?? "Site"),
      description: str(seo.description),
      robots: str(seo.robots) === "noindex" ? "noindex" : "index",
      sitemap: seo.sitemap !== false,
    },
    analytics: {
      consent: ["granted", "declined"].includes(str(analytics.consent)) ? (str(analytics.consent) as "granted" | "declined") : "not_asked",
    },
  };
}

/* ------------------------------ Export ------------------------------ */

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const FONT_STACKS: Record<Theme["font"], string> = {
  Inter: "Inter, system-ui, sans-serif",
  "Source Serif": "'Source Serif 4', Georgia, serif",
  "IBM Plex Mono": "'IBM Plex Mono', ui-monospace, monospace",
};

export function themeCss(theme: Theme): string {
  const base = Math.round((theme.scale / 100) * 16);
  return `:root{--ink:${theme.ink};--paper:${theme.paper};--accent:${theme.accent};--r:${theme.radius}px}
*{box-sizing:border-box}
body{margin:0;font-family:${FONT_STACKS[theme.font]};font-size:${base}px;line-height:1.55;color:var(--ink);background:var(--paper)}
.wrap{max-width:1040px;margin:0 auto;padding:0 20px}
nav.site{display:flex;gap:16px;flex-wrap:wrap;padding:16px 20px;border-bottom:1px solid rgba(0,0,0,.1)}
nav.site a{color:var(--ink);text-decoration:none;font-weight:600}
section{padding:40px 0}
section[data-pad=tight]{padding:20px 0}
section[data-pad=roomy]{padding:64px 0}
section[data-tone=soft]{background:rgba(0,0,0,.04)}
section[data-tone=accent]{background:var(--accent);color:#fff}
section[data-align=center]{text-align:center}
h1{font-size:${Math.round(base * 2.4)}px;margin:0 0 12px;line-height:1.1}
h2{font-size:${Math.round(base * 1.6)}px;margin:0 0 10px}
p{margin:0 0 12px;max-width:68ch}
section[data-align=center] p{margin-inline:auto}
.cta{display:inline-block;margin-top:8px;padding:10px 18px;border-radius:var(--r);background:var(--ink);color:var(--paper);text-decoration:none;font-weight:600}
section[data-tone=accent] .cta{background:#fff;color:var(--accent)}
.cols{display:grid;gap:16px;grid-template-columns:repeat(var(--n,3),minmax(0,1fr))}
.tile{background:rgba(0,0,0,.05);border-radius:var(--r);padding:16px}
section[data-tone=accent] .tile{background:rgba(255,255,255,.16)}
figure{margin:0}
.ph{display:grid;place-items:center;min-height:160px;background:rgba(0,0,0,.07);border-radius:var(--r);font-size:.85em;opacity:.7}
.plans{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
.plan{border:1px solid rgba(0,0,0,.14);border-radius:var(--r);padding:18px}
.plan b{display:block;font-size:1.5em}
form.site{display:grid;gap:12px;max-width:420px}
section[data-align=center] form.site{margin-inline:auto}
form.site label{display:grid;gap:4px;font-weight:600;font-size:.9em;text-align:start}
form.site input,form.site textarea,form.site select{font:inherit;padding:9px 10px;border:1px solid rgba(0,0,0,.25);border-radius:calc(var(--r) / 2);background:#fff;color:#17223a}
form.site button{font:inherit;font-weight:600;padding:10px 16px;border:0;border-radius:var(--r);background:var(--ink);color:var(--paper)}
footer.site{background:rgba(0,0,0,.06);padding:24px 0;font-size:.9em}
footer.site ul{display:flex;gap:16px;flex-wrap:wrap;list-style:none;margin:0 0 8px;padding:0}
@media (max-width:900px){.cols{grid-template-columns:repeat(2,minmax(0,1fr))}h1{font-size:${Math.round(base * 1.9)}px}}
@media (max-width:640px){.cols{grid-template-columns:1fr}section{padding:28px 0}section[data-pad=roomy]{padding:36px 0}h1{font-size:${Math.round(base * 1.6)}px}nav.site{gap:10px}}`;
}

export function blockHtml(block: Block): string {
  const { props } = block;
  const open = `<section data-block="${block.type}" data-tone="${props.tone}" data-align="${props.align}" data-pad="${props.padding}"><div class="wrap">`;
  const close = "</div></section>";
  const heading = props.title ? `<h${block.type === "hero" ? 1 : 2}>${escapeHtml(props.title)}</h${block.type === "hero" ? 1 : 2}>` : "";
  const text = props.body ? `<p>${escapeHtml(props.body)}</p>` : "";
  const cta = props.ctaLabel ? `<a class="cta" href="${escapeHtml(props.ctaTarget || "/")}">${escapeHtml(props.ctaLabel)}</a>` : "";
  switch (block.type) {
    case "hero":
      return `${open}${heading}${text}${cta}${close}`;
    case "text":
      return `${open}${heading}${text}${close}`;
    case "columns":
      return `${open}${heading}${text}<div class="cols" style="--n:${Math.max(1, Math.min(4, props.columns))}">${props.items.map((item) => `<div class="tile"><h3>${escapeHtml(item)}</h3></div>`).join("")}</div>${close}`;
    case "image":
      return `${open}${heading}<figure><div class="ph" role="img" aria-label="${escapeHtml(props.alt || "Image without a description")}">${escapeHtml(props.alt || "No alternative text recorded")}</div>${props.body ? `<figcaption>${escapeHtml(props.body)}</figcaption>` : ""}</figure>${close}`;
    case "gallery":
      return `${open}${heading}<div class="cols" style="--n:${Math.max(1, Math.min(4, props.columns))}">${props.items.map((item) => `<figure><div class="ph" role="img" aria-label="${escapeHtml(item)}">${escapeHtml(item)}</div><figcaption>${escapeHtml(item)}</figcaption></figure>`).join("")}</div>${close}`;
    case "pricing":
      return `${open}${heading}${text}<div class="plans">${props.plans.map((plan) => `<div class="plan"><h3>${escapeHtml(plan.name)}</h3><b>${escapeHtml(plan.price)}</b><span>${escapeHtml(plan.note)}</span></div>`).join("")}</div>${close}`;
    case "form":
      return `${open}${heading}${text}<form class="site" method="post" action="${escapeHtml(props.ctaTarget || "#")}">${props.items.map((item, index) => `<label>${escapeHtml(item)}<input name="field${index + 1}" ${index === 0 ? "required" : ""}></label>`).join("")}<button type="submit">${escapeHtml(props.ctaLabel || "Send")}</button></form><p><small>Submissions are written to this workspace. No mail provider is attached to this export.</small></p>${close}`;
    case "footer":
      return `<footer class="site"><div class="wrap"><ul>${props.items.map((item) => `<li><a href="/${escapeHtml(item.toLowerCase().replace(/[^a-z0-9]+/g, "-"))}">${escapeHtml(item)}</a></li>`).join("")}</ul>${props.body ? `<p>${escapeHtml(props.body)}</p>` : ""}</div></footer>`;
    default:
      return `${open}${heading}${text}${close}`;
  }
}

export function pageHtml(site: SiteModel, page: Page): string {
  const nav = site.nav.header.length
    ? `<nav class="site">${site.nav.header.map((link) => `<a href="${escapeHtml(link.target)}"${link.kind === "external" ? ' rel="noreferrer"' : ""}>${escapeHtml(link.label)}</a>`).join("")}</nav>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(page.seo.title || page.name)}</title>
${page.seo.description ? `<meta name="description" content="${escapeHtml(page.seo.description)}">\n` : ""}${page.seo.noindex || site.seo.robots === "noindex" ? '<meta name="robots" content="noindex">\n' : ""}<style>${themeCss(site.theme)}</style>
</head>
<body>
${nav}
${page.blocks.map(blockHtml).join("\n")}
</body>
</html>`;
}

export function sitemapXml(site: SiteModel, host: string): string {
  const base = host ? `https://${host}` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${site.pages.filter((page) => !page.seo.noindex).map((page) => `  <url><loc>${escapeHtml(base + page.path)}</loc></url>`).join("\n")}
</urlset>`;
}

export function exportBytes(site: SiteModel): number {
  return site.pages.reduce((sum, page) => sum + new TextEncoder().encode(pageHtml(site, page)).length, 0);
}

/* ------------------------------ Audits ------------------------------ */

export type IssueLevel = "fail" | "warn" | "pass";

export interface Issue {
  id: string;
  area: "SEO" | "Accessibility" | "Performance" | "Links";
  level: IssueLevel;
  title: string;
  detail: string;
  /** What the audit measured, so the figure is never an opinion. */
  measured: string;
  pageId?: string;
  blockId?: string;
  fix?: { label: string; kind: "pageTitle" | "pageDescription" | "blockAlt" | "sitemap" };
}

function channel(value: number): number {
  const ratio = value / 255;
  return ratio <= 0.03928 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
}

export function parseHex(hex: string): [number, number, number] | null {
  const clean = hex.trim().replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((part) => part + part).join("") : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [0, 2, 4].map((index) => Number.parseInt(full.slice(index, index + 2), 16)) as [number, number, number];
}

export function luminance(hex: string): number | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.1 contrast ratio, computed — not asserted. */
export function contrastRatio(a: string, b: string): number | null {
  const first = luminance(a);
  const second = luminance(b);
  if (first === null || second === null) return null;
  const light = Math.max(first, second);
  const dark = Math.min(first, second);
  return (light + 0.05) / (dark + 0.05);
}

export function auditSite(site: SiteModel, formTitles: Record<string, string>): Issue[] {
  const issues: Issue[] = [];
  const paths = new Map<string, number>();
  const titles = new Map<string, number>();

  for (const page of site.pages) {
    paths.set(page.path, (paths.get(page.path) ?? 0) + 1);
    const seoTitle = page.seo.title.trim();
    titles.set(seoTitle.toLowerCase(), (titles.get(seoTitle.toLowerCase()) ?? 0) + 1);

    issues.push(seoTitle.length === 0
      ? { id: `seo-title-${page.id}`, area: "SEO", level: "fail", title: `${page.name} has no page title`, detail: "A page without a title element is listed by its address.", measured: "title length 0 characters", pageId: page.id, fix: { label: "Use the page name as the title", kind: "pageTitle" } }
      : seoTitle.length > 60
        ? { id: `seo-title-${page.id}`, area: "SEO", level: "warn", title: `${page.name} title is ${seoTitle.length} characters`, detail: "Over roughly 60 characters a title is usually truncated in results.", measured: `title length ${seoTitle.length} characters`, pageId: page.id }
        : { id: `seo-title-${page.id}`, area: "SEO", level: "pass", title: `${page.name} title is ${seoTitle.length} characters`, detail: "Within the length that is normally shown in full.", measured: `title length ${seoTitle.length} characters`, pageId: page.id });

    const description = page.seo.description.trim();
    issues.push(description.length === 0
      ? { id: `seo-desc-${page.id}`, area: "SEO", level: "warn", title: `${page.name} has no meta description`, detail: "Without one, the summary is taken from the first text on the page.", measured: "description length 0 characters", pageId: page.id, fix: { label: "Write one from the first paragraph", kind: "pageDescription" } }
      : { id: `seo-desc-${page.id}`, area: "SEO", level: "pass", title: `${page.name} description is ${description.length} characters`, detail: "A description is present.", measured: `description length ${description.length} characters`, pageId: page.id });

    const h1Count = page.blocks.filter((block) => block.type === "hero" && block.props.title.trim()).length;
    issues.push(h1Count === 1
      ? { id: `a11y-h1-${page.id}`, area: "Accessibility", level: "pass", title: `${page.name} has one first-level heading`, detail: "Exactly one hero block carries a heading.", measured: `${h1Count} h1 element`, pageId: page.id }
      : { id: `a11y-h1-${page.id}`, area: "Accessibility", level: h1Count === 0 ? "fail" : "warn", title: `${page.name} has ${h1Count} first-level headings`, detail: h1Count === 0 ? "Nothing on the page announces what it is about." : "More than one h1 makes the outline ambiguous.", measured: `${h1Count} h1 elements`, pageId: page.id });

    for (const block of page.blocks) {
      if ((block.type === "image" || block.type === "gallery") && !block.props.alt.trim()) {
        issues.push({ id: `a11y-alt-${block.id}`, area: "Accessibility", level: "fail", title: `${block.type === "image" ? "Image" : "Gallery"} on ${page.name} has no alternative description`, detail: "A figure with no text alternative is skipped by a screen reader.", measured: "alt length 0 characters", pageId: page.id, blockId: block.id, fix: { label: "Describe it from the block title", kind: "blockAlt" } });
      }
      if (block.type === "form") {
        const linked = block.props.formId && formTitles[block.props.formId];
        issues.push(linked
          ? { id: `link-form-${block.id}`, area: "Links", level: "pass", title: `Form embed on ${page.name} resolves`, detail: `Bound to ${linked}.`, measured: "1 of 1 form embeds resolve", pageId: page.id, blockId: block.id }
          : { id: `link-form-${block.id}`, area: "Links", level: "fail", title: `Form embed on ${page.name} is not bound`, detail: "The block renders but a submission has nowhere to go.", measured: "0 of 1 form embeds resolve", pageId: page.id, blockId: block.id });
      }
      if (block.props.ctaLabel && /^(click here|here|read more|more)$/i.test(block.props.ctaLabel.trim())) {
        issues.push({ id: `a11y-cta-${block.id}`, area: "Accessibility", level: "warn", title: `Call to action on ${page.name} is not descriptive`, detail: `"${block.props.ctaLabel}" does not say where it goes when read out of context.`, measured: `link text "${block.props.ctaLabel}"`, pageId: page.id, blockId: block.id });
      }
    }
  }

  for (const [path, count] of paths) {
    if (count > 1) issues.push({ id: `seo-dup-path-${path}`, area: "SEO", level: "fail", title: `${count} pages answer ${path}`, detail: "Two pages on one address means one of them is unreachable.", measured: `${count} pages share the path` });
  }
  for (const [title, count] of titles) {
    if (count > 1 && title) issues.push({ id: `seo-dup-title-${title}`, area: "SEO", level: "warn", title: `${count} pages share the title "${title}"`, detail: "Duplicate titles make results hard to tell apart.", measured: `${count} pages share the title` });
  }

  const inkContrast = contrastRatio(site.theme.ink, site.theme.paper);
  if (inkContrast !== null) {
    issues.push({
      id: "a11y-contrast-ink",
      area: "Accessibility",
      level: inkContrast >= 4.5 ? "pass" : inkContrast >= 3 ? "warn" : "fail",
      title: `Body text contrast is ${inkContrast.toFixed(2)}:1`,
      detail: inkContrast >= 4.5 ? "Meets the 4.5:1 ratio for body text." : "Body text needs 4.5:1 against its background.",
      measured: `WCAG 2.1 relative luminance of ${site.theme.ink} against ${site.theme.paper}`,
    });
  }
  const accentContrast = contrastRatio("#ffffff", site.theme.accent);
  if (accentContrast !== null) {
    issues.push({
      id: "a11y-contrast-accent",
      area: "Accessibility",
      level: accentContrast >= 4.5 ? "pass" : accentContrast >= 3 ? "warn" : "fail",
      title: `White on the accent colour is ${accentContrast.toFixed(2)}:1`,
      detail: "The hero block puts white text on the accent colour.",
      measured: `WCAG 2.1 relative luminance of #ffffff against ${site.theme.accent}`,
    });
  }

  const bytes = exportBytes(site);
  const blocks = site.pages.reduce((sum, page) => sum + page.blocks.length, 0);
  issues.push({
    id: "perf-bytes",
    area: "Performance",
    level: bytes > 400_000 ? "warn" : "pass",
    title: `The export is ${(bytes / 1024).toFixed(1)} kB of HTML`,
    detail: "Measured by generating every page and counting the encoded bytes.",
    measured: `${bytes} bytes across ${site.pages.length} ${site.pages.length === 1 ? "page" : "pages"}`,
  });
  issues.push({
    id: "perf-blocks",
    area: "Performance",
    level: blocks > 40 ? "warn" : "pass",
    title: `${blocks} blocks across ${site.pages.length} ${site.pages.length === 1 ? "page" : "pages"}`,
    detail: "Block count is the structural weight of the document.",
    measured: `${blocks} blocks`,
  });
  const figures = site.pages.flatMap((page) => page.blocks).filter((block) => block.type === "image" || block.type === "gallery").length;
  issues.push({
    id: "perf-media",
    area: "Performance",
    level: "warn",
    title: `${figures} figure blocks have no measured file size`,
    detail: "Images are placeholders in this workspace, so transfer size cannot be measured. No speed score is invented.",
    measured: "no asset pipeline connected",
  });

  const pagePaths = new Set(site.pages.map((page) => page.path));
  for (const link of [...site.nav.header, ...site.nav.footer, ...site.nav.header.flatMap((item) => item.children)]) {
    if (link.kind !== "page") continue;
    issues.push(pagePaths.has(link.target)
      ? { id: `links-nav-${link.id}`, area: "Links", level: "pass", title: `Menu link "${link.label}" resolves`, detail: `${link.target} is a page in this site.`, measured: "target matched against page paths" }
      : { id: `links-nav-${link.id}`, area: "Links", level: "fail", title: `Menu link "${link.label}" points at ${link.target || "nothing"}`, detail: "No page in this site answers that address.", measured: "target matched against page paths" });
  }
  for (const redirect of site.nav.redirects) {
    const loop = redirect.from === redirect.to;
    const chained = site.nav.redirects.some((other) => other.id !== redirect.id && other.from === redirect.to);
    if (loop || chained) {
      issues.push({ id: `links-redirect-${redirect.id}`, area: "Links", level: loop ? "fail" : "warn", title: `Redirect ${redirect.from} → ${redirect.to} ${loop ? "points at itself" : "chains into another redirect"}`, detail: loop ? "A redirect to its own address never resolves." : "Chained redirects cost an extra round trip and lose link value.", measured: "redirect table scanned for loops and chains" });
    }
  }
  issues.push(site.seo.sitemap
    ? { id: "seo-sitemap", area: "SEO", level: "pass", title: "A sitemap is generated on export", detail: `${site.pages.filter((page) => !page.seo.noindex).length} ${site.pages.filter((page) => !page.seo.noindex).length === 1 ? "page" : "pages"} would be listed.`, measured: "sitemap flag and page index settings" }
    : { id: "seo-sitemap", area: "SEO", level: "warn", title: "No sitemap is generated", detail: "Without one, discovery depends entirely on internal links.", measured: "sitemap flag is off", fix: { label: "Turn the sitemap on", kind: "sitemap" } });

  return issues;
}

export function issueCounts(issues: Issue[]): { fail: number; warn: number; pass: number } {
  return {
    fail: issues.filter((issue) => issue.level === "fail").length,
    warn: issues.filter((issue) => issue.level === "warn").length,
    pass: issues.filter((issue) => issue.level === "pass").length,
  };
}

/** Deployment state is never read as live unless a health check recorded it. */
export function liveState(record: Rec, site: SiteModel): { label: string; tone: "success" | "warning" | "neutral" | "danger"; detail: string } {
  const last = [...site.deployments].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))[0];
  const verified = site.domains.some((domain) => domain.verified);
  if (!last) return { label: "Never published", tone: "neutral", detail: "No deployment has been attempted from this workspace." };
  if (last.state === "rolled_back") return { label: "Rolled back", tone: "warning", detail: `${last.note || "The previous export was restored."}` };
  if (last.state === "blocked") return { label: "Not published", tone: "warning", detail: "Publishing stopped at the hosting boundary. The export is available instead." };
  if (!verified) return { label: "Exported, host unknown", tone: "warning", detail: "An export exists but no domain has been verified, so the state of a live site cannot be known from here." };
  return { label: "Exported", tone: "success", detail: `${record.title} was exported with ${last.pages} pages.` };
}
