// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { installFakeSupabase, TEST_CONFIG, withIds } from "../../test/fakeSupabase.js";
import { ALLOWED_TABLES } from "../../services/adminApi.js";

// The page only needs these hooks from the app's providers.
vi.mock("../../app/providers/EnvironmentProvider.jsx", () => ({
  useEnvironment: () => ({ config: TEST_CONFIG, environment: "production" }),
}));
vi.mock("../../app/providers/AuditProvider.jsx", () => ({ useAudit: () => ({ addLog: vi.fn() }) }));
vi.mock("../../app/providers/ToastProvider.jsx", () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock("../../app/providers/AuthProvider.jsx", () => ({
  useAuth: () => ({ session: { user: { email: "admin@test.com" } } }),
}));

const { DatabaseExplorerPage } = await import("./DatabaseExplorerPage.jsx");

const UUID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** One realistic row per allowed table, with the column types that once crashed rendering. */
const FIXTURES = {
  profiles: [{ role: "mentor", name: "Asha", email: "asha@x.com", is_frozen: false, created_at: "2026-10-18T11:24:22Z" }],
  bookings: [{ learner_id: UUID(1), mentor_id: UUID(2), status: "confirmed", slot_ids: [UUID(3)], created_at: "2026-10-18T11:24:22Z" }],
  transactions: [{ learner_id: UUID(1), mentor_id: UUID(2), amount_total_paise: 250000, status: "paid", created_at: "2026-10-18T11:24:22Z" }],
  earnings: [{ mentor_id: UUID(2), amount: 90, status: "completed" }],
  mentor_wallets: [{ balance: 300, total_earned: 300, total_withdrawn: 0 }],
  withdrawal_requests: [{ mentor_id: UUID(2), amount: 100, status: "pending", upi_id: "asha@okaxis" }],
  availability_slots: [{ mentor_id: UUID(2), date: "2026-10-20", start_time: "14:30:00", is_booked: false }],
  mentor_profiles: [{ specialization: "Design", skills: ["figma", "ui"], mentor_frozen: false, price_per_hour: 500 }],
  mentor_categories: [{ name: "Design", slug: "design", is_active: true, sort_order: 1 }],
  platform_fee_rules: [{ platform_fee_percent: 5, gst_percent: 18, is_active: true }],
  hero_slides: [{ image_url: "https://x/slide.png", position: 1, is_active: true }],
  user_reports: [{ reporter_id: UUID(1), reported_user_id: UUID(2), reason: "spam", status: "open", context_id: UUID(9) }],
};

let fake;
beforeEach(() => {
  fake = installFakeSupabase(Object.fromEntries(Object.entries(FIXTURES).map(([t, rows]) => [t, withIds(rows)])));
});
afterEach(() => {
  cleanup();
  fake.restore();
});

const tableButton = (name) => screen.getByRole("button", { name, pressed: false });

describe("DatabaseExplorerPage", () => {
  it("offers exactly the allow-listed tables", () => {
    render(<DatabaseExplorerPage />);
    for (const table of ALLOWED_TABLES) {
      expect(screen.getByRole("button", { name: table })).toBeTruthy();
    }
    expect(screen.queryByRole("button", { name: "admins" })).toBeNull();
  });

  it("filters the table list", () => {
    render(<DatabaseExplorerPage />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Filter tables" }), { target: { value: "mentor " } });
    expect(screen.getByRole("button", { name: "mentor_wallets" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "bookings" })).toBeNull();
  });

  it.each([...ALLOWED_TABLES].sort())("opens %s without crashing and shows real column names", async (table) => {
    render(<DatabaseExplorerPage />);
    if (table !== "profiles") fireEvent.click(tableButton(table));
    // Rows arrive asynchronously from the fake Supabase.
    const grid = await screen.findByRole("table");
    expect(within(grid).getAllByRole("row").length).toBeGreaterThan(1);
    // Database Explorer uses raw names: "Id", not product labels like "Creator".
    expect(within(grid).getByRole("columnheader", { name: /^Id/ })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("searches the whole table server-side for the selected table", async () => {
    render(<DatabaseExplorerPage />);
    fireEvent.click(tableButton("withdrawal_requests"));
    await screen.findByRole("table");
    fireEvent.change(screen.getByRole("searchbox", { name: /Search/ }), { target: { value: "okaxis" } });
    await vi.waitFor(() => expect(fake.orFilters("withdrawal_requests").join(" ")).toContain("upi_id.ilike.*okaxis*"));
  });
});
