import { useCallback, useEffect, useMemo, useState } from "react";
import { listTableRows, updateTableRow } from "../../services/adminApi.js";
import { useAudit } from "../../app/providers/AuditProvider.jsx";
import { useEnvironment } from "../../app/providers/EnvironmentProvider.jsx";

const TX_STATUSES = ["created", "paid", "failed", "refunded"];

function rupeesFromRow(row) {
  const paise = row.amount_total_paise ?? row.amount_total;
  if (paise != null && paise !== "") return Number(paise) / 100;
  const a = row.amount;
  if (a != null && a !== "") return Number(a);
  return 0;
}

export function TransactionControlPanel() {
  const { config, environment } = useEnvironment();
  const { addLog } = useAudit();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { rows: data } = await listTableRows(config, "transactions", 200);
      setRows(data || []);
    } catch (err) {
      setError(err.message || "Failed to load transactions");
    } finally {
      setLoading(false);
    }
  }, [config]);

  useEffect(() => {
    load();
  }, [load]);

  const fmt = useMemo(
    () => (value) =>
      `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Number(value) || 0)}`,
    []
  );

  const saveRow = async (row, nextStatus, adminNote) => {
    setSavingId(row.id);
    setError("");
    try {
      const updated = await updateTableRow(config, "transactions", row.id, {
        status: nextStatus,
        admin_note: adminNote || null,
      });
      addLog({
        action: "UPDATE",
        entity: "transactions",
        environment,
        payload: updated,
      });
      await load();
    } catch (err) {
      setError(err.message || "Update failed");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="admin-card p-3 p-md-4">
      <h5 className="mb-2">Control payments</h5>
      <p className="text-muted small mb-3">
        Update transaction status and optional admin notes (e.g. refunds, manual reconciliation). Use with care;
        financial records should match Razorpay.
      </p>
      {error ? <div className="alert alert-danger py-2">{error}</div> : null}
      {loading ? <div className="text-muted">Loading transactions…</div> : null}
      {!loading && rows.length === 0 ? (
        <div className="text-muted">No transactions found.</div>
      ) : null}
      {!loading && rows.length > 0 ? (
        <div className="admin-table-shell">
          <div className="admin-table-scroll table-wrap">
            <table className="table admin-table mb-0">
              <thead>
                <tr>
                  <th className="admin-table-th admin-table-th--index">#</th>
                  <th className="admin-table-th">Created</th>
                  <th className="admin-table-th">Learner</th>
                  <th className="admin-table-th">Mentor</th>
                  <th className="admin-table-th">Amount</th>
                  <th className="admin-table-th">Status</th>
                  <th className="admin-table-th">Admin note</th>
                  <th className="admin-table-th admin-table-th--actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <TransactionControlRow
                    key={row.id}
                    row={row}
                    rowIndex={index}
                    fmt={fmt}
                    disabled={savingId === row.id}
                    onSave={saveRow}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="admin-table-footer">
            <span>{rows.length} transaction{rows.length === 1 ? "" : "s"}</span>
          </div>
        </div>
      ) : null}
      <div className="mt-2">
        <button type="button" className="btn btn-sm btn-outline-primary" onClick={load} disabled={loading}>
          Refresh list
        </button>
      </div>
    </div>
  );
}

function TransactionControlRow({ row, rowIndex, fmt, disabled, onSave }) {
  const [status, setStatus] = useState(String(row.status || "created"));
  const [note, setNote] = useState(String(row.admin_note || ""));

  useEffect(() => {
    setStatus(String(row.status || "created"));
    setNote(String(row.admin_note || ""));
  }, [row.id, row.status, row.admin_note]);

  const dirty =
    status !== String(row.status || "created") || note !== String(row.admin_note || "");

  return (
    <tr className="admin-table-row">
      <td className="admin-table-td admin-table-td--index text-muted">{rowIndex + 1}</td>
      <td className="admin-table-td text-muted small">{row.created_at ? String(row.created_at).slice(0, 19) : "—"}</td>
      <td className="admin-table-td small text-truncate" style={{ maxWidth: 120 }} title={row.learner_id}>
        {row.learner_id ? String(row.learner_id).slice(0, 8) + "…" : "—"}
      </td>
      <td className="admin-table-td small text-truncate" style={{ maxWidth: 120 }} title={row.mentor_id}>
        {row.mentor_id ? String(row.mentor_id).slice(0, 8) + "…" : "—"}
      </td>
      <td className="admin-table-td fw-semibold">{fmt(rupeesFromRow(row))}</td>
      <td className="admin-table-td">
        <select
          className="form-select form-select-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          disabled={disabled}
        >
          {TX_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </td>
      <td className="admin-table-td">
        <input
          type="text"
          className="form-control form-control-sm"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional"
          disabled={disabled}
        />
      </td>
      <td className="admin-table-td admin-table-td--actions">
        <button
          type="button"
          className="btn btn-sm btn-primary admin-table-action"
          disabled={disabled || !dirty}
          onClick={() => onSave(row, status, note)}
        >
          Save
        </button>
      </td>
    </tr>
  );
}
