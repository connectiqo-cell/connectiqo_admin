// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MinWithdrawalCard } from "./MinWithdrawalCard.jsx";
import { installFakeSupabase, TEST_CONFIG } from "../../test/fakeSupabase.js";

const SETTINGS = [{ id: true, min_withdrawal_amount: "5000.00", updated_at: "2026-10-24T08:00:00Z", updated_by: "admin@x.com" }];

let fake;
let addLog;
let addToast;

beforeEach(() => {
  fake = installFakeSupabase({ payout_settings: SETTINGS });
  addLog = vi.fn();
  addToast = vi.fn();
});
afterEach(() => {
  cleanup();
  fake.restore();
});

const renderCard = () =>
  render(
    <MinWithdrawalCard config={TEST_CONFIG} environment="production" operator="me@x.com" addLog={addLog} addToast={addToast} />
  );

const amountInput = () => screen.getByLabelText(/New minimum/);

describe("MinWithdrawalCard", () => {
  it("shows the current minimum from the database", async () => {
    renderCard();
    expect(await screen.findByText("₹5,000")).toBeTruthy();
    expect(screen.getByText(/by admin@x.com/)).toBeTruthy();
  });

  it("explains what to do when the setting doesn't exist yet", async () => {
    fake.setTables({}); // payout_settings not created
    renderCard();
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toMatch(/isn.t set up in the database yet/);
    expect(screen.queryByRole("button", { name: /Change/ })).toBeNull();
  });

  it.each([
    ["", "Enter an amount."],
    ["99.5", "Use whole rupees (no paise)."],
    ["0", "Minimum must be at least ₹1."],
    ["10000001", "Maximum allowed is ₹10,00,000."],
  ])("rejects %j", async (value, message) => {
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: /Change/ }));
    fireEvent.change(amountInput(), { target: { value } });
    expect(screen.getByText(message)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save" }).disabled).toBe(true);
  });

  it("doesn't allow saving an unchanged value", async () => {
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: /Change/ }));
    expect(screen.getByRole("button", { name: "Save" }).disabled).toBe(true);
  });

  it("asks for confirmation, then saves, logs and notifies", async () => {
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: /Change/ }));
    fireEvent.change(amountInput(), { target: { value: "7500" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toMatch(/₹5,000\.00.*₹7,500\.00/);
    // Nothing is written before confirming.
    expect(fake.requests.some((r) => r.method === "PATCH")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Update minimum" }));
    await vi.waitFor(() => expect(addToast).toHaveBeenCalled());

    const patch = fake.requests.find((r) => r.method === "PATCH");
    expect(patch.table).toBe("payout_settings");
    expect(patch.params.get("id")).toBe("eq.true");
    expect(patch.body).toMatchObject({ min_withdrawal_amount: 7500, updated_by: "me@x.com" });
    // The fake returns the stored row unchanged, so only the "from" side is meaningful here.
    const logged = addLog.mock.calls[0][0];
    expect(logged).toMatchObject({ action: "UPDATE", entity: "payout_settings", environment: "production" });
    expect(logged.payload.min_withdrawal_amount.from).toBe(5000);
  });
});
