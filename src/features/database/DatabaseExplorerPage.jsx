import { useMemo, useState } from "react";
import { ResourceCrudPage } from "../resources/ResourceCrudPage.jsx";
import { SearchBar } from "../../components/common/SearchBar.jsx";
import { HScroll } from "../../components/common/HScroll.jsx";

const SUGGESTED_TABLES = [
  "profiles",
  "bookings",
  "mentor_profiles",
  "user_reports",
  "availability_slots",
  "mentor_wallets",
  "wallet_transactions",
];

export function DatabaseExplorerPage() {
  const [tableName, setTableName] = useState("profiles");

  const visibleTables = useMemo(() => {
    const q = tableName.trim().toLowerCase();
    if (!q) return SUGGESTED_TABLES;
    return SUGGESTED_TABLES.filter((t) => t.toLowerCase().includes(q));
  }, [tableName]);

  return (
    <div className="d-grid gap-3">
      <div className="admin-card p-3 p-md-4">
        <h4 className="mb-2">Database Explorer</h4>
        <p className="text-muted small mb-3">
          Full table-level access. Type a table name or pick a shortcut below.
        </p>
        <SearchBar
          value={tableName}
          onChange={(e) => setTableName(e.target.value)}
          placeholder="Search or enter table name…"
          aria-label="Table name"
        />
        <HScroll className="mt-3">
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
            <span className="text-muted small align-self-center">No suggested tables match.</span>
          ) : null}
        </HScroll>
      </div>

      <ResourceCrudPage
        title={`Table: ${tableName}`}
        tableName={tableName}
        description="Direct CRUD access to selected Supabase table."
      />
    </div>
  );
}
