import { useCallback, useEffect, useState, useMemo } from "react";
import {
  createTableRow,
  listTableRows,
  updateTableRow,
} from "../../services/adminApi.js";
import { useEnvironment } from "../../app/providers/EnvironmentProvider.jsx";
import { useToast } from "../../app/providers/ToastProvider.jsx";
import { useAudit } from "../../app/providers/AuditProvider.jsx";

function fmt(value) {
  return `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Number(value) || 0)}`;
}

export function PlatformFeesPage() {
  const { config, environment } = useEnvironment();
  const { addToast } = useToast();
  const { addLog } = useAudit();

  const [globalRule, setGlobalRule]   = useState(null);
  const [loading, setLoading]         = useState(false);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState("");

  const [platformFee, setPlatformFee] = useState("5");
  const [gst, setGst]                 = useState("18");

  // Real-time calculator
  const [sessionPrice, setSessionPrice] = useState("1000");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await listTableRows(config, "platform_fee_rules", { limit: 500 });
      const global = (result.rows || [])[0] || null;
      setGlobalRule(global);
      if (global) {
        setPlatformFee(String(global.platform_fee_percent ?? "5"));
        setGst(String(global.gst_percent ?? "18"));
      }
    } catch (err) {
      setError(err.message || "Failed to load platform fee rules.");
    } finally {
      setLoading(false);
    }
  }, [config]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const payload = {
        platform_fee_percent: Number(platformFee),
        gst_percent: Number(gst),
        is_active: true,
        notes: "Global default",
      };
      if (globalRule?.id) {
        const updated = await updateTableRow(config, "platform_fee_rules", globalRule.id, payload);
        addLog({ action: "UPDATE", entity: "platform_fee_rules", environment, payload: updated });
        addToast("Platform fees updated");
      } else {
        const created = await createTableRow(config, "platform_fee_rules", payload);
        addLog({ action: "CREATE", entity: "platform_fee_rules", environment, payload: created });
        addToast("Platform fee rule created");
      }
      await load();
    } catch (err) {
      setError(err.message || "Failed to save");
      addToast(err.message || "Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  // Real-time fee breakdown
  // Mentor earns the full session price.
  // Platform fee + GST are added on top and paid by the learner.
  const calc = useMemo(() => {
    const price        = Number(sessionPrice) || 0;
    const fee          = price * (Number(platformFee) / 100);   // e.g. ₹500 × 5% = ₹25
    const gstOnFee     = fee * (Number(gst) / 100);             // e.g. ₹25 × 18% = ₹4.50
    const learner      = price + fee + gstOnFee;                // total learner pays
    const mentor       = price;                                  // mentor gets full session price
    const platformEarns = fee + gstOnFee;                       // platform collects fee + GST
    return { price, fee, gstOnFee, learner, mentor, platformEarns };
  }, [sessionPrice, platformFee, gst]);

  return (
    <div className="d-grid gap-3">

      {/* Fee Settings */}
      <div className="admin-card p-3 p-md-4">
        <h4 className="mb-1">Platform Fee Settings</h4>
        <p className="text-muted small mb-4">
          Global rates applied to every session in real-time. Changes take effect immediately for all new transactions.
        </p>

        {error   ? <div className="alert alert-danger">{error}</div>   : null}
        {loading ? <div className="d-flex align-items-center gap-2 text-muted"><div className="spinner-border spinner-border-sm" />Loading...</div> : null}

        {!loading && (
          <>
            <div className="row g-3 align-items-end">
              <div className="col-12 col-sm-4">
                <label className="form-label fw-semibold">Platform Fee (%)</label>
                <div className="input-group">
                  <input
                    type="number"
                    className="form-control"
                    min="0"
                    max="100"
                    step="0.1"
                    value={platformFee}
                    onChange={(e) => setPlatformFee(e.target.value)}
                  />
                  <span className="input-group-text">%</span>
                </div>
                <div className="form-text">Cut taken by the platform from each session</div>
              </div>

              <div className="col-12 col-sm-4">
                <label className="form-label fw-semibold">GST on Platform Fee (%)</label>
                <div className="input-group">
                  <input
                    type="number"
                    className="form-control"
                    min="0"
                    max="100"
                    step="0.1"
                    value={gst}
                    onChange={(e) => setGst(e.target.value)}
                  />
                  <span className="input-group-text">%</span>
                </div>
                <div className="form-text">GST applied on top of the platform fee</div>
              </div>

              <div className="col-12 col-sm-4">
                <button
                  className="btn btn-primary w-100"
                  onClick={save}
                  disabled={saving}
                >
                  {saving ? "Saving..." : globalRule ? "Update Rates" : "Save Rates"}
                </button>
                {globalRule && (
                  <div className="form-text text-center">
                    Last saved rule ID: {globalRule.id?.slice(0, 8)}…
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Real-time Calculator */}
      <div className="admin-card p-3 p-md-4">
        <h5 className="mb-1">Real-time Fee Calculator</h5>
        <p className="text-muted small mb-3">
          Enter a session price to preview how the current rates break down.
        </p>

        <div className="col-12 col-sm-4 mb-4">
          <label className="form-label fw-semibold">Session Price</label>
          <div className="input-group">
            <span className="input-group-text">₹</span>
            <input
              type="number"
              className="form-control"
              min="0"
              value={sessionPrice}
              onChange={(e) => setSessionPrice(e.target.value)}
              placeholder="1000"
            />
          </div>
        </div>

        <div className="row g-3">
          {/* Breakdown card */}
          <div className="col-12 col-md-6">
            <div className="rounded p-3 d-grid gap-2" style={{ background: "var(--admin-surface-2)", border: "1px solid var(--admin-border)" }}>
              <div className="d-flex justify-content-between">
                <span className="text-muted small">Session fee (mentor earns)</span>
                <span className="fw-semibold">{fmt(calc.price)}</span>
              </div>
              <div className="d-flex justify-content-between">
                <span className="text-muted small">Platform fee ({platformFee}%)</span>
                <span className="text-warning">+ {fmt(calc.fee)}</span>
              </div>
              <div className="d-flex justify-content-between">
                <span className="text-muted small">GST ({gst}% on platform fee)</span>
                <span className="text-warning">+ {fmt(calc.gstOnFee)}</span>
              </div>
              <hr style={{ borderColor: "var(--admin-border)", margin: "4px 0" }} />
              <div className="d-flex justify-content-between">
                <span className="fw-semibold">Total payable (learner pays)</span>
                <span className="fw-bold" style={{ color: "#6366f1" }}>{fmt(calc.learner)}</span>
              </div>
              <hr style={{ borderColor: "var(--admin-border)", margin: "4px 0" }} />
              <div className="d-flex justify-content-between">
                <span className="text-muted small">Mentor receives</span>
                <span className="fw-semibold" style={{ color: "var(--admin-success)" }}>{fmt(calc.mentor)}</span>
              </div>
              <div className="d-flex justify-content-between">
                <span className="text-muted small">Platform earns</span>
                <span className="fw-semibold" style={{ color: "var(--admin-accent-2)" }}>{fmt(calc.platformEarns)}</span>
              </div>
            </div>
          </div>

          {/* Summary stats */}
          <div className="col-12 col-md-6 d-grid gap-2">
            {[
              { label: "Learner pays",     value: calc.learner,       pct: calc.learner ? 100 : 0,                                                    color: "#6366f1" },
              { label: "Mentor receives",  value: calc.mentor,        pct: calc.learner ? (calc.mentor / calc.learner * 100).toFixed(1) : 0,         color: "var(--admin-success)" },
              { label: "Platform revenue", value: calc.fee,           pct: calc.learner ? (calc.fee / calc.learner * 100).toFixed(1) : 0,            color: "var(--admin-accent-2)" },
              { label: "GST collected",    value: calc.gstOnFee,      pct: calc.learner ? (calc.gstOnFee / calc.learner * 100).toFixed(1) : 0,       color: "var(--admin-muted)" },
            ].map((item) => (
              <div key={item.label} className="rounded p-2 px-3" style={{ background: "var(--admin-surface-2)", border: "1px solid var(--admin-border)" }}>
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <span className="small text-muted">{item.label}</span>
                  <span className="fw-semibold" style={{ color: item.color }}>{fmt(item.value)}</span>
                </div>
                <div className="progress" style={{ height: 4 }}>
                  <div className="progress-bar" style={{ width: `${item.pct}%`, background: item.color }} />
                </div>
                <div className="text-muted" style={{ fontSize: "0.7rem", marginTop: 2 }}>{item.pct}% of total payable</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
