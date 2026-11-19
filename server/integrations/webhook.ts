import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** Nango sends X-Nango-Hmac-Sha256 as lowercase hex HMAC of the raw payload.
 * Never accept the older X-Nango-Signature digest (not HMAC).
 * https://github.com/NangoHQ/nango/blob/master/packages/webhooks/lib/utils.ts
 */
export function verifyNangoWebhook(body: Buffer, signature: unknown, signingKey: string | undefined): boolean {
  if (!signingKey || typeof signature !== "string" || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const supplied = Buffer.from(signature, "hex");
  const expected = createHmac("sha256", signingKey).update(body).digest();
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

/** Content hash can be passed as a stable idempotency hint to the durable event
 * ledger. The ledger must still account for provider-specific event IDs. */
export function eventDigest(raw: Buffer): string {
  return createHash("sha256").update(raw).digest("hex");
}
