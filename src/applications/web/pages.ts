import { wallMs } from "@/platform/clock";
import { makeBlock, makePage, type NavLink, type Page, type SiteModel } from "./model";

/* ====================================================================== *
 * Page management for the website editor. Every operation is a pure
 * function from one site model to the next, so the builder can show what
 * a change would do (links rewritten, redirects added, links removed)
 * before it is saved through saveSite with its undo entry.
 * ====================================================================== */

export const PAGE_PATH = /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$/;

/** A path from a page name: "Opening hours" → "/opening-hours". */
export function slugPath(name: string): string {
  const slug = name.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug ? `/${slug}` : "/";
}

/** Why a name and path cannot be used for a page, or undefined when they can. */
export function pageProblem(site: SiteModel, name: string, path: string, exceptId = ""): string | undefined {
  if (!name.trim()) return "Give the page a name.";
  if (name.trim().length > 60) return "Keep the page name to 60 characters.";
  if (!PAGE_PATH.test(path.trim())) return "Use an address like /about or /services/lighting: lower case letters, digits and single hyphens.";
  if (site.pages.some((page) => page.id !== exceptId && page.path === path.trim())) return `${path.trim()} is already used by another page.`;
  return undefined;
}

/** A free path based on `base`: /about, /about-2, /about-3 … */
export function freePath(site: SiteModel, base: string): string {
  const taken = new Set(site.pages.map((page) => page.path));
  if (!taken.has(base)) return base;
  const stem = base === "/" ? "/page" : base;
  for (let n = 2; n < 1000; n += 1) if (!taken.has(`${stem}-${n}`)) return `${stem}-${n}`;
  return `${stem}-${wallMs().toString(36)}`;
}

function mapLinks(links: NavLink[], fn: (link: NavLink) => NavLink | null): NavLink[] {
  return links.flatMap((link) => {
    const next = fn(link);
    return next ? [{ ...next, children: mapLinks(next.children, fn) }] : [];
  });
}

function countLinks(links: NavLink[], path: string): number {
  return links.reduce((sum, link) => sum + (link.kind === "page" && link.target === path ? 1 : 0) + countLinks(link.children, path), 0);
}

/** Menu links and call-to-action buttons that point at a path. */
export function inboundReferences(site: SiteModel, path: string): { menu: number; buttons: number } {
  return {
    menu: countLinks(site.nav.header, path) + countLinks(site.nav.footer, path),
    buttons: site.pages.flatMap((page) => page.blocks).filter((block) => block.props.ctaTarget === path).length,
  };
}

export interface PageChange { site: SiteModel; notes: string[]; pageId: string }

export function addPage(site: SiteModel, name: string, path: string, options: { addToMenu: boolean }): PageChange {
  const problem = pageProblem(site, name, path);
  if (problem) throw new Error(problem);
  const page = makePage(name.trim(), path.trim());
  const notes = [`${page.name} added at ${page.path} as a draft.`];
  let header = site.nav.header;
  if (options.addToMenu) {
    header = [...header, { id: `nav-${page.id}`, label: page.name, target: page.path, kind: "page", children: [] }];
    notes.push("A header menu link was added.");
  }
  return { site: { ...site, pages: [...site.pages, page], nav: { ...site.nav, header } }, notes, pageId: page.id };
}

/**
 * Rename a page and optionally move it. Moving rewrites every menu link and
 * button that pointed at the old address and keeps the old address working
 * with a 301 redirect, so nothing that linked to it breaks.
 */
export function updatePage(site: SiteModel, pageId: string, patch: { name: string; path: string; status: Page["status"] }): PageChange {
  const page = site.pages.find((item) => item.id === pageId);
  if (!page) throw new Error("That page is no longer in this site.");
  const problem = pageProblem(site, patch.name, patch.path, pageId);
  if (problem) throw new Error(problem);
  const name = patch.name.trim();
  const path = patch.path.trim();
  const notes: string[] = [];
  if (name !== page.name) notes.push(`Renamed ${page.name} to ${name}.`);
  if (patch.status !== page.status) notes.push(`Marked ${patch.status === "published" ? "ready to publish" : "as a draft"}.`);

  let next: SiteModel = {
    ...site,
    pages: site.pages.map((item) => (item.id === pageId
      ? { ...item, name, path, status: patch.status, seo: { ...item.seo, title: item.seo.title === item.name ? name : item.seo.title } }
      : item)),
  };

  if (path !== page.path) {
    const refs = inboundReferences(site, page.path);
    const retarget = (link: NavLink) => (link.kind === "page" && link.target === page.path ? { ...link, target: path, label: link.label === page.name ? name : link.label } : link);
    next = {
      ...next,
      pages: next.pages.map((item) => ({
        ...item,
        blocks: item.blocks.map((block) => (block.props.ctaTarget === page.path ? { ...block, props: { ...block.props, ctaTarget: path } } : block)),
      })),
      nav: {
        header: mapLinks(next.nav.header, retarget),
        footer: mapLinks(next.nav.footer, retarget),
        // A redirect from the new address would now shadow the page; redirects into the old address follow it.
        redirects: [
          ...next.nav.redirects
            .filter((redirect) => redirect.from !== path && redirect.from !== page.path)
            .map((redirect) => (redirect.to === page.path ? { ...redirect, to: path } : redirect)),
          { id: `r-${pageId}-${path.replace(/\W+/g, "")}`, from: page.path, to: path, code: 301 as const },
        ],
      },
    };
    notes.push(`Moved from ${page.path} to ${path}; a 301 redirect keeps the old address working.`);
    if (refs.menu + refs.buttons > 0) notes.push(`${refs.menu} menu ${refs.menu === 1 ? "link" : "links"} and ${refs.buttons} ${refs.buttons === 1 ? "button" : "buttons"} now point at ${path}.`);
  } else if (name !== page.name) {
    const relabel = (link: NavLink) => (link.kind === "page" && link.target === path && link.label === page.name ? { ...link, label: name } : link);
    next = { ...next, nav: { ...next.nav, header: mapLinks(next.nav.header, relabel), footer: mapLinks(next.nav.footer, relabel) } };
  }
  return { site: next, notes: notes.length ? notes : ["Nothing changed."], pageId };
}

