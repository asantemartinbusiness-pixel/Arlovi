import { describe, expect, it } from "vitest";
import {
  decideIntegrationOperation, type ConnectionPolicyRecord,
  type IntegrationGrant, type IntegrationPrincipal, type HumanApproval,
} from "../../server/integrations/policy";

const now = Date.parse("2026-11-19T20:00:00Z");
const principal: IntegrationPrincipal = {
  organizationId: "org-one", id: "agent-2", type: "agent", humanUserId: "owner-1",
};
const connection: ConnectionPolicyRecord = {
  id: "connection-1", organizationId: "org-one", providerConfigKey: "stripe",
  status: "authorised", activation: "approved_writes",
  readVerifiedAt: "2026-11-19T19:59:00Z", ownership: "organization",
  ownerUserId: "owner-1",
};
const grant: IntegrationGrant = {
  organizationId: "org-one", connectionId: "connection-1",
  principalType: "agent", principalId: "agent-2",
  canRead: true, canWrite: true, requiresHumanApproval: true,
};
const approval: HumanApproval = {
  organizationId: "org-one", connectionId: "connection-1", operationName: "refund",
  principalId: "agent-2", state: "approved",
  expiresAt: "2026-11-19T20:15:00Z", approvedByUserId: "human-manager",
  amountLimitMinor: 10000,
};
const decide = (changes: Partial<Parameters<typeof decideIntegrationOperation>[0]> = {}) =>
  decideIntegrationOperation({
    connection, principal, grants: [grant],
    operation: { name: "refund", kind: "financial", amountMinor: 9000 },
    approval, now, ...changes,
  });

describe("Integration tool permissions and approvals", () => {
  it("blocks use across organisations even with an otherwise valid grant", () => {
    expect(decide({ principal: { ...principal, organizationId: "org-two" } })).toMatchObject({
      allowed: false, code: "wrong_organisation",
    });
  });

  it("does not run tools for unverified or suspended accounts", () => {
    expect(decide({ connection: { ...connection, readVerifiedAt: null } }).allowed).toBe(false);
    expect(decide({ connection: { ...connection, status: "suspended" } }).allowed).toBe(false);
    expect(decide({ connection: { ...connection, status: "needs_attention" } }).allowed).toBe(false);
  });

  it("denies agents and applications until their own grants exist", () => {
    expect(decide({ grants: [] })).toMatchObject({ allowed: false, code: "grant_required" });
    expect(decide({ grants: [{ ...grant, principalId: "another-agent" }] }).allowed).toBe(false);
  });

  it("permits only explicitly granted read operations on active accounts", () => {
    expect(decide({ operation: { name: "list_payments", kind: "read" }, approval: undefined })).toEqual({
      allowed: true, code: "permitted", requiresApproval: false,
    });
  });

  it("prevents writes when the owner has only enabled read-only mode", () => {
    expect(decide({ connection: { ...connection, activation: "read_only" } })).toMatchObject({
      allowed: false, code: "write_not_enabled",
    });
  });

  it("requires explicit human approval for any AI employee write", () => {
    expect(decide({ approval: undefined })).toMatchObject({
      allowed: false, code: "approval_required", requiresApproval: true,
    });
    expect(decide()).toMatchObject({ allowed: true });
  });

  it("enforces per-action expiry, principal and amount limits", () => {
    expect(decide({ approval: { ...approval, expiresAt: "2026-11-19T19:00:00Z" } }).allowed).toBe(false);
    expect(decide({ approval: { ...approval, principalId: "other-agent" } }).allowed).toBe(false);
    expect(decide({ operation: { name: "refund", kind: "financial", amountMinor: 11000 } }).allowed).toBe(false);
    expect(decide({ approval: { ...approval, state: "revoked" } }).allowed).toBe(false);
  });

  it("requires approval for financial writes even when regular user writes are allowed without it", () => {
    const user = { ...principal, type: "user" as const, id: "owner-1" };
    const userGrant = { ...grant, principalType: "user" as const, principalId: "owner-1", requiresHumanApproval: false };
    expect(decide({ principal: user, grants: [userGrant], approval: undefined,
      operation: { name: "update_contact", kind: "write" } }).allowed).toBe(true);
    expect(decide({ principal: user, grants: [userGrant], approval: undefined }).allowed).toBe(false);
  });

  it("does not grant access to a colleague's personal account", () => {
    const other = { ...principal, humanUserId: "another-user" };
    expect(decide({ principal: other, connection: { ...connection, ownership: "personal" } })).toMatchObject({
      allowed: false, code: "personal_account",
    });
  });
});
