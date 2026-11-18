import { describe, expect, it } from "vitest";
import { addComposeRecipient, contactQuery, documentSuggestions, findComposeContacts, insertComposeLink, safeComposeLink } from "@/applications/comms/composeTools";
import type { Rec } from "@/domain/types";
const make = (id: string, title: string, email: string, collection = "contacts"): Rec =>
  ({ id, title, collection, status: "active", fields: { email } }) as unknown as Rec;

describe("email composer workspace tools", () => {
  const records = [make("1", "Leo Martins", "leo@example.com"), make("2", "Leona", "leona@example.com"), make("3", "No email", "bad")];
  it("finds contacts by name or address without duplicating emails", () => {
    expect(findComposeContacts([...records, records[0]], "leo").map(x => x.id)).toEqual(["1", "2"]);
    expect(findComposeContacts(records, "bad")).toEqual([]);
    expect(findComposeContacts(records, "")).toEqual([]);
  });
  it("inserts an address after comma-separated recipients and removes the search fragment", () => {
    expect(contactQuery("alex@example.com, le")).toBe("le");
    expect(addComposeRecipient("alex@example.com, le", "leo@example.com")).toBe("alex@example.com, leo@example.com");
    expect(addComposeRecipient("Leo@example.com", "leo@example.com")).toBe("Leo@example.com");
    expect(addComposeRecipient("x", "bad")).toBe("x");
  });
  it("allows only normal http(s) links, never script schemes", () => {
    expect(safeComposeLink("javascript:alert(1)")).toBeNull();
    expect(safeComposeLink("https://example.com/path")).toBe("https://example.com/path");
    expect(insertComposeLink("Hello", "https://example.com")).toBe("Hello\n\nhttps://example.com/");
    expect(insertComposeLink("Hello", "file:///etc/passwd")).toBe("Hello");
  });
  it("returns document metadata references without inventing downloadable attachments", () => {
    const docs = [make("d1", "Invoice 100", "", "documents"), make("d2", "Archived quote", "", "documents")];
    docs[1].status = "archived";
    expect(documentSuggestions(docs, "inv")).toEqual([{ id: "d1", title: "Invoice 100", collection: "documents" }]);
  });
});
