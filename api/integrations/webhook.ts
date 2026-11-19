import type { Request, Response } from "../../server/integrations/shared";
import { json } from "../../server/integrations/shared";
import { eventDigest, verifyNangoWebhook } from "../../server/integrations/webhook";

export const config = { api: { bodyParser: false } };
const MAX_BYTES = 512 * 1024;

async function rawRequest(req: Request): Promise<Buffer> {
  // Never reconstruct the signed bytes by JSON.stringify(req.body).
  // Signature checks require the original byte stream.
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += bytes.length;
    if (length > MAX_BYTES) throw new Error("PAYLOAD_TOO_LARGE");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

/** Signed ingress only. Real processing belongs to a durable, authenticated
 * ingestion worker with authoritative company/connection lookup and dedupe.
 * Fail closed and let Nango retry if that worker is not available. */
export default async function handler(req: Request, res: Response) {
  if (req.method !== "POST") return json(res, 405, { error: "METHOD_NOT_ALLOWED" });
  const secret = process.env.NANGO_WEBHOOK_SIGNING_KEY;
  const sink = process.env.ARLOVI_EVENT_INGEST_URL;
  const token = process.env.ARLOVI_EVENT_INGEST_TOKEN;
  if (!secret || !sink || !token || !/^https:\/\//.test(sink)) {
    return json(res, 503, { error: "EVENT_INGEST_NOT_CONFIGURED" });
  }
  if (req.headers["x-nango-webhook-unverified"] === "true") {
    return json(res, 403, { error: "UNVERIFIED_PROVIDER_WEBHOOK" });
  }
  const header = req.headers["x-nango-hmac-sha256"];
  if (typeof header !== "string") return json(res, 401, { error: "SIGNATURE_REQUIRED" });
  if (Number(req.headers["content-length"] || "0") > MAX_BYTES) {
    return json(res, 413, { error: "PAYLOAD_TOO_LARGE" });
  }
  try {
    const raw = await rawRequest(req);
    if (!verifyNangoWebhook(raw, header, secret)) {
      return json(res, 401, { error: "INVALID_SIGNATURE" });
    }
    if (!raw.length) return json(res, 400, { error: "EMPTY_EVENT" });
    let parsed: unknown;
    try { parsed = JSON.parse(raw.toString("utf8")); }
    catch { return json(res, 400, { error: "INVALID_JSON" }); }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return json(res, 400, { error: "INVALID_EVENT" });
    }
    // The worker must verify the company and connection using its OWN
    // persistent registry before making any state change. Provider payload
    // tags are evidence, not an independent authorisation source.
    const destination = new URL(sink);
    if (destination.protocol !== "https:" || destination.username || destination.password) {
      return json(res, 503, { error: "EVENT_INGEST_NOT_CONFIGURED" });
    }
    const result = await fetch(destination.toString(), {
      method: "POST",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token,
        "X-Arlovi-Event-Key": eventDigest(raw),
        "X-Arlovi-Event-Source": "nango",
      },
      body: raw,
      signal: AbortSignal.timeout(9000),
    });
    if (!result.ok) return json(res, 503, { error: "EVENT_NOT_ACCEPTED" });
    return json(res, 202, { accepted: true });
  } catch (error) {
    if (error instanceof Error && error.message === "PAYLOAD_TOO_LARGE") {
      return json(res, 413, { error: "PAYLOAD_TOO_LARGE" });
    }
    return json(res, 503, { error: "EVENT_INGEST_UNAVAILABLE" });
  }
}
