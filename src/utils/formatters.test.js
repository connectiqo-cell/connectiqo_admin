import { describe, expect, it } from "vitest";
import {
  booleanBadge,
  formatDate,
  formatInr,
  formatPaise,
  formatTime,
  humanizeKey,
  inferKind,
  shortId,
  statusTone,
} from "./formatters.js";

const UUID = "3f2a91bc-1234-4abc-9def-0123456789ab";

describe("money", () => {
  it("formats paise as rupees", () => {
    expect(formatPaise(250000)).toBe("₹2,500.00");
    expect(formatPaise(100)).toBe("₹1.00");
  });

  it("uses Indian digit grouping", () => {
    expect(formatInr(1234567.5)).toBe("₹12,34,567.50");
  });

  it("shows a dash for non-numbers", () => {
    expect(formatInr("abc")).toBe("—");
  });
});

describe("dates", () => {
  it("does not shift date-only values across time zones", () => {
    expect(formatDate("2026-10-18")).toMatch(/18/);
  });

  it("formats times of day", () => {
    expect(formatTime("14:30:00")).toMatch(/2:30/);
  });
});

describe("humanizeKey", () => {
  it.each([
    ["amount_total_paise", "Amount"],
    ["is_frozen", "Status"],
    ["created_at", "Created"],
    ["booking_id", "Booking"],
    ["upi_id", "UPI ID"],
    ["linkedin_url", "LinkedIn"],
    ["total_withdrawn", "Total withdrawn"],
  ])("%s → %s", (key, label) => {
    expect(humanizeKey(key)).toBe(label);
  });
});

describe("inferKind", () => {
  it.each([
    ["amount_total_paise", 250000, "paise"],
    ["balance", 12, "inr"],
    ["gst_percent", 18, "percent"],
    ["is_frozen", false, "boolean"],
    ["status", "paid", "status"],
    ["kyc_status", "verified", "status"],
    ["created_at", "2026-10-18T11:24:22Z", "datetime"],
    ["date", "2026-10-18", "date"],
    ["start_time", "14:30:00", "time"],
    ["avatar_url", "https://x", "link"],
    ["booking_id", UUID, "id"],
    ["skills", ["a"], "json"],
  ])("%s → %s", (key, value, kind) => {
    expect(inferKind(key, value)).toBe(kind);
  });

  it("keeps meaningful *_id text in full (not shortened like a UUID)", () => {
    expect(inferKind("upi_id", "rahul@okaxis")).toBe("text");
    expect(inferKind("razorpay_payment_id", "pay_Qx81")).toBe("text");
  });

  it("treats configured person columns as people", () => {
    expect(inferKind("mentor_id", UUID, { mentor_id: "Mentor" })).toBe("person");
  });
});

describe("badges", () => {
  it.each([
    ["paid", "success"],
    ["Completed", "success"],
    ["created", "warning"],
    ["failed", "danger"],
    ["refunded", "info"],
    ["whatever", "neutral"],
  ])("status %s → %s", (status, tone) => {
    expect(statusTone(status)).toBe(tone);
  });

  it("words boolean flags by meaning", () => {
    expect(booleanBadge("is_frozen", true)).toEqual({ text: "Banned", tone: "danger" });
    expect(booleanBadge("mentor_frozen", true)).toEqual({ text: "Frozen", tone: "warning" });
    expect(booleanBadge("is_frozen", false)).toEqual({ text: "Active", tone: "success" });
    expect(booleanBadge("is_active", false).text).toBe("Inactive");
    expect(booleanBadge("route_enabled", true).text).toBe("Yes");
  });
});

it("shortens ids to 8 characters", () => {
  expect(shortId(UUID)).toBe("3f2a91bc");
});
