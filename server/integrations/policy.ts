/**
 * Arlovi's deterministic integration tool access gate.
 *
 * Invoke with server-verified identity and trusted database records immediately
 * BEFORE any Nango proxy/action/sync invocation. The browser's role labels,
 * Nango account existence, and an AI agent's instructions never count as a
 * grant. No actual remote execution endpoint is exposed by this module.
 */
export type IntegrationOperationKind = "read" | "write" | "financial" | "destructive";
export type IntegrationPrincipalType = "user" | "application" | "agent" | "department";

export interface IntegrationPrincipal {
  organizationId: string;
  type: IntegrationPrincipalType;
  id: string;
  /** For an authenticated user or supervised employee action. */
  humanUserId?: string;
}

export interface ConnectionPolicyRecord {
  id: string;
  organizationId: string;
  providerConfigKey: string;
  status: "pending" | "authorised" | "needs_attention" | "suspended" | "disconnected";
  activation: "inactive" | "read_only" | "approved_writes";
  readVerifiedAt?: string | null;
  ownership: "personal" | "organization" | "department";
  ownerUserId: string;
}

export interface IntegrationGrant {
  organizationId: string;
  connectionId: string;
  principalType: IntegrationPrincipalType;
  principalId: string;
  canRead: boolean;
  canWrite: boolean;
  requiresHumanApproval: boolean;
}

export interface IntegrationOperation {
  name: string;
  kind: IntegrationOperationKind;
  /** Integer minor units, e.g. cents; required for amount-limited approvals. */
  amountMinor?: number;
}

export interface HumanApproval {
  organizationId: string;
  connectionId: string;
  operationName: string;
  principalId: string;
  state: "approved" | "pending" | "rejected" | "revoked";
  expiresAt: string;
  amountLimitMinor?: number;
  approvedByUserId: string;
}

export type IntegrationDecision =
  | { allowed: true; code: "permitted"; requiresApproval: false }
  | { allowed: false; code:
      "wrong_organisation" | "account_not_active" | "read_not_verified" |
      "inactive_connection" | "personal_account" | "grant_required" |
      "write_not_enabled" | "approval_required";
    requiresApproval: boolean };

const deny = (code: Exclude<IntegrationDecision, { allowed: true }>["code"],
  requiresApproval = false): IntegrationDecision => ({ allowed: false, code, requiresApproval });

function validApproval(
  approval: HumanApproval | undefined,
  principal: IntegrationPrincipal,
  connection: ConnectionPolicyRecord,
  operation: IntegrationOperation,
  now: number,
): boolean {
  // Financial operations cannot be approved with an unbounded amount, and
  // neither negative nor fractional monetary values can bypass a limit.
  if (operation.kind === "financial" &&
      (operation.amountMinor === undefined ||
       !Number.isSafeInteger(operation.amountMinor) || operation.amountMinor < 0 ||
       approval?.amountLimitMinor === undefined)) return false;
  if (!approval || approval.state !== "approved" ||
      approval.organizationId !== connection.organizationId ||
      approval.connectionId !== connection.id ||
      approval.operationName !== operation.name ||
      approval.principalId !== principal.id ||
      !approval.approvedByUserId ||
      !Number.isFinite(Date.parse(approval.expiresAt)) ||
      Date.parse(approval.expiresAt) <= now) return false;
  if (approval.amountLimitMinor !== undefined) {
    if (!Number.isSafeInteger(approval.amountLimitMinor) || approval.amountLimitMinor < 0 ||
        operation.amountMinor === undefined || !Number.isSafeInteger(operation.amountMinor) ||
        operation.amountMinor < 0 || operation.amountMinor > approval.amountLimitMinor) return false;
  }
  return true;
}

export function decideIntegrationOperation(args: {
  principal: IntegrationPrincipal;
  connection: ConnectionPolicyRecord;
  operation: IntegrationOperation;
  grants: readonly IntegrationGrant[];
  approval?: HumanApproval;
  now?: number;
}): IntegrationDecision {
  const { principal, connection, operation, grants, approval } = args;
  if (!principal.id || principal.organizationId !== connection.organizationId) {
    return deny("wrong_organisation");
  }
  if (connection.status !== "authorised") return deny("account_not_active");
  if (connection.activation === "inactive") return deny("inactive_connection");
  if (!connection.readVerifiedAt || !Number.isFinite(Date.parse(connection.readVerifiedAt))) {
    return deny("read_not_verified");
  }
  // Authorisation to administer a company's integrations never exposes a
  // colleague's personal Google/email account for arbitrary operation.
  if (connection.ownership === "personal" && connection.ownerUserId !== principal.humanUserId) {
    return deny("personal_account");
  }
  const grant = grants.find(item =>
    item.organizationId === connection.organizationId &&
    item.connectionId === connection.id &&
    item.principalType === principal.type &&
    item.principalId === principal.id);
  if (!grant || !grant.canRead) return deny("grant_required");
  if (operation.kind === "read") return { allowed: true, code: "permitted", requiresApproval: false };
  if (connection.activation !== "approved_writes" || !grant.canWrite) {
    return deny("write_not_enabled");
  }
  const highImpact = operation.kind === "financial" || operation.kind === "destructive";
  const approvalRequired = highImpact || principal.type === "agent" || grant.requiresHumanApproval;
  if (approvalRequired && !validApproval(approval, principal, connection, operation, args.now ?? Date.now())) {
    return deny("approval_required", true);
  }
  return { allowed: true, code: "permitted", requiresApproval: false };
}
