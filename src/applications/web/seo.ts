import type { Page, SiteModel } from "./model";

/* ====================================================================== *
 * Field-level SEO validation for the editor. auditSite reports on the
 * whole site after the fact; these rules answer "is what I am typing
 * acceptable?" for one field at a time, with limits stated as numbers.
 * ====================================================================== */

export const TITLE_MAX = 60;
export const DESCRIPTION_MIN = 50;
export const DESCRIPTION_MAX = 160;

export interface SeoDraft { pageId: string; title: string; description: string; path: string; noindex: boolean }

export interface FieldMessage { field: "title" | "description" | "path"; level: "error" | "warning"; message: string }

const PATH = /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$/;

export function seoMessages(draft: SeoDraft, site: SiteModel): FieldMessage[] {
  const messages: FieldMessage[] = [];
  const title = draft.title.trim();
  const description = draft.description.trim();
  const path = draft.path.trim();
  const others = site.pages.filter((page) => page.id !== draft.pageId);

  if (!title) messages.push({ field: "title", level: "error", message: "A page title is required." });
  else if (title.length > TITLE_MAX) messages.push({ field: "title", level: "warning", message: `${title.length} characters; results usually cut titles after ${TITLE_MAX}.` });
  if (title && others.some((page) => page.seo.title.trim().toLowerCase() === title.toLowerCase())) {
    messages.push({ field: "title", level: "warning", message: "Another page has the same title, so the two are hard to tell apart in results." });
  }

  if (!description) messages.push({ field: "description", level: draft.noindex ? "warning" : "error", message: "A meta description is required for an indexed page." });
  else if (description.length < DESCRIPTION_MIN) messages.push({ field: "description", level: "warning", message: `${description.length} characters; aim for at least ${DESCRIPTION_MIN}.` });
  else if (description.length > DESCRIPTION_MAX) messages.push({ field: "description", level: "warning", message: `${description.length} characters; results usually cut descriptions after ${DESCRIPTION_MAX}.` });

  if (!PATH.test(path)) messages.push({ field: "path", level: "error", message: "Use a path like /about or /services/lighting: lower case letters, digits and single hyphens." });
  else if (others.some((page) => page.path === path)) messages.push({ field: "path", level: "error", message: `${path} is already used by another page.` });
  return messages;
}

export function hasErrors(messages: FieldMessage[]): boolean {
  return messages.some((message) => message.level === "error");
}

export function draftFor(page: Page): SeoDraft {
  return { pageId: page.id, title: page.seo.title, description: page.seo.description, path: page.path, noindex: page.seo.noindex };
}

export function applyDraft(site: SiteModel, draft: SeoDraft): SiteModel {
  return {
    ...site,
    pages: site.pages.map((page) => (page.id === draft.pageId
      ? { ...page, path: draft.path.trim(), seo: { ...page.seo, title: draft.title.trim(), description: draft.description.trim(), noindex: draft.noindex } }
      : page)),
  };
}

/** How a result would look, truncated the way the limits above describe. */
export function snippet(draft: SeoDraft, host: string): { title: string; url: string; description: string } {
  const cut = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);
  return {
    title: cut(draft.title.trim() || "Untitled page", TITLE_MAX),
    url: `${host}${draft.path === "/" ? "" : draft.path}`,
    description: cut(draft.description.trim() || "No description: a search engine would pick text from the page.", DESCRIPTION_MAX),
  };
}
