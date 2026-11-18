import type { NavLink, SiteModel } from "./model";

/* ====================================================================== *
 * Menu tree editing. The header menu allows one level of nesting (a link
 * with a submenu); the exported HTML and the link audit already read
 * `children`. These helpers keep that tree consistent.
 * ====================================================================== */

export function findLink(links: NavLink[], id: string): { link: NavLink; parentId: string } | undefined {
  for (const link of links) {
    if (link.id === id) return { link, parentId: "" };
    const child = link.children.find((item) => item.id === id);
    if (child) return { link: child, parentId: link.id };
  }
  return undefined;
}

export function removeLink(links: NavLink[], id: string): NavLink[] {
  return links.filter((link) => link.id !== id).map((link) => ({ ...link, children: link.children.filter((child) => child.id !== id) }));
}

/**
 * Insert or replace a link at the top level or under a parent. A link that
 * has its own submenu stays at the top level, so the tree never goes deeper
 * than one level. An edited link keeps its position when its parent does not change.
 */
export function placeLink(links: NavLink[], link: NavLink, parentId: string): NavLink[] {
  const found = findLink(links, link.id);
  const parent = parentId && parentId !== link.id ? links.find((item) => item.id === parentId) : undefined;
  const target = link.children.length > 0 ? undefined : parent;
  if (found && found.parentId === (target?.id ?? "")) {
    return links.map((item) => (item.id === link.id ? link : { ...item, children: item.children.map((child) => (child.id === link.id ? { ...link, children: [] } : child)) }));
  }
  const without = removeLink(links, link.id);
  if (!target) return [...without, link];
  return without.map((item) => (item.id === target.id ? { ...item, children: [...item.children, { ...link, children: [] }] } : item));
}

/** Why a link target cannot be saved, or undefined. */
export function targetProblem(site: SiteModel, kind: NavLink["kind"], target: string): string | undefined {
  const value = target.trim();
  if (kind === "page") return site.pages.some((page) => page.path === value) ? undefined : "That address is not a page on this site.";
  if (kind === "anchor") return /^#[A-Za-z][\w-]*$/.test(value) ? undefined : "An anchor starts with # followed by a name, for example #pricing.";
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" || url.protocol === "mailto:" || url.protocol === "tel:"
      ? undefined : "Use an https, http, mailto or tel address.";
  } catch {
    return "Include the scheme, for example https://example.com.";
  }
}

/** Move a child within its parent's submenu. */
export function moveChild(links: NavLink[], parentId: string, childId: string, offset: -1 | 1): NavLink[] {
  return links.map((link) => {
    if (link.id !== parentId) return link;
    const from = link.children.findIndex((child) => child.id === childId);
    const to = from + offset;
    if (from < 0 || to < 0 || to >= link.children.length) return link;
    const children = [...link.children];
    const [child] = children.splice(from, 1);
    children.splice(to, 0, child);
    return { ...link, children };
  });
}
