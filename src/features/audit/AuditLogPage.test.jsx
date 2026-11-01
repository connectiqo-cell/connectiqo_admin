// @vitest-environment jsdom
import { cleanup, fireEvent, render as rtlRender, screen, within } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const audit = vi.hoisted(() => ({ value: { logs: [], maxLogs: 1000 } }));
vi.mock("../../app/providers/AuditProvider.jsx", () => ({ useAudit: () => audit.value }));

import { AuditLogPage } from "./AuditLogPage.jsx";
import { describeAction, humanize, payloadRows } from "./auditFormat.js";

const render = (ui) => rtlRender(<BrowserRouter>{ui}</BrowserRouter>);
afterEach(() => window.history.replaceState(null, "", "/"));

const logs = [
  { id: "1", action: "UPDATE", entity: "email_trigger_settings", actorEmail: "admin@x.co", timestamp: "2026-10-31T10:00:00Z", payload: { _admin_action: "pause_emails", discarded: 0 } },
  { id: "2", action: "webhook_reconciled_session_booking", entity: "bookings", actorEmail: null, timestamp: "2026-10-31T09:00:00Z", payload: { booking_id: "b-1", paid: true, extra: { a: 1 } } },
  { id: "3", action: "DELETE", entity: "hero_slides", actorEmail: "other@x.co", timestamp: "2026-10-31T08:00:00Z", payload: null },
];

afterEach(() => {
  cleanup();
  audit.value = { logs: [], maxLogs: 1000 };
});

// The filter menus repeat these names, so checks look inside the table.
const table = () => within(document.querySelector("table"));

const openPage = (value = logs) => {
  audit.value = { logs: value, maxLogs: 1000 };
  render(<AuditLogPage />);
};

describe("AuditLogPage", () => {
  it("shows readable actions, areas and people instead of raw values", () => {
    openPage();
    expect(table().getByText("Pause emails")).toBeTruthy();
    expect(table().getByText("Email trigger settings")).toBeTruthy();
    expect(table().getByText("Payment confirmed: session booking")).toBeTruthy();
    expect(table().getByText("Deleted")).toBeTruthy();
    const system = table().getByText("System").closest("tr");
    expect(within(system).getByText("Bookings")).toBeTruthy();
    expect(document.querySelector("pre")).toBeNull();
  });

  it("keeps details behind a toggle, as labelled values", () => {
    openPage();
    const row = table().getByText("System").closest("tr");
    const details = row.querySelector("details");
    expect(details.open).toBe(false);
    expect(within(details).getByText("Booking id")).toBeTruthy();
    expect(within(details).getByText("Yes")).toBeTruthy();
    expect(within(table().getByText("Deleted").closest("tr")).queryByText("View details")).toBeNull();
  });

  it("filters by action and area, and combines with search", () => {
    openPage();
    const action = screen.getByLabelText("Filter by action");
    fireEvent.change(action, { target: { value: "DELETE" } });
    expect(table().getByText("Hero slides")).toBeTruthy();
    expect(table().queryByText("Bookings")).toBeNull();
    fireEvent.change(action, { target: { value: "all" } });

    fireEvent.change(screen.getByLabelText("Filter by area"), { target: { value: "bookings" } });
    expect(table().getByText("Bookings")).toBeTruthy();
    expect(table().queryByText("Hero slides")).toBeNull();

    fireEvent.change(screen.getByPlaceholderText("Search by person, area or details…"), { target: { value: "admin@x.co" } });
    expect(screen.getByText("No audit events match your filters.")).toBeTruthy();
  });

  it("pages through long logs and says when older events are left out", () => {
    const many = Array.from({ length: 1000 }, (_, i) => ({ ...logs[2], id: String(i), actorEmail: `u${i}@x.co` }));
    openPage(many);
    expect(screen.getByText("u0@x.co")).toBeTruthy();
    expect(screen.queryByText("u25@x.co")).toBeNull();
    expect(screen.getByText(/Showing the newest 1,000 events/)).toBeTruthy();
  });

  it("explains an empty log", () => {
    openPage([]);
    expect(screen.getByText("No audit events yet.")).toBeTruthy();
  });
});

describe("audit wording", () => {
  it("names actions, including unknown ones", () => {
    expect(describeAction("RPC").label).toBe("Updated");
    expect(describeAction("something_new").label).toBe("Something new");
    expect(describeAction(null).label).toBe("Unknown");
    expect(humanize("hero_slides")).toBe("Hero slides");
  });
  it("handles every payload shape", () => {
    expect(payloadRows(null)).toEqual([]);
    expect(payloadRows("text")).toEqual([["Details", "text"]]);
    expect(payloadRows({ _admin_action: "x" })).toEqual([]);
    expect(payloadRows({ a_b: "", c: { d: 1 } })).toEqual([["A b", "—"], ["C", '{"d":1}']]);
  });
});
