import { useCallback, useEffect, useId, useState } from "react";
import { getPayoutSettings, MAX_MIN_WITHDRAWAL, updateMinWithdrawal } from "../../services/adminApi.js";
import { ConfirmModal } from "../../components/common/ConfirmModal.jsx";
import { formatDateTime, formatInr } from "../../utils/formatters.js";

const wholeRupees = (n) => `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

function validate(raw) {
  if (String(raw).trim() === "") return "Enter an amount.";
  const n = Number(raw);
  if (!Number.isFinite(n)) return "Enter a number.";
  if (!Number.isInteger(n)) return "Use whole rupees (no paise).";
  if (n < 1) return "Minimum must be at least ₹1.";
  if (n > MAX_MIN_WITHDRAWAL) return `Maximum allowed is ${wholeRupees(MAX_MIN_WITHDRAWAL)}.`;
  return "";
}

/**
 * Admin control for the creators' minimum withdrawal amount (payout_settings).
 * The web portal reads it for its wallet page; the database enforces it on every request.
 */
export function MinWithdrawalCard({ config, environment, operator, addLog, addToast }) {
  const inputId = useId();
  const [settings, setSettings] = useState(null);
  const [state, setState] = useState("loading"); // loading | ready | missing | error
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = useCallback(async () => {
    setState("loading");
    setLoadError("");
    try {
      const result = await getPayoutSettings(config);
      setSettings(result);
      setState(result ? "ready" : "missing");
    } catch (err) {
      setLoadError(err.message || "Could not load payout settings");
      setState("error");
    }
  }, [config]);

  useEffect(() => {
    load();
  }, [load]);

  const current = settings?.min_withdrawal_amount;
  const draftError = editing ? validate(draft) : "";
  const unchanged = editing && !draftError && Number(draft) === current;

  const startEditing = () => {
    setDraft(String(current ?? ""));
    setEditing(true);
  };

  const save = async () => {
    const value = Number(draft);
    try {
      const updated = await updateMinWithdrawal(config, value, operator);
      addLog({
        action: "UPDATE",
        entity: "payout_settings",
        environment,
        payload: { min_withdrawal_amount: { from: current, to: updated.min_withdrawal_amount } },
      });
      addToast(`Minimum withdrawal set to ${wholeRupees(updated.min_withdrawal_amount)}`);
      setSettings(updated);
      setEditing(false);
      setConfirmOpen(false);
    } catch (err) {
      // Dialog stays open (it only closes on success) so the admin can retry or cancel.
      addToast(err.message || "Could not update the minimum", "error");
    }
  };

  return (
    <section className="admin-card p-3 p-md-4 min-withdrawal-card" aria-labelledby={`${inputId}-title`}>
      <div className="d-flex flex-wrap align-items-start justify-content-between gap-3">
        <div className="min-w-0">
          <h2 id={`${inputId}-title`} className="h6 mb-1 d-flex align-items-center gap-2">
            <span className="material-icons" style={{ fontSize: 20 }} aria-hidden="true">tune</span>
            Minimum withdrawal
          </h2>
          <p className="text-muted small mb-0">
            Creators need at least this wallet balance to request a payout. Applies to new requests immediately.
          </p>
        </div>

        {state === "ready" && !editing ? (
          <div className="d-flex align-items-center gap-3">
            <div className="text-end">
              <div className="min-withdrawal-card__value">{wholeRupees(current)}</div>
              {settings?.updated_at ? (
                <div className="text-muted" style={{ fontSize: "0.75rem" }}>
                  Updated {formatDateTime(settings.updated_at)}
                  {settings.updated_by ? ` by ${settings.updated_by}` : ""}
                </div>
              ) : null}
            </div>
            <button type="button" className="btn btn-sm btn-outline-primary" onClick={startEditing}>
              <span className="material-icons align-middle me-1" style={{ fontSize: 16 }} aria-hidden="true">edit</span>
              Change
            </button>
          </div>
        ) : null}
      </div>

      {state === "loading" ? (
        <div className="d-flex align-items-center gap-2 text-muted small mt-3" role="status">
          <span className="spinner-border spinner-border-sm" aria-hidden="true" />
          Loading current minimum…
        </div>
      ) : null}

      {state === "missing" ? (
        <div className="alert alert-warning small mt-3 mb-0" role="alert">
          The minimum isn&apos;t set up in the database yet. Apply the migration
          <code className="mx-1">20261024000000_add_payout_settings_min_withdrawal.sql</code>
          (web portal repo), then refresh. Until then the web portal uses its built-in ₹5,000.
        </div>
      ) : null}

      {state === "error" ? (
        <div className="alert alert-danger small mt-3 mb-0 d-flex flex-wrap align-items-center gap-2" role="alert">
          <span>{loadError}</span>
          <button type="button" className="btn btn-sm btn-outline-danger ms-auto" onClick={load}>Retry</button>
        </div>
      ) : null}

      {editing ? (
        <form
          className="min-withdrawal-card__form mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draftError && !unchanged) setConfirmOpen(true);
          }}
          noValidate
        >
          <label htmlFor={inputId} className="form-label small fw-semibold mb-1">New minimum (₹, whole rupees)</label>
          <div className="d-flex flex-wrap align-items-start gap-2">
            <div className="input-group has-validation" style={{ maxWidth: 260 }}>
              <span className="input-group-text">₹</span>
              <input
                id={inputId}
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_MIN_WITHDRAWAL}
                step={1}
                className={`form-control ${draftError ? "is-invalid" : ""}`}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                autoFocus
                aria-describedby={`${inputId}-help`}
              />
              {draftError ? <div className="invalid-feedback">{draftError}</div> : null}
            </div>
            <button type="submit" className="btn btn-sm btn-primary" disabled={Boolean(draftError) || unchanged}>
              Save
            </button>
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
          <div id={`${inputId}-help`} className="form-text">
            Currently {wholeRupees(current)}.{" "}
            {!draftError && !unchanged ? `Creators with less than ${wholeRupees(draft)} won't be able to withdraw.` : null}
          </div>
        </form>
      ) : null}

      <ConfirmModal
        open={confirmOpen}
        title="Change minimum withdrawal?"
        body={
          <>
            Change the minimum from <strong>{current != null ? formatInr(current) : "—"}</strong> to{" "}
            <strong>{draft ? formatInr(Number(draft)) : "—"}</strong>. It applies to every new withdrawal request
            right away — creators with a lower balance won&apos;t be able to withdraw.
          </>
        }
        confirmText="Update minimum"
        variant="primary"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={save}
      />
    </section>
  );
}
