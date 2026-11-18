/**
 * Explicit approved extensions beyond the original 2026 screen registry.
 * The original registry and generated catalogue retain their canonical counts.
 * New native screen tabs must be deliberately declared here rather than
 * silently relaxing contract coverage for every application.
 */
export const APPROVED_SCREEN_TAB_EXTENSIONS: Readonly<Record<string, readonly string[]>> = {
  "ARL-COMMS-005": ["Shared inboxes", "Accounts & domains", "Sender identities"],
};
