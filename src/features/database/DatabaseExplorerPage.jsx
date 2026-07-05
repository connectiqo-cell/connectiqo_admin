import { useMemo, useState } from "react";
import { ResourceCrudPage } from "../resources/ResourceCrudPage.jsx";
import { SearchBar } from "../../components/common/SearchBar.jsx";
import { ALLOWED_TABLES } from "../../services/adminApi.js";

const SELECTABLE_TABLES = [...ALLOWED_TABLES].sort();

export function DatabaseExplorerPage() {
  const [query, setQuery] = useState("");
  const [tableName, setTableName] = useState("profiles");

  const visibleTables = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SELECTABLE_TABLES;
    return SELECTABLE_TABLES.filter((t) => t.toLowerCase().includes(q));
  }, [query]);

  const isAllowed = ALLOWED_TABLES.has(tableName);

  return (
    <div className="d-grid gap-3">
      <div className="admin-card p-3 p-md-4">
        <h4 className="mb-2">Database Explorer</h4>
        <p className="text-muted small mb-3">
          Only tables on the allow-list below can be opened here — this is enforced,
          not just a suggestion.
        </p>
        <SearchBar
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search allowed tables…"
          aria-label="Search tables"
        />
        <div className="d-flex flex-wrap gap-2 mt-3">
          {visibleTables.map((table) => (
            <button
              key={table}
              type="button"
              className={`btn btn-sm ${tableName === table ? "btn-primary" : "btn-outline-secondary"}`}
              onClick={() => setTableName(table)}
            >
              {table}
            </button>
          ))}
          {!visibleTables.length ? (
            <span className="text-muted small align-self-center">No allowed tables match.</span>
          ) : null}
        </div>
      </div>

      {isAllowed ? (
        <ResourceCrudPage
          title={`Table: ${tableName}`}
          tableName={tableName}
          description="Direct CRUD access to selected Supabase table."
        />
      ) : (
        <div className="alert alert-danger mb-0">
          "{tableName}" is not on the allow-list and cannot be opened here.
        </div>
      )}
    </div>
  );
}
