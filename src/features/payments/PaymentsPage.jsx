import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { ResourceCrudPage } from "../resources/ResourceCrudPage.jsx";
import { listTableRows } from "../../services/adminApi.js";
import { useEnvironment } from "../../app/providers/EnvironmentProvider.jsx";
import { TransactionControlPanel } from "./TransactionControlPanel.jsx";

function transactionRupees(row) {
  const paise = row.amount_total_paise ?? row.amount_total;
  if (paise != null && paise !== "") return Number(paise) / 100;
  const a = row.amount;
  if (a != null && a !== "") return Number(a);
  return 0;
}

const PAYMENT_RESOURCES = [
  {
    id: "transactions",
    label: "Transactions",
    tableName: "transactions",
    description: "Razorpay and booking payment lifecycle records.",
    compactColumns: ["learner_id", "mentor_id", "amount_total_paise", "status", "admin_note"],
    filterFields: [
      { key: "status", label: "Status", options: ["all", "pending", "created", "initiated", "completed", "failed"] },
    ],
    searchColumns: ["status", "admin_note"],
  },
  {
    id: "wallets",
    label: "Mentor Wallets",
    tableName: "mentor_wallets",
    description: "Mentor balances, total earned, and withdrawals.",
    compactColumns: ["id", "balance", "total_earned", "total_withdrawn"],
    // No real text columns to search server-side here — falls back to a
    // clearly-labeled "this page only" client-side search.
  },
  {
    id: "earnings",
    label: "Earnings",
    tableName: "earnings",
    description: "Session earnings linked to mentors and bookings.",
    compactColumns: ["mentor_id", "booking_id", "amount", "status"],
    filterFields: [
      { key: "status", label: "Status", options: ["all", "pending", "unpaid", "paid"] },
    ],
    searchColumns: ["status"],
  },
  {
    id: "withdrawals",
    label: "Withdrawals",
    tableName: "withdrawal_requests",
    description: "Mentor payout requests — view, edit status, add admin notes.",
    compactColumns: ["mentor_id", "amount", "status", "admin_note"],
    filterFields: [
      { key: "status", label: "Status", options: ["all", "pending", "approved", "rejected"] },
    ],
    searchColumns: ["status", "admin_note"],
  },
];

