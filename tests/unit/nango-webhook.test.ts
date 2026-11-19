import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eventDigest, verifyNangoWebhook } from "../../server/integrations/webhook";

describe("Nango signed webhook verification", () => {
  const key = "test-webhook-signing-key";
  const body = Buffer.from('{"type":"auth","connectionId":"c_123"}', "utf8");
  const signature = createHmac("sha256", key).update(body).digest("hex");

  it("verifies the unmodified raw request bytes with an HMAC", () => {
    expect(verifyNangoWebhook(body, signature, key)).toBe(true);
  });

  it("rejects tampered events and signatures", () => {
    expect(verifyNangoWebhook(Buffer.from('{"type":"auth","connectionId":"other"}'), signature, key)).toBe(false);
    expect(verifyNangoWebhook(body, "00".repeat(32), key)).toBe(false);
    expect(verifyNangoWebhook(body, "sha256=" + signature, key)).toBe(false);
    expect(verifyNangoWebhook(body, "not-a-signature", key)).toBe(false);
  });

  it("fails closed without the environment signing key", () => {
    expect(verifyNangoWebhook(body, signature, undefined)).toBe(false);
  });

  it("provides a deterministic idempotency hint without exposing credentials", () => {
    expect(eventDigest(body)).toMatch(/^[0-9a-f]{64}$/);
    expect(eventDigest(body)).toBe(eventDigest(Buffer.from(body)));
    expect(eventDigest(body)).not.toBe(eventDigest(Buffer.from("other")));
  });
});
