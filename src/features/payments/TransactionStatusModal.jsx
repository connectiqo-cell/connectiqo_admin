import { useEffect, useId, useState } from "react";
import { useModalAnimation } from "../../hooks/useModalAnimation.js";
import { formatDateTime, formatPaise } from "../../utils/formatters.js";

/** Single source of truth for transaction statuses (filter + status editor). */
export const TX_STATUSES = ["pending", "created", "initiated", "paid", "completed", "failed", "refunded"];

/**
 * Edit a transaction's status and admin note (refunds, manual reconciliation).
 * `onSave({ status, admin_note })` should throw on failure so the dialog stays open.
 */
export function TransactionStatusModal({ open, transaction, people, onClose, onSave }) {
  const [status, setStatus] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const { isRendered, backdropRef, dialogRef } = useModalAnimation(open, saving ? null : onClose);
  const titleId = useId();

  useEffect(() => {
    if (transaction) {
      setStatus(String(transaction.status || "created"));
      setNote(String(transaction.admin_note || ""));
    }
  }, [transaction, open]);

  if (!isRendered || !transaction) return null;

  const original = String(transaction.status || "created");
  const dirty = status !== original || note !== String(transaction.admin_note || "");
  const options = TX_STATUSES.includes(status) ? TX_STATUSES : [status, ...TX_STATUSES];
  const nameOf = (id) => people?.[id]?.name || people?.[id]?.email || (id ? `${String(id).slice(0, 8)}…` : "—");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!dirty || saving) return;
    setSaving(true);
    try {
      await onSave({ status, admin_note: note.trim() || null });
    } catch {
      /* caller shows the error; keep the dialog open */
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal modal-futuristic d-block" tabIndex="-1" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={backdropRef}>
      <div className="modal-dialog modal-dialog-centered" role="document" ref={dialogRef}>
        <form className="modal-content" onSubmit={handleSubmit}>
          <div className="modal-header">
            <h5 className="modal-title" id={titleId}>Update transaction</h5>
            <button type="button" className="btn-close" onClick={onClose} disabled={saving} aria-label="Close" />
          </div>
          <fieldset className="modal-body d-grid gap-3" disabled={saving}>
            <dl className="details-list mb-0">
              <div className="details-list__item"><dt>Amount</dt><dd className="fw-semibold">{formatPaise(transaction.amount_total_paise)}</dd></div>
              <div className="details-list__item"><dt>Learner → Mentor</dt><dd>{nameOf(transaction.learner_id)} → {nameOf(transaction.mentor_id)}</dd></div>
              <div className="details-list__item"><dt>Created</dt><dd>{formatDateTime(transaction.created_at)}</dd></div>
              {transaction.razorpay_payment_id ? (
                <div className="details-list__item"><dt>Razorpay payment</dt><dd><code>{transaction.razorpay_payment_id}</code></dd></div>
              ) : null}
            </dl>

            <div>
              <label htmlFor={`${titleId}-status`} className="form-label fw-semibold small">Status</label>
              <select id={`${titleId}-status`} className="form-select" value={status} onChange={(e) => setStatus(e.target.value)} autoFocus>
                {options.map((s) => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor={`${titleId}-note`} className="form-label fw-semibold small">Admin note</label>
              <textarea
                id={`${titleId}-note`}
                className="form-control"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Refunded via Razorpay dashboard on 18 Oct"
              />
            </div>

            {status !== original ? (
              <div className="alert alert-warning py-2 mb-0 small d-flex gap-2" role="note">
                <span className="material-icons" style={{ fontSize: 18 }} aria-hidden="true">info</span>
                <span>
                  Changing <strong>{original}</strong> → <strong>{status}</strong> only updates this record.
                  Make sure it matches Razorpay — no money is moved.
                </span>
              </div>
            ) : null}
          </fieldset>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={!dirty || saving}>
              {saving ? <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />Saving…</> : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
