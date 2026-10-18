import { useMemo, useState } from "react";
import { ResourceCrudPage } from "../resources/ResourceCrudPage.jsx";
import { SearchBar } from "../../components/common/SearchBar.jsx";
import { ALLOWED_TABLES, TABLE_SEARCH_COLUMNS } from "../../services/adminApi.js";

const SELECTABLE_TABLES = [...ALLOWED_TABLES].sort();

/** Server-side search columns: text columns, or id columns for id-only tables. */
function searchColumnsFor(tableName) {
  const cfg = TABLE_SEARCH_COLUMNS[tableName];
  if (!cfg) return null;
  if (cfg.text.length) return cfg.text;
  return cfg.uuid.length ? cfg.uuid : null;
}

function searchDescription(tableName) {
  const cfg = TABLE_SEARCH_COLUMNS[tableName];
  if (!cfg) return "Search covers the loaded page only.";
  const parts = [];
  if (cfg.text.length) parts.push(`Searches ${cfg.text.join(", ")} across the whole table`);
  if (cfg.uuid.length) parts.push(`paste a full ID to match ${cfg.uuid.join(", ")}`);
  return `${parts.join(" · ")}.`;
}

export function DatabaseExplorerPage() {
  const [query, setQuery] = useState("");
  const [tableName, setTableName] = useState("profiles");

  const visibleTables = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/\s+/g, "_");
    if (!q) return SELECTABLE_TABLES;
    return SELECTABLE_TABLES.filter((t) => t.toLowerCase().includes(q));
  }, [query]);

  const isAllowed = ALLOWED_TABLES.has(tableName);

  return (
    <div className="d-grid gap-3">
      <div className="admin-card p-3 p-md-4">
        <p className="text-muted small mb-3">
          Only tables on the allow-list below can be opened here — this is enforced,
          not just a suggestion.
        </p>
        <SearchBar
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter tables…"
          aria-label="Filter tables"
        />
        <div className="d-flex flex-wrap gap-2 mt-3">
          {visibleTables.map((table) => (
            <button
              key={table}
              type="button"
              className={`btn btn-sm ${tableName === table ? "btn-primary" : "btn-outline-secondary"}`}
              onClick={() => setTableName(table)}
              aria-pressed={tableName === table}
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
          // Remount per table so search text, page and sort never leak between tables.
          key={tableName}
          title={`Table: ${tableName}`}
          tableName={tableName}
          description={`Direct CRUD access to the selected table. ${searchDescription(tableName)}`}
          searchColumns={searchColumnsFor(tableName)}
        />
      ) : (
        <div className="alert alert-danger mb-0">
          "{tableName}" is not on the allow-list and cannot be opened here.
        </div>
      )}
    </div>
  );
}
