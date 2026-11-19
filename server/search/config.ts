/**
 * Server-only release gate. Configuration is necessary but not proof of
 * accessible data: authenticated company membership and per-record grants
 * are still evaluated for each actual search request.
 */
export function connectedSearchConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.ARLOVI_SEARCH_REMOTE_ENABLED !== "true") return false;
  const configuredKey = (value?: string) => Boolean(value && /^[a-z0-9][a-z0-9_-]{1,95}$/i.test(value));
  let originValid = false;
  let authorityValid = false;
  try {
    const origin = new URL(env.ARLOVI_APP_ORIGIN ?? "");
    originValid = origin.protocol === "https:" && !origin.username && !origin.password
      && origin.pathname === "/" && !origin.search && !origin.hash;
    const authority = new URL(env.ARLOVI_SEARCH_AUTHORITY_URL ?? "");
    authorityValid = authority.protocol === "https:" && !authority.username && !authority.password
      && !authority.search && !authority.hash;
  } catch { return false; }
  return originValid && authorityValid
    && Boolean(env.NANGO_SECRET_KEY && env.NANGO_SECRET_KEY.length >= 12)
    && Boolean(env.ARLOVI_SEARCH_AUTHORITY_TOKEN && env.ARLOVI_SEARCH_AUTHORITY_TOKEN.length >= 20)
    && configuredKey(env.ARLOVI_SEARCH_NANGO_DOCUMENT_INTEGRATION)
    && configuredKey(env.ARLOVI_SEARCH_NANGO_DOCUMENT_MODEL);
}
