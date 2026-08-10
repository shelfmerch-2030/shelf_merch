import { describe, it, expect } from "vitest";
import {
  addRecipientsUpToLimit,
  isManualRecipientId,
  isValidRecipientEmail,
  manualRecipientId,
  parseCsvEmails,
  parseEmailInput,
  resolveRecipientId,
  selectAllRecipientIds,
} from "@/features/send/recipientSelection";
import type { UiContact } from "@/services/mappers";

const contacts: UiContact[] = [
  {
    id: "c1",
    email: "alice@rubix.net",
    name: "Alice",
    role: "",
    address: "",
    loc: "—",
  },
  {
    id: "c2",
    email: "bob@rubix.net",
    name: "Bob",
    role: "",
    address: "",
    loc: "—",
  },
];

describe("recipientSelection", () => {
  it("validates and normalizes emails", () => {
    expect(isValidRecipientEmail("a@b.com")).toBe(true);
    expect(isValidRecipientEmail("not-an-email")).toBe(false);
    expect(manualRecipientId("  Ada@Rubix.net ")).toBe("email:ada@rubix.net");
    expect(isManualRecipientId("email:ada@rubix.net")).toBe(true);
  });

  it("parses pasted and CSV email lists", () => {
    expect(parseEmailInput("a@x.com, b@y.com; c@z.com")).toEqual([
      "a@x.com",
      "b@y.com",
      "c@z.com",
    ]);
    expect(parseCsvEmails("name,email\nAda,ada@rubix.net\nBob,bob@rubix.net")).toEqual([
      "ada@rubix.net",
      "bob@rubix.net",
    ]);
    expect(parseCsvEmails("solo@rubix.net\nother@rubix.net")).toEqual([
      "solo@rubix.net",
      "other@rubix.net",
    ]);
  });

  it("resolves to existing contact ids or manual ids", () => {
    expect(resolveRecipientId("alice@rubix.net", contacts)).toBe("c1");
    expect(resolveRecipientId("new@rubix.net", contacts)).toBe("email:new@rubix.net");
    expect(resolveRecipientId("bad", contacts)).toBeNull();
  });

  it("adds recipients with dedupe, invalid, and truncation", () => {
    const { ids, result } = addRecipientsUpToLimit(
      ["alice@rubix.net", "alice@rubix.net", "bad", "new@rubix.net", "extra@rubix.net"],
      [],
      contacts,
      2,
    );
    expect(ids).toEqual(["c1", "email:new@rubix.net"]);
    expect(result.added).toEqual(["alice@rubix.net", "new@rubix.net"]);
    expect(result.invalid).toEqual(["bad"]);
    expect(result.duplicates).toEqual(["alice@rubix.net"]);
    expect(result.truncated).toBe(1);
  });

  it("selects all contacts up to the limit", () => {
    expect(selectAllRecipientIds(contacts, [], 1)).toEqual(["c1"]);
    expect(selectAllRecipientIds(contacts, ["c1"], 10)).toEqual(["c1", "c2"]);
  });
});
