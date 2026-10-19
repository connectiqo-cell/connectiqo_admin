import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ResourceCrudPage } from "../resources/ResourceCrudPage.jsx";
import { getPaymentSummary, updateTableRow } from "../../services/adminApi.js";
import { useEnvironment } from "../../app/providers/EnvironmentProvider.jsx";
import { useAudit } from "../../app/providers/AuditProvider.jsx";
import { useToast } from "../../app/providers/ToastProvider.jsx";
import { Badge } from "../../components/common/CellValue.jsx";
import { formatInr, statusTone } from "../../utils/formatters.js";
import { TransactionStatusModal, TX_STATUSES } from "./TransactionStatusModal.jsx";

const PAYMENT_RESOURCES = [
  {
    id: "transactions",
    label: "Transactions",
    tableName: "transactions",
    description: "Razorpay checkout records. Use the ⇄ action to correct a status or add a note.",
    compactColumns: ["learner_id", "mentor_id", "amount_total_paise", "status", "created_at", "admin_note"],
    filterFields: [{ key: "status", label: "Status", options: ["all", ...TX_STATUSES] }],
    searchColumns: ["status", "admin_note", "razorpay_order_id", "razorpay_payment_id"],
  },
  {
    id: "wallets",
    label: "Creator wallets",
    tableName: "mentor_wallets",
    description: "Creator balances, total earned, and withdrawals.",
    compactColumns: ["id", "balance", "total_earned", "total_withdrawn", "updated_at"],
  },
  {
    id: "earnings",
    label: "Earnings",
    tableName: "earnings",
    description: "Session earnings credited to creators.",
    compactColumns: ["mentor_id", "amount", "status", "source", "created_at"],
    filterFields: [{ key: "status", label: "Status", options: ["all", "pending", "completed", "paid", "unpaid"] }],
    searchColumns: ["status", "source", "notes"],
  },
];

const plural = (n, word) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;

function SummaryCard({ label, value, icon, tone = "accent", note, title }) {
  return (
    <div className="col-12 col-sm-6 col-xl-3">
      <div className={`admin-card admin-kpi-panel dashboard-kpi-card h-100 payments-kpi payments-kpi--${tone}`} title={title}>
        <div className="dashboard-kpi-head">
          <div className="admin-kpi-label">{label}</div>
          <span className="dashboard-kpi-chip" aria-hidden="true">
            <span className="material-icons">{icon}</span>
          </span>
        </div>
        <div className="dashboard-kpi-value">{value}</div>
        <small className="text-muted d-block">{note}</small>
      </div>
    </div>
  );
}

