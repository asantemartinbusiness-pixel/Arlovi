/** Arlovi frontend domain contract sketch; adapt into validated production types. */
export type EntityId = string;
export type OrganizationId = string;
export type ActorKind = 'human' | 'ai_agent' | 'local_system';
export type OperationState =
  | 'draft' | 'awaiting_approval' | 'queued_local' | 'running_local'
  | 'waiting_external' | 'verifying' | 'verified_local'
  | 'verified_external' | 'partial' | 'blocked' | 'failed' | 'cancelled';
export type CapabilityState = 'not_connected' | 'configuration_required'
  | 'ready_local' | 'queued_local' | 'awaiting_external_confirmation'
  | 'verified_external' | 'blocked' | 'failed';
export interface OwnedEntity {
  id: EntityId;
  organizationId: OrganizationId;
  createdAt: string;
  updatedAt: string;
  revision: number;
  source?: string;
}
export interface DomainEvent<T = unknown> {
  id: EntityId;
  organizationId: OrganizationId;
  type: string;
  actor: {kind: ActorKind; id: EntityId};
  entityId: EntityId;
  occurredAt: string;
  correlationId: string;
  payload: T;
  version: number;
}
export interface ServiceResult<T> {
  status: CapabilityState;
  explanation: string;
  localRecordId?: EntityId;
  data?: T;
  evidence?: { source: string; timestamp: string; receiptId?: EntityId };
}
export interface ScreenContract {
  id: string;
  route: string;
  title: string;
  applicationCode: string;
  tabNames: string[];
  actionLabels: string[];
  overlayNames: string[];
  aiDescription: string;
}
export interface CapabilityPort<TIn, TOut> {
  name: string;
  state(): CapabilityState;
  validate(input: TIn): Promise<{ok: boolean; reasons: string[]}>;
  execute(input: TIn): Promise<ServiceResult<TOut>>;
}
// This file is a contract starting point, not an implemented service.
