import type { Rec } from "@/domain/types";

/** Local identity configuration. It never grants permission to send via a provider. */
export interface MailIdentity {
  id: string;
  name: string;
  address: string;
  signature: string;
  department: string;
  configuredBy: string;
  verified: false;
}

export function configuredIdentities(rows: Rec[], actor: string): MailIdentity[] {
  return rows
    .filter((row) => row.collection === "preferences" && row.fields.kind === "mailIdentity" && row.fields.person === actor)
    .map((row) => ({
      id: row.id,
      name: String(row.fields.displayName ?? row.title),
      address: String(row.fields.address ?? ""),
      signature: String(row.fields.signature ?? ""),
      department: String(row.fields.department ?? ""),
      configuredBy: actor,
      verified: false as const,
    }));
}

export function signaturePreview(message: string, signature: string): string {
  const clean = signature.trim();
  if (!clean) return message;
  return message.trimEnd() + "\n\n" + clean;
}

export function validateIdentity(name: string, address: string): string | null {
  if (!name.trim()) return "Enter a display name.";
  if (!/^[^\\s@<>(),;]+@[^\\s@<>(),;]+\\.[^\\s@<>(),;]+$/.test(address.trim())) return "Enter a valid email address.";
  return null;
}