export function PaymentsPage() {
  const { config: envConfig } = useEnvironment();
  const analysisRef = useRef(null);
  const [active, setActive] = useState(PAYMENT_RESOURCES[0].id);
  const [transactions, setTransactions] = useState([]);
  const [earnings, setEarnings] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const config = PAYMENT_RESOURCES.find((item) => item.id === active) || PAYMENT_RESOURCES[0];

  useEffect(() => {
    const loadAnalysis = async () => {
      setAnalysisLoading(true);
      setAnalysisError("");
      try {
        const [tx, earn, wal] = await Promise.all([
          listTableRows(envConfig, "transactions", 1000),
          listTableRows(envConfig, "earnings", 1000),
          listTableRows(envConfig, "mentor_wallets", 1000),
        ]);
        setTransactions(tx.rows || []);
        setEarnings(earn.rows || []);
        setWallets(wal.rows || []);
      } catch (error) {
        setAnalysisError(error.message || "Failed to load payment analysis");
      } finally {
        setAnalysisLoading(false);
      }
    };

    loadAnalysis();
  }, [envConfig]);

  const {
    totalRevenue,
    totalEarnings,
    pendingPayments,
    pendingEarnings,
    statusTotals,
    pieSegments,
  } = useMemo(() => {
    const toNumber = (value) => Number(value) || 0;

    const revenue = transactions.reduce((sum, row) => sum + transactionRupees(row), 0);
    const earningsTotal = earnings.reduce((sum, row) => sum + toNumber(row.amount), 0);

    const pendingTx = transactions
      .filter((row) => ["pending", "created", "initiated"].includes(String(row.status || "").toLowerCase()))
      .reduce((sum, row) => sum + transactionRupees(row), 0);

    const pendingEarn = earnings
      .filter((row) => ["pending", "unpaid"].includes(String(row.status || "").toLowerCase()))
      .reduce((sum, row) => sum + toNumber(row.amount), 0);

    const grouped = {};
    transactions.forEach((row) => {
      const status = String(row.status || "unknown").toLowerCase();
      grouped[status] = (grouped[status] || 0) + transactionRupees(row);
    });
    const statusRows = Object.entries(grouped)
      .map(([status, amount]) => ({ status, amount }))
      .sort((a, b) => b.amount - a.amount);

    const pieData = [
      { label: "Revenue", value: revenue, color: "#0d6efd" },
      { label: "Earnings", value: earningsTotal, color: "#198754" },
      { label: "Pending", value: pendingTx + pendingEarn, color: "#ffc107" },
    ];

    return {
      totalRevenue: revenue,
      totalEarnings: earningsTotal,
      pendingPayments: pendingTx,
      pendingEarnings: pendingEarn,
      statusTotals: statusRows,
      pieSegments: pieData,
    };
  }, [transactions, earnings]);

  const fmt = (value) =>
    `₹${new Intl.NumberFormat("en-IN", {
      maximumFractionDigits: 2,
    }).format(Number(value) || 0)}`;

  const pieStyle = useMemo(() => {
    const total = pieSegments.reduce((sum, segment) => sum + segment.value, 0) || 1;
    const { parts } = pieSegments.reduce(
      (acc, segment) => {
        const start = (acc.cursor / total) * 360;
        const nextCursor = acc.cursor + segment.value;
        const end = (nextCursor / total) * 360;
        return {
          cursor: nextCursor,
          parts: [...acc.parts, `${segment.color} ${start}deg ${end}deg`],
        };
      },
      { cursor: 0, parts: [] }
    );
    return { background: `conic-gradient(${parts.join(", ")})` };
  }, [pieSegments]);

  const maxStatusAmount = Math.max(...statusTotals.map((item) => item.amount), 1);

  useEffect(() => {
    if (analysisLoading || !analysisRef.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        ".payments-kpi",
        { opacity: 0, y: 14, scale: 0.97 },
        { opacity: 1, y: 0, scale: 1, duration: 0.35, stagger: 0.06, ease: "power2.out" }
      );

      gsap.utils.toArray(".payment-status-bar").forEach((bar) => {
        const target = Number(bar.getAttribute("data-width") || 0);
        gsap.fromTo(
          bar,
          { width: "0%" },
          { width: `${target}%`, duration: 0.7, ease: "power3.out" }
        );
      });

      gsap.fromTo(
        ".payments-pie",
        { opacity: 0, scale: 0.9, rotate: -20 },
        { opacity: 1, scale: 1, rotate: 0, duration: 0.65, ease: "power3.out" }
      );
      gsap.fromTo(
        ".payments-legend-item",
        { opacity: 0, x: 10 },
        { opacity: 1, x: 0, duration: 0.35, stagger: 0.05, ease: "power2.out", delay: 0.15 }
      );
    }, analysisRef);

    return () => ctx.revert();
  }, [analysisLoading, totalRevenue, totalEarnings, pendingPayments, pendingEarnings, statusTotals, pieStyle]);

  return (
    <div className="d-grid gap-3">
      <div className="admin-card p-3">
        <h4 className="mb-2">Payments</h4>
        <p className="text-muted mb-3">
          Manage transactions, wallets, earnings, and withdrawal requests. Use Control payments when the
          Transactions tab is active.
        </p>
        <div className="d-flex flex-wrap gap-2">
          {PAYMENT_RESOURCES.map((item) => (
            <button
              key={item.id}
              className={`btn btn-sm ${active === item.id ? "btn-primary" : "btn-outline-secondary"}`}
              onClick={() => setActive(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="admin-card p-3 p-md-4" ref={analysisRef}>
        <h5 className="mb-3">Payments Analysis</h5>
        {analysisError ? <div className="alert alert-danger">{analysisError}</div> : null}
        {analysisLoading ? <div className="text-muted">Loading analysis...</div> : null}

        {!analysisLoading ? (
          <>
            <div className="row g-3 mb-4">
              <div className="col-12 col-md-6 col-xl-3">
                <div className="border rounded p-3 h-100 payments-kpi">
                  <div className="text-muted small">Total Revenue</div>
                  <div className="h4 mb-0">{fmt(totalRevenue)}</div>
                </div>
              </div>
              <div className="col-12 col-md-6 col-xl-3">
                <div className="border rounded p-3 h-100 payments-kpi">
                  <div className="text-muted small">Total Earning</div>
                  <div className="h4 mb-0">{fmt(totalEarnings)}</div>
                </div>
              </div>
              <div className="col-12 col-md-6 col-xl-3">
                <div className="border rounded p-3 h-100 payments-kpi">
                  <div className="text-muted small">Payment Pending</div>
                  <div className="h4 mb-0">{fmt(pendingPayments)}</div>
                </div>
              </div>
              <div className="col-12 col-md-6 col-xl-3">
                <div className="border rounded p-3 h-100 payments-kpi">
                  <div className="text-muted small">Earning Pending</div>
                  <div className="h4 mb-0">{fmt(pendingEarnings)}</div>
                </div>
              </div>
            </div>

            <div className="row g-4">
              <div className="col-12 col-lg-7">
                <h6 className="mb-3">Payments by Status</h6>
                <div className="d-grid gap-2">
                  {statusTotals.length ? (
                    statusTotals.map((item) => (
                      <div key={item.status}>
                        <div className="d-flex justify-content-between small mb-1">
                          <span className="text-capitalize">{item.status}</span>
                          <span>{fmt(item.amount)}</span>
                        </div>
                        <div className="progress" role="progressbar" aria-label={item.status}>
                          <div
                            className="progress-bar payment-status-bar"
                            data-width={(item.amount / maxStatusAmount) * 100}
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-muted">No payment status data available.</div>
                  )}
                </div>
              </div>

              <div className="col-12 col-lg-5">
                <h6 className="mb-3">Revenue Split (Pie)</h6>
                <div className="d-flex align-items-center gap-3 flex-wrap">
                  <div
                    className="rounded-circle border payments-pie"
                    style={{ width: 180, height: 180, ...pieStyle }}
                  />
                  <div className="d-grid gap-2">
                    {pieSegments.map((segment) => (
                      <div key={segment.label} className="d-flex align-items-center gap-2 payments-legend-item">
                        <span
                          style={{
                            width: 12,
                            height: 12,
                            borderRadius: "50%",
                            backgroundColor: segment.color,
                            display: "inline-block",
                          }}
                        />
                        <span className="small">
                          {segment.label}: <strong>{fmt(segment.value)}</strong>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-3 small text-muted">
              Wallet records loaded: {wallets.length}
            </div>
          </>
        ) : null}
      </div>

      {active === "transactions" ? <TransactionControlPanel /> : null}

      <ResourceCrudPage
        title={config.label}
        tableName={config.tableName}
        description={config.description}
        compactColumns={config.compactColumns}
        filterFields={config.filterFields}
        searchColumns={config.searchColumns}
      />
    </div>
  );
}
