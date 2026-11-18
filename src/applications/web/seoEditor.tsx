import { useState } from "react";
import { Button, Card, Checkbox, Field, Pill, Row, Select, Stack, TextArea, TextInput } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import type { Rec } from "@/domain/types";
import { DESCRIPTION_MAX, TITLE_MAX, applyDraft, draftFor, hasErrors, seoMessages, snippet, type FieldMessage, type SeoDraft } from "./seo";
import type { SiteModel } from "./model";
import { saveSite } from "./state";

function messagesFor(messages: FieldMessage[], field: FieldMessage["field"]): { error?: string; hint?: string } {
  const own = messages.filter((message) => message.field === field);
  const error = own.find((message) => message.level === "error")?.message;
  const warning = own.filter((message) => message.level === "warning").map((message) => message.message).join(" ");
  return { error, hint: warning || undefined };
}

/** Per-page SEO fields with validation as you type and a result preview. */
export function SeoFieldsEditor({ context, record, site }: { context: ScreenContext; record: Rec; site: SiteModel }) {
  const [pageId, setPageId] = useState(site.pages[0]?.id ?? "");
  const page = site.pages.find((item) => item.id === pageId) ?? site.pages[0];
  if (!page) return null;
  return <PageSeoForm key={`${page.id}-${record.revision}`} context={context} record={record} site={site} initial={draftFor(page)} onPage={setPageId} />;
}

function PageSeoForm({ context, record, site, initial, onPage }: { context: ScreenContext; record: Rec; site: SiteModel; initial: SeoDraft; onPage: (id: string) => void }) {
  const [draft, setDraft] = useState(initial);
  const messages = seoMessages(draft, site);
  const title = messagesFor(messages, "title");
  const description = messagesFor(messages, "description");
  const path = messagesFor(messages, "path");
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const host = site.domains.find((domain) => domain.primary)?.host ?? site.domains[0]?.host ?? "your-domain";
  const preview = snippet(draft, host);

  return (
    <Card eyebrow="SEO FIELDS" prov="human" title="Page title, description and address"
      subtitle="Checked as you type. Saving with an error is not possible."
      actions={<Pill tone={hasErrors(messages) ? "danger" : messages.length ? "warning" : "success"}>{hasErrors(messages) ? "Has errors" : messages.length ? `${messages.length} to review` : "Valid"}</Pill>}>
      <div className="web-seo-grid">
        <Stack gap={3}>
          <Field label="Page">
            <Select value={draft.pageId} onChange={(event) => onPage(event.target.value)}>
              {site.pages.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.path})</option>)}
            </Select>
          </Field>
          <Field label={`Page title (${draft.title.trim().length}/${TITLE_MAX})`} required error={title.error} hint={title.hint}>
            <TextInput value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
          </Field>
          <Field label={`Meta description (${draft.description.trim().length}/${DESCRIPTION_MAX})`} error={description.error} hint={description.hint}>
            <TextArea rows={3} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
          </Field>
          <Field label="Address" required error={path.error} hint={path.hint}>
            <TextInput value={draft.path} onChange={(event) => setDraft({ ...draft, path: event.target.value })} />
          </Field>
          <Checkbox label="Ask search engines not to index this page" checked={draft.noindex} onChange={(event) => setDraft({ ...draft, noindex: event.target.checked })} />
          <Row gap={2} wrap>
            <Button variant="primary" disabled={!dirty || hasErrors(messages)} onClick={() => void saveSite(context, record, applyDraft(site, draft), `SEO fields of ${site.pages.find((item) => item.id === draft.pageId)?.name ?? "a page"} updated`)
              .then(() => context.toast("SEO fields saved", "The export and the audit use the new values."))}>Save SEO fields</Button>
            {dirty && <Button variant="ghost" onClick={() => setDraft(initial)}>Discard</Button>}
          </Row>
        </Stack>
        <div className="web-serp" aria-label="Search result preview">
          <span className="ds-subtle">How a result would read</span>
          <span className="web-serp-url">{preview.url}</span>
          <strong className="web-serp-title">{preview.title}</strong>
          <span className="web-serp-desc">{preview.description}</span>
          {draft.noindex && <Pill tone="warning">Not indexed: this page asks to be left out of results</Pill>}
        </div>
      </div>
    </Card>
  );
}
