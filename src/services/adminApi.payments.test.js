import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPaymentSummary, listAllRows } from "./adminApi.js";
import { installFakeSupabase, TEST_CONFIG, withIds } from "../test/fakeSupabase.js";

const tx = (status, total, mentor = 0, fee = 0) => ({
  status,
  amount_total_paise: total,
  mentor_earning_paise: mentor,
  platform_fee_paise: fee,
});
const repeat = (n, row) => Array.from({ length: n }, () => ({ ...row }));

/** Same amounts and statuses as the live database on 2026-10-18. */
const LIVE_SNAPSHOT = {
  transactions: withIds([
    ...repeat(22, tx("paid", 100, 100, 0)),
    tx("paid", 10100, 9000, 1100),
    tx("paid", 33500, 30000, 3500),
    tx("created", 28000, 25000, 3000),
    tx("created", 28000, 25000, 3000),
    tx("created", 900, 900, 0),
    ...repeat(3, tx("created", 100, 100, 0)),
  ]),
  earnings: withIds([
    { status: "completed", amount: 90 },
    { status: "completed", amount: 300 },
    { status: "completed", amount: 199 },
    ...repeat(16, { status: "completed", amount: 1 }),
    ...repeat(8, { status: "pending", amount: 1 }),
  ]),
  mentor_wallets: withIds(
    [1, 4, 5, 2, 90, 300, 201, 3, ...Array(9).fill(0)].map((b) => ({ balance: b, total_earned: b, total_withdrawn: 0 }))
  ),
  withdrawal_requests: [],
};

let fake;
beforeEach(() => {
  fake = installFakeSupabase(LIVE_SNAPSHOT);
});
afterEach(() => fake.restore());

describe("getPaymentSummary — live snapshot", () => {
  it("counts only paid transactions as collected", async () => {
    const { transactions } = await getPaymentSummary(TEST_CONFIG);
    expect(transactions.collected).toMatchObject({ count: 24, total: 458, mentor: 412, platform: 46 });
  });

  it("reports unpaid checkouts separately instead of as revenue", async () => {
    const { transactions } = await getPaymentSummary(TEST_CONFIG);
    expect(transactions.unpaid).toMatchObject({ count: 6, total: 572 });
    // Regression guard: the old page showed paid + unpaid (₹1,030) as "Total Revenue".
    expect(transactions.collected.total).not.toBe(1030);
  });

  it("collected money splits exactly into mentor share + platform fees", async () => {
    const { collected } = (await getPaymentSummary(TEST_CONFIG)).transactions;
    expect(collected.mentor + collected.platform).toBeCloseTo(collected.total, 2);
  });

  it("totals wallets and earnings", async () => {
    const summary = await getPaymentSummary(TEST_CONFIG);
    expect(summary.wallets).toMatchObject({ count: 17, balance: 606, earned: 606, withdrawn: 0 });
    expect(summary.earnings.completed).toEqual({ count: 19, total: 605 });
    expect(summary.earnings.pending).toEqual({ count: 8, total: 8 });
  });

  it("breaks transactions down by status, largest amount first", async () => {
    const { byStatus } = (await getPaymentSummary(TEST_CONFIG)).transactions;
    expect(byStatus.map((s) => [s.status, s.count, s.total])).toEqual([
      ["created", 6, 572],
      ["paid", 24, 458],
    ]);
  });
});

describe("getPaymentSummary — status rules", () => {
  it("excludes failed and refunded payments from collected", async () => {
    fake.setTables({
      transactions: withIds([
        tx("paid", 10000),
        tx("completed", 5000),
        tx("failed", 7000),
        tx("refunded", 3000),
        tx("PAID", 1000), // case-insensitive
        tx("mystery", 999),
      ]),
    });
    const { transactions: t } = await getPaymentSummary(TEST_CONFIG);
    expect(t.collected).toMatchObject({ count: 3, total: 160 });
    expect(t.failed).toMatchObject({ count: 1, total: 70 });
    expect(t.refunded).toMatchObject({ count: 1, total: 30 });
    expect(t.other).toMatchObject({ count: 1, total: 9.99 });
  });

  it("treats missing amounts as zero rather than NaN", async () => {
    fake.setTables({ transactions: withIds([tx("paid", null, null, null), tx("paid", 500)]) });
    const { collected } = (await getPaymentSummary(TEST_CONFIG)).transactions;
    expect(collected.total).toBe(5);
    expect(Number.isNaN(collected.mentor)).toBe(false);
  });

  it("works on an empty database", async () => {
    fake.setTables({});
    const summary = await getPaymentSummary(TEST_CONFIG);
    expect(summary.transactions.collected.total).toBe(0);
    expect(summary.transactions.byStatus).toEqual([]);
    expect(summary.wallets.balance).toBe(0);
  });
});

describe("listAllRows — no 1,000-row cap", () => {
  const offsets = () => fake.requests.filter((r) => r.table === "transactions").map((r) => r.params.get("offset"));

  it("fetches every row in batches of 1,000", async () => {
    fake.setTables({ transactions: withIds(repeat(2500, tx("paid", 100))) });
    const rows = await listAllRows(TEST_CONFIG, "transactions", "id, status");
    expect(rows).toHaveLength(2500);
    expect(offsets()).toEqual(["0", "1000", "2000"]);
  });

  it("stops after an empty batch when the count is an exact multiple of 1,000", async () => {
    fake.setTables({ transactions: withIds(repeat(1000, tx("paid", 100))) });
    const rows = await listAllRows(TEST_CONFIG, "transactions");
    expect(rows).toHaveLength(1000);
    expect(offsets()).toEqual(["0", "1000"]);
  });

  it("orders by id so batches never overlap", async () => {
    await listAllRows(TEST_CONFIG, "transactions");
    expect(fake.requests[0].params.get("order")).toBe("id.asc");
  });

  it("collected total is right beyond 1,000 rows", async () => {
    fake.setTables({ transactions: withIds(repeat(2500, tx("paid", 100, 90, 10))) });
    const { collected } = (await getPaymentSummary(TEST_CONFIG)).transactions;
    expect(collected).toMatchObject({ count: 2500, total: 2500, mentor: 2250, platform: 250 });
  });
});
