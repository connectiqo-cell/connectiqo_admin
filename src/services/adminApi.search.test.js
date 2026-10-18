import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listTableRows, TABLE_SEARCH_COLUMNS } from "./adminApi.js";
import { installFakeSupabase, TEST_CONFIG, withIds } from "../test/fakeSupabase.js";

const PROFILE_COLS = TABLE_SEARCH_COLUMNS.profiles.text;
let fake;

beforeEach(() => {
  fake = installFakeSupabase({
    profiles: withIds(Array.from({ length: 124 }, (_, i) => ({ name: `User ${i}`, email: `u${i}@x.com` }))),
    mentor_wallets: withIds([{ balance: 1 }]),
  });
});

afterEach(() => fake.restore());

describe("listTableRows — pagination", () => {
  it("requests the right slice for a page and returns the exact total", async () => {
    const result = await listTableRows(TEST_CONFIG, "profiles", { page: 3, pageSize: 25 });
    const { params } = fake.requests[0];
    expect(params.get("offset")).toBe("50");
    expect(params.get("limit")).toBe("25");
    expect(result.rows).toHaveLength(25);
    expect(result.rows[0].name).toBe("User 50");
    expect(result.count).toBe(124);
  });

  it("returns a short last page", async () => {
    const result = await listTableRows(TEST_CONFIG, "profiles", { page: 5, pageSize: 25 });
    expect(result.rows).toHaveLength(24); // 124 - 100
    expect(result.count).toBe(124);
  });

  it("uses a plain limit when no page is given", async () => {
    await listTableRows(TEST_CONFIG, "profiles", { limit: 10 });
    expect(fake.requests[0].params.get("offset")).toBe("0");
    expect(fake.requests[0].params.get("limit")).toBe("10");
  });

  it("refuses tables that are not on the allow-list", async () => {
    await expect(listTableRows(TEST_CONFIG, "admins", {})).rejects.toThrow(/not permitted/);
    expect(fake.requests).toHaveLength(0);
  });
});

describe("listTableRows — server-side search", () => {
  const search = (q, table = "profiles", cols = PROFILE_COLS) =>
    listTableRows(TEST_CONFIG, table, { page: 1, pageSize: 25, search: q, searchColumns: cols });

  it("matches a single word against every text column", async () => {
    await search("john");
    expect(fake.orFilters("profiles")).toEqual([
      `(${PROFILE_COLS.map((c) => `${c}.ilike.*john*`).join(",")})`,
    ]);
  });

  it("requires each word separately (AND of ORs)", async () => {
    await search("  john   gmail ");
    const filters = fake.orFilters("profiles");
    expect(filters).toHaveLength(2);
    expect(filters[0]).toContain("name.ilike.*john*");
    expect(filters[1]).toContain("email.ilike.*gmail*");
  });

  it("strips characters that would break the query", async () => {
    await search('50%, (x) "y"');
    const filters = fake.orFilters("profiles").join(" ");
    expect(filters).toContain("name.ilike.*50*");
    expect(filters).toContain("name.ilike.*x*");
    expect(filters).toContain("name.ilike.*y*");
    const terms = [...filters.matchAll(/ilike\.\*([^*]*)\*/g)].map((m) => m[1]);
    expect(new Set(terms)).toEqual(new Set(["50", "x", "y"]));
  });

  it("matches a pasted UUID exactly against id columns", async () => {
    const id = "3F2A91BC-1234-4ABC-9DEF-0123456789AB";
    await search(`  ${id}  `);
    expect(fake.orFilters("profiles")).toEqual([`(id.eq.${id})`]);
  });

  it("returns no rows without querying when an id-only table gets a text search", async () => {
    const result = await search("hello", "mentor_wallets", TABLE_SEARCH_COLUMNS.mentor_wallets.uuid);
    expect(result).toEqual({ rows: [], count: 0 });
    expect(fake.requests).toHaveLength(0);
  });

  it("does not search when no search columns are given", async () => {
    await listTableRows(TEST_CONFIG, "profiles", { page: 1, pageSize: 25, search: "john" });
    expect(fake.orFilters("profiles")).toEqual([]);
  });

  it("never lists uuid, date or flag columns as text (ilike on those makes Postgres error)", () => {
    for (const [table, cfg] of Object.entries(TABLE_SEARCH_COLUMNS)) {
      for (const col of cfg.text) {
        expect(cfg.uuid, `${table}.${col}`).not.toContain(col);
        expect(col, `${table}.${col}`).not.toMatch(/(^id$|_at$|^is_)/);
      }
    }
  });
});
