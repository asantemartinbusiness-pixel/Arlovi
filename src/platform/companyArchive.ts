import { clockIso } from "@/platform/clock";
import { db } from "@/runtime/db";
import type { Audit, Rec } from "@/domain/types";

/**
 * Portable, integrity-checked local company archive.
 * No cloud upload or import is implied. Export is intentionally user initiated.
 * The archive contains sensitive company data; it must be stored securely.
 */
export const ARCHIVE_FORMAT = "arlovi.company-archive.v1";
export type ArchivePayload = {
  format: typeof ARCHIVE_FORMAT;
  organization: { id: string; slug: string; name: string };
  generatedAt: string;
  records: Rec[];
  events: Audit[];
};
export type ArchiveEnvelope = { payload: ArchivePayload; sha256: string };
export interface LocalCompanyInventory {
  recordCount: number;
  auditCount: number;
  collections: { name: string; count: number }[];
  lastModified: string | null;
  unlinkedParentIds: string[];
}
function digestHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes)).map(byte => byte.toString(16).padStart(2, "0")).join("");
}
export async function sha256(content: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("Secure browser hashing is unavailable. The archive was not generated.");
  return digestHex(await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(content)));
}
export function summarizeLocalCompany(records: Rec[], events: Audit[]): LocalCompanyInventory {
  const counts = new Map<string, number>();
  const ids = new Set(records.map(r => r.id));
  const missing = new Set<string>();
  for (const row of records) {
    counts.set(row.collection, (counts.get(row.collection) ?? 0) + 1);
    if (row.parentId && !ids.has(row.parentId)) missing.add(row.parentId);
  }
  const lastModified = records.length
    ? [...records].sort((a,b) => b.updatedAt.localeCompare(a.updatedAt))[0].updatedAt : null;
  return {
    recordCount: records.length, auditCount: events.length,
    collections: [...counts].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count || a.name.localeCompare(b.name)),
    lastModified,
    unlinkedParentIds: [...missing].sort(),
  };
}
export async function localCompanyInventory(orgId: string): Promise<LocalCompanyInventory> {
  const [records,events] = await db.transaction("r",[db.records,db.events], async()=>Promise.all([
    db.records.where("organizationId").equals(orgId).toArray(),
    db.events.where("organizationId").equals(orgId).toArray(),
  ]));
  return summarizeLocalCompany(records,events);
}
export async function createCompanyArchive(org: { id: string; slug: string; name: string }): Promise<ArchiveEnvelope> {
  const [records,events] = await db.transaction("r",[db.records,db.events], async()=>Promise.all([
    db.records.where("organizationId").equals(org.id).toArray(),
    db.events.where("organizationId").equals(org.id).toArray(),
  ]));
  if (!records.some(r=>r.id===org.id && r.collection==="organizations")) {
    // Seeded demonstration companies may use fixture organisation records.
    if (!records.length) throw new Error("No company records were found; there is nothing to export.");
  }
  const payload: ArchivePayload = {
    format:ARCHIVE_FORMAT,
    organization:{id:org.id,slug:org.slug,name:org.name},
    generatedAt:clockIso(),
    records:records.sort((a,b)=>a.id.localeCompare(b.id)),
    events:events.sort((a,b)=>a.id.localeCompare(b.id)),
  };
  return { payload, sha256:await sha256(JSON.stringify(payload)) };
}
export async function verifyCompanyArchive(value: unknown): Promise<{ valid: boolean; reason?: string }> {
  if (!value || typeof value !== "object") return {valid:false,reason:"Archive is not an object."};
  const envelope = value as Partial<ArchiveEnvelope>;
  if (!envelope.payload || envelope.payload.format !== ARCHIVE_FORMAT
    || !Array.isArray(envelope.payload.records) || !Array.isArray(envelope.payload.events)
    || !envelope.payload.organization?.id || typeof envelope.sha256 !== "string")
    return {valid:false,reason:"Archive fields or version are invalid."};
  const expected = await sha256(JSON.stringify(envelope.payload));
  if (expected !== envelope.sha256) return {valid:false,reason:"Archive checksum mismatch."};
  if (envelope.payload.records.some(r=>r.organizationId!==envelope.payload!.organization.id)
    || envelope.payload.events.some(e=>e.organizationId!==envelope.payload!.organization.id))
    return {valid:false,reason:"Archive contains another company's records."};
  return {valid:true};
}
export function saveArchiveFile(orgSlug: string, archive: ArchiveEnvelope): void {
  const day = archive.payload.generatedAt.slice(0,10);
  const blob = new Blob([JSON.stringify(archive,null,2)],{type:"application/json"});
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;anchor.download = `arlovi-${orgSlug}-backup-${day}.json`;
  document.body.append(anchor);anchor.click();anchor.remove();
  // Defer revocation until after the browser has consumed the object URL.
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
