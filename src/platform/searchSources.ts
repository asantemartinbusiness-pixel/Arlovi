/**
 * Arlovi Search 2.3: catalogue discovery is NOT connected-data search.
 * This is public metadata about integration capabilities. It cannot return
 * third-party records, provider tokens, mailbox contents or remote snippets.
 *
 * The authoritative provider auth and tenant ACL service does not exist on
 * main yet. Native integration records remain not_connected until that
 * service, grant verification, and server-side indexing are implemented.
 */
import { PROVIDER_CAPABILITIES, CAPABILITY_LABELS } from "@/platform/capability";
import type { SearchHit } from "@/platform/searchModel";

export const LOCAL_SEARCH_SOURCE = "Arlovi workspace";
export const INTEGRATION_CATALOG_SOURCE = "Integration catalogue";

export function integrationSearchHits(orgSlug: string): SearchHit[] {
  const marketplace = `/o/${encodeURIComponent(orgSlug)}/connect/marketplace`;
  return PROVIDER_CAPABILITIES.map(item => ({
    key: `integration-${item.id}`,
    kind: "connector",
    group: "Integration catalogue",
    title: item.label,
    detail: `${item.provider} · ${CAPABILITY_LABELS[item.state]}`,
    to: `${marketplace}?q=${encodeURIComponent(item.label)}`,
    appCode: "CONNECT",
    recordId: undefined,
    collection: undefined,
    sourceName: INTEGRATION_CATALOG_SOURCE,
    sourceType: "catalogue",
    sourceState: item.state,
    keywords: [item.id, item.provider, item.label, "integration", "connect", "setup"].join(" "),
    summary: item.note,
    previewFields: [
      { label: "Source", value: INTEGRATION_CATALOG_SOURCE },
      { label: "Availability", value: CAPABILITY_LABELS[item.state] },
      { label: "Local alternative", value: item.localEquivalent },
    ],
  }));
}

/** No record can become a remote hit solely because a local connector says "ready". */
export function isVerifiedRemoteSearchResult(hit: SearchHit): boolean {
  return hit.sourceType === "remote"
    && hit.sourceState === "verified_external"
    && typeof hit.sourceName === "string"
    && hit.sourceName.length > 0;
}