/** A draft copy with fresh block ids at a free address. */
export function duplicatePage(site: SiteModel, pageId: string): PageChange {
  const page = site.pages.find((item) => item.id === pageId);
  if (!page) throw new Error("That page is no longer in this site.");
  const copy = makePage(`${page.name} copy`, freePath(site, page.path === "/" ? "/home-copy" : `${page.path}-copy`));
  const blocks = page.blocks.map((block) => ({ ...makeBlock(block.type), props: { ...block.props, items: [...block.props.items], plans: block.props.plans.map((plan) => ({ ...plan })) } }));
  const created: Page = { ...copy, blocks, seo: { ...page.seo, title: `${page.seo.title} copy`, noindex: true } };
  const index = site.pages.findIndex((item) => item.id === pageId);
  const pages = [...site.pages];
  pages.splice(index + 1, 0, created);
  return { site: { ...site, pages }, notes: [`${created.name} created at ${created.path} as a hidden draft (noindex), not in any menu.`], pageId: created.id };
}

/**
 * Delete a page. The last page cannot be deleted. Menu links to it are
 * removed; buttons that pointed at it are listed so they can be fixed, and
 * the old address can be redirected rather than left to fail.
 */
export function deletePage(site: SiteModel, pageId: string, options: { redirectTo: string }): PageChange {
  const page = site.pages.find((item) => item.id === pageId);
  if (!page) throw new Error("That page is no longer in this site.");
  if (site.pages.length <= 1) throw new Error("A site keeps at least one page.");
  const remaining = site.pages.filter((item) => item.id !== pageId);
  if (options.redirectTo && !remaining.some((item) => item.path === options.redirectTo)) throw new Error("Redirect to a page that stays in the site.");
  const refs = inboundReferences(site, page.path);
  const drop = (link: NavLink) => (link.kind === "page" && link.target === page.path ? null : link);
  const redirects = site.nav.redirects.filter((redirect) => redirect.from !== page.path && redirect.to !== page.path);
  if (options.redirectTo) redirects.push({ id: `r-${pageId}-gone`, from: page.path, to: options.redirectTo, code: 301 });
  const pages = remaining.map((item) => ({
    ...item,
    blocks: item.blocks.map((block) => (options.redirectTo && block.props.ctaTarget === page.path ? { ...block, props: { ...block.props, ctaTarget: options.redirectTo } } : block)),
  }));
  const notes = [`${page.name} (${page.path}) deleted.`];
  if (refs.menu) notes.push(`${refs.menu} menu ${refs.menu === 1 ? "link was" : "links were"} removed.`);
  if (options.redirectTo) notes.push(`${page.path} now redirects to ${options.redirectTo}${refs.buttons ? `, and ${refs.buttons} ${refs.buttons === 1 ? "button follows" : "buttons follow"} it` : ""}.`);
  else if (refs.buttons) notes.push(`${refs.buttons} ${refs.buttons === 1 ? "button still points" : "buttons still point"} at ${page.path}; the quality report lists ${refs.buttons === 1 ? "it" : "them"}.`);
  return {
    site: { ...site, pages, nav: { header: mapLinks(site.nav.header, drop), footer: mapLinks(site.nav.footer, drop), redirects } },
    notes,
    pageId: pages[Math.max(0, site.pages.findIndex((item) => item.id === pageId) - 1)]?.id ?? pages[0].id,
  };
}

/** Move a page up or down in the page list (the order used by the sitemap and the editor). */
export function movePage(site: SiteModel, pageId: string, offset: -1 | 1): SiteModel {
  const from = site.pages.findIndex((item) => item.id === pageId);
  const to = from + offset;
  if (from < 0 || to < 0 || to >= site.pages.length) return site;
  const pages = [...site.pages];
  const [page] = pages.splice(from, 1);
  pages.splice(to, 0, page);
  return { ...site, pages };
}