function SummarySkeleton() {
  return (
    <div className="row g-3">
      {[0, 1, 2, 3].map((i) => (
        <div className="col-12 col-sm-6 col-xl-3" key={i}>
          <div className="admin-card admin-kpi-panel p-3 dashboard-skeleton">
            <div className="dashboard-skeleton__line dashboard-skeleton__line--sm" />
            <div className="dashboard-skeleton__line dashboard-skeleton__line--lg mt-3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Collected money split into mentor share vs platform fee — real parts of one whole. */
function CollectedSplit({ collected }) {
  const total = collected.total || 0;
  const parts = [
    { key: "mentor", label: "Creator share", value: collected.mentor, className: "split--mentor" },
    { key: "platform", label: "Platform fees", value: collected.platform, className: "split--platform" },
  ];
  const other = Math.max(0, total - collected.mentor - collected.platform);
  if (other > 0.005) parts.push({ key: "other", label: "Other / unallocated", value: other, className: "split--other" });

  return (
    <section className="admin-card p-3 p-md-4 h-100">
      <h2 className="h6 mb-1">Where collected money goes</h2>
      <p className="text-muted small mb-3">Split of {formatInr(total)} from paid transactions.</p>
      {total > 0 ? (
        <>
          <div className="split-bar" role="img" aria-label={parts.map((p) => `${p.label} ${formatInr(p.value)}`).join(", ")}>
            {parts.map((p) => (
              <span key={p.key} className={`split-bar__part ${p.className}`} style={{ width: `${(p.value / total) * 100}%` }} />
            ))}
          </div>
          <ul className="split-legend">
            {parts.map((p) => (
              <li key={p.key}>
                <span className={`split-legend__dot ${p.className}`} aria-hidden="true" />
                <span className="split-legend__label">{p.label}</span>
                <span className="split-legend__value">{formatInr(p.value)}</span>
                <span className="split-legend__pct">{((p.value / total) * 100).toFixed(1)}%</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-muted small mb-0">No paid transactions yet.</p>
      )}
    </section>
  );
}

function StatusBreakdown({ byStatus }) {
  const max = Math.max(...byStatus.map((s) => s.total), 1);
  return (
    <section className="admin-card p-3 p-md-4 h-100">
      <h2 className="h6 mb-1">Transactions by status</h2>
      <p className="text-muted small mb-3">Only “paid” counts as money received.</p>
      {byStatus.length ? (
        <ul className="status-bars">
          {byStatus.map((s) => (
            <li key={s.status}>
              <div className="status-bars__row">
                <Badge tone={statusTone(s.status)}>{s.status}</Badge>
                <span className="text-muted small">{plural(s.count, "transaction")}</span>
                <span className="status-bars__amount">{formatInr(s.total)}</span>
              </div>
              <div className="status-bars__track">
                <span className={`status-bars__fill tone-${statusTone(s.status)}`} style={{ width: `${(s.total / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted small mb-0">No transactions yet.</p>
      )}
    </section>
  );
}

export function PaymentsPage() {
  const { config, environment } = useEnvironment();
  const { addLog } = useAudit();
  const { addToast } = useToast();
  const [active, setActive] = useState(PAYMENT_RESOURCES[0].id);
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState("");
  const [editingTx, setEditingTx] = useState(null); // { row, reload, people }
  const resource = PAYMENT_RESOURCES.find((item) => item.id === active) || PAYMENT_RESOURCES[0];

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError("");
    try {
      setSummary(await getPaymentSummary(config));
    } catch (error) {
      setSummaryError(error.message || "Failed to load payment summary");
    } finally {
      setSummaryLoading(false);
    }
  }, [config]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const saveTransaction = async (changes) => {
    const { row, reload } = editingTx;
    try {
      const updated = await updateTableRow(config, "transactions", row.id, changes);
      addLog({ action: "UPDATE", entity: "transactions", environment, payload: updated });
      addToast(changes.status !== row.status ? `Transaction marked “${changes.status}”` : "Transaction note saved");
      setEditingTx(null);
      await Promise.all([reload(), loadSummary()]);
    } catch (err) {
      addToast(err.message || "Update failed", "error");
      throw err;
    }
  };

  const tx = summary?.transactions;

  return (
    <div className="d-grid gap-3">
      {/* Overview */}
      <section aria-labelledby="payments-overview">
        <div className="dashboard-section-head mb-2">
          <h2 id="payments-overview" className="h5 mb-0">Overview</h2>
          <button type="button" className="btn btn-sm btn-outline-primary d-inline-flex align-items-center gap-1" onClick={loadSummary} disabled={summaryLoading}>
            <span className={`material-icons ${summaryLoading ? "is-spinning" : ""}`} style={{ fontSize: 18 }} aria-hidden="true">refresh</span>
            Refresh
          </button>
        </div>
        {summaryError ? <div className="alert alert-danger">{summaryError}</div> : null}
        {summaryLoading && !summary ? (
          <SummarySkeleton />
        ) : summary ? (
          <div className="row g-3">
            <SummaryCard
              label="Collected"
              icon="payments"
              tone="success"
              value={formatInr(tx.collected.total)}
              note={plural(tx.collected.count, "paid transaction")}
              title="Sum of transactions with status paid/completed"
            />
            <SummaryCard
              label="Platform revenue"
              icon="account_balance"
              value={formatInr(tx.collected.platform)}
              note="Platform fees from paid transactions"
            />
            <SummaryCard
              label="Owed to creators"
              icon="account_balance_wallet"
              tone="info"
              value={formatInr(summary.wallets.balance)}
              note={`Wallet balances · ${formatInr(summary.wallets.withdrawn)} withdrawn`}
              title={`${plural(summary.wallets.count, "wallet")}. Pending withdrawal requests: ${formatInr(summary.withdrawals.pending.total)}`}
            />
            <SummaryCard
              label="Unpaid checkouts"
              icon="hourglass_empty"
              tone="warning"
              value={formatInr(tx.unpaid.total)}
              note={`${plural(tx.unpaid.count, "checkout")} never completed — not money received`}
            />
          </div>
        ) : null}
      </section>

      {summary ? (
        <div className="row g-3">
          <div className="col-12 col-lg-6">
            <CollectedSplit collected={tx.collected} />
          </div>
          <div className="col-12 col-lg-6">
            <StatusBreakdown byStatus={tx.byStatus} />
          </div>
          <div className="col-12">
            <p className="text-muted small mb-0">
              Based on all {plural(tx.count, "transaction")}, {plural(summary.earnings.count, "earning")} and{" "}
              {plural(summary.wallets.count, "wallet")}. Creator earnings: {formatInr(summary.earnings.completed.total)} completed,{" "}
              {formatInr(summary.earnings.pending.total)} pending. Payout requests are handled on the{" "}
              <Link to="/withdrawals">Withdrawals</Link> page.
            </p>
          </div>
        </div>
      ) : null}

      {/* Records */}
      <div className="payments-tabs" role="tablist" aria-label="Payment records">
        {PAYMENT_RESOURCES.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active === item.id}
            className={`payments-tab ${active === item.id ? "is-active" : ""}`}
            onClick={() => setActive(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <ResourceCrudPage
        key={resource.id}
        title={resource.label}
        tableName={resource.tableName}
        description={resource.description}
        compactColumns={resource.compactColumns}
        filterFields={resource.filterFields}
        searchColumns={resource.searchColumns}
        renderExtraActions={
          resource.id === "transactions"
            ? (row, reload, people) => (
                <button
                  type="button"
                  className="table-action table-action--warning"
                  onClick={() => setEditingTx({ row, reload, people })}
                  title="Update status / note"
                  aria-label="Update transaction status"
                >
                  <span className="material-icons" aria-hidden="true">sync_alt</span>
                </button>
              )
            : null
        }
      />

      <TransactionStatusModal
        open={Boolean(editingTx)}
        transaction={editingTx?.row}
        people={editingTx?.people}
        onClose={() => setEditingTx(null)}
        onSave={saveTransaction}
      />
    </div>
  );
}
