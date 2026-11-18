import { describe, expect, it } from "vitest";
import { configuredIdentities, signaturePreview, validateIdentity } from "@/applications/comms/mailIdentities";
import type { Rec } from "@/domain/types";

describe("local mail identities", () => {
  it("rejects invalid display names and addresses", () => {
    expect(validateIdentity("", "sales@example.com")).toBeTruthy();
    expect(validateIdentity("Sales", "invalid address")).toBeTruthy();
    expect(validateIdentity("Sales", "sales@example.com")).toBeNull();
  });

  it("isolates identity configuration by actor", () => {
    const records = [
      { id: "a", collection: "preferences", title: "Sales", fields: { kind: "mailIdentity", person: "Jane", address: "sales@example.com", displayName: "Sales", signature: "Sales team" } },
      { id: "b", collection: "preferences", title: "People", fields: { kind: "mailIdentity", person: "Alex", address: "hr@example.com", displayName: "People" } },
    ] as unknown as Rec[];
    expect(configuredIdentities(records, "Jane").map((item) => item.address)).toEqual(["sales@example.com"]);
    expect(configuredIdentities(records, "Alex").map((item) => item.address)).toEqual(["hr@example.com"]);
    expect(configuredIdentities(records, "Sam")).toEqual([]);
  });

  it("renders signatures without duplicating whitespace", () => {
    expect(signaturePreview("Hello  ", "  Kind regards\nSales  ")).toBe("Hello\n\nKind regards\nSales");
    expect(signaturePreview("Hello", "")).toBe("Hello");
  });
});
