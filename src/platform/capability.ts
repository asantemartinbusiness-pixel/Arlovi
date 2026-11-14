import type { CapabilityState } from "@/domain/types";

/**
 * Honest provider boundary. Nothing in this frontend performs a remote action;
 * surfaces say which state a capability is in rather than implying success.
 */

export interface ProviderCapability {
  id: string;
  label: string;
  provider: string;
  state: CapabilityState;
  localEquivalent: string;
  note: string;
}

export const PROVIDER_CAPABILITIES: ProviderCapability[] = [
  { id: "email.send", label: "Send email", provider: "Mail provider", state: "not_connected",
    localEquivalent: "The message is kept as a local draft with its recipients and body.",
    note: "No mail service is connected, so nothing has left this browser." },
  { id: "payment.capture", label: "Take a card payment", provider: "Payment processor", state: "not_connected",
    localEquivalent: "The order is held as awaiting payment with its full line detail.",
    note: "No processor is connected. No card data is collected or stored here." },
  { id: "bank.feed", label: "Bank feed", provider: "Open banking", state: "not_connected",
    localEquivalent: "Statement lines can be imported from CSV and reconciled locally.",
    note: "Balances shown are from posted local journals, not a live feed." },
  { id: "tax.file", label: "File a tax return", provider: "Tax authority", state: "not_connected",
    localEquivalent: "The return is prepared and the figures are computed from posted journals.",
    note: "Submission requires an authorised filing connection." },
  { id: "model.inference", label: "Language model", provider: "Model provider", state: "not_connected",
    localEquivalent: "Answers are composed from records in this workspace, with the records named.",
    note: "No model is called. Nothing is inferred beyond what the records state." },
  { id: "site.publish", label: "Publish a site", provider: "Hosting", state: "not_connected",
    localEquivalent: "The site model, pages and breakpoints are saved and can be exported as HTML.",
    note: "Publication needs a hosting connection." },
  { id: "calendar.sync", label: "Calendar sync", provider: "Calendar provider", state: "not_connected",
    localEquivalent: "Events and bookings live in this workspace and export as ICS.",
    note: "No external calendar is attached." },
  { id: "telephony", label: "Voice and SMS", provider: "Telephony", state: "not_connected",
    localEquivalent: "Call notes and message drafts are recorded against the customer.",
    note: "No telephony service is connected." },
];

export function capabilityById(id: string): ProviderCapability | undefined {
  return PROVIDER_CAPABILITIES.find((item) => item.id === id);
}

export const CAPABILITY_LABELS: Record<CapabilityState, string> = {
  not_connected: "Not connected",
  configuration_required: "Configuration required",
  ready_local: "Ready locally",
  queued_local: "Queued locally",
  awaiting_external_confirmation: "Awaiting external confirmation",
  verified_external: "Verified externally",
  blocked: "Blocked",
  failed: "Failed",
};

export const CAPABILITY_TONE: Record<CapabilityState, "neutral" | "success" | "warning" | "danger" | "info"> = {
  not_connected: "warning",
  configuration_required: "warning",
  ready_local: "success",
  queued_local: "info",
  awaiting_external_confirmation: "info",
  verified_external: "success",
  blocked: "danger",
  failed: "danger",
};
