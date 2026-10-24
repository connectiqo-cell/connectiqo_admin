/**
 * In-memory stand-in for Supabase's REST API. Replaces global fetch so adminApi can run
 * unchanged against fixture tables; every request is recorded for assertions.
 * Supports what adminApi uses: offset/limit paging and the exact-count header.
 */
export const TEST_CONFIG = { supabaseUrl: "https://unit-test.supabase.co", supabaseAnonKey: "unit-test-key" };

export function installFakeSupabase(tables = {}) {
  const requests = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const table = url.pathname.split("/").pop();
    const rows = tables[table] || [];
    const offset = Number(url.searchParams.get("offset") || 0);
    const limit = Number(url.searchParams.get("limit") || rows.length);
    const page = rows.slice(offset, offset + limit);
    let body = null;
    try {
      body = init.body ? JSON.parse(init.body) : null;
    } catch {
      body = init.body;
    }
    requests.push({ table, url, params: url.searchParams, method: init.method || "GET", body });

    const end = page.length ? offset + page.length - 1 : offset;
    return new Response(JSON.stringify(page), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "content-range": `${page.length ? `${offset}-${end}` : "*"}/${rows.length}`,
      },
    });
  };

  return {
    requests,
    /** All `or=` filters sent for a table, decoded. */
    orFilters: (table) => requests.filter((r) => r.table === table).flatMap((r) => r.params.getAll("or")),
    setTables(next) {
      tables = next;
    },
    restore() {
      globalThis.fetch = originalFetch;
    },
  };
}

/** Rows with stable, sortable ids. */
export const withIds = (rows) => rows.map((row, i) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, ...row }));
