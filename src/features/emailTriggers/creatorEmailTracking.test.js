import { describe, expect, it } from "vitest";
import { accountStatus, canReceiveEmails, filterCreatorRows, summarizeCreatorRows } from "./creatorEmailTracking.js";

const NOW = Date.parse("2026-10-25T12:00:00Z");

const rows = [
  { id: "1", name: "Asha Rao", email: "asha@x.co", greeting_mail_sent: true, open_slots_mail_count: 2 },
  { id: "2", name: "Ben", email: "ben@y.co", is_frozen: true, open_slots_mail_count: 0 },
  { id: "3", name: "Cara", email: "cara@z.co", mentor_frozen: true, mentor_frozen_until: null, open_slots_mail_count: null },
  { id: "4", name: "Dev", email: "dev@z.co", deleted_at: "2026-10-01T00:00:00Z", open_slots_mail_count: 1 },
  { id: "5", name: "Eli", email: "eli@z.co", mentor_frozen: true, mentor_frozen_until: "2026-10-24T00:00:00Z" },
];

describe("accountStatus", () => {
  it("reads each account state", () => {
    expect(rows.map((r) => accountStatus(r, NOW))).toEqual(["active", "login_frozen", "creator_frozen", "deleted", "active"]);
  });

  it("treats a missing profile as deleted", () => {
    expect(accountStatus({ profile_missing: true }, NOW)).toBe("deleted");
  });

  it("puts deleted ahead of frozen, and login freeze ahead of creator freeze", () => {
    expect(accountStatus({ deleted_at: "x", is_frozen: true, mentor_frozen: true }, NOW)).toBe("deleted");
    expect(accountStatus({ is_frozen: true, mentor_frozen: true }, NOW)).toBe("login_frozen");
  });

  it("keeps a creator freeze until its end date", () => {
    expect(accountStatus({ mentor_frozen: true, mentor_frozen_until: "2026-11-01T00:00:00Z" }, NOW)).toBe("creator_frozen");
  });

  it("only active accounts receive emails", () => {
    expect(rows.filter((r) => canReceiveEmails(r, NOW)).map((r) => r.id)).toEqual(["1", "5"]);
  });
});

describe("filterCreatorRows", () => {
  it("returns everything with no filters", () => {
    expect(filterCreatorRows(rows, { now: NOW })).toHaveLength(5);
  });

  it("searches name and email, ignoring case", () => {
    expect(filterCreatorRows(rows, { query: "ASHA", now: NOW }).map((r) => r.id)).toEqual(["1"]);
    expect(filterCreatorRows(rows, { query: "y.co", now: NOW }).map((r) => r.id)).toEqual(["2"]);
  });

  it("filters by greeting status", () => {
    expect(filterCreatorRows(rows, { greeting: "sent", now: NOW }).map((r) => r.id)).toEqual(["1"]);
  });

  it("filters by account status, with Frozen covering both freezes", () => {
    expect(filterCreatorRows(rows, { account: "active", now: NOW }).map((r) => r.id)).toEqual(["1", "5"]);
    expect(filterCreatorRows(rows, { account: "frozen", now: NOW }).map((r) => r.id)).toEqual(["2", "3"]);
    expect(filterCreatorRows(rows, { account: "deleted", now: NOW }).map((r) => r.id)).toEqual(["4"]);
  });
});

describe("summarizeCreatorRows", () => {
  it("counts receiving, frozen and deleted creators plus email totals", () => {
    expect(summarizeCreatorRows(rows, NOW)).toEqual({
      total: 5,
      receiving: 2,
      frozen: 2,
      deleted: 1,
      greetingSent: 1,
      sessionMails: 3,
    });
  });
});
