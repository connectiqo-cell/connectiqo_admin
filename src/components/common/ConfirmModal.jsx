import { useId, useState } from "react";
import { useModalAnimation } from "../../hooks/useModalAnimation.js";

export function ConfirmModal({
  title = "Confirm action",
  body = "Are you sure?",
  open,
  onCancel,
  onConfirm,
  confirmText = "Confirm",
  variant = "danger",
}) {
  const [busy, setBusy] = useState(false);
  // While the action runs, Esc/Cancel are disabled so the modal can't close mid-request.
  const { isRendered, backdropRef, dialogRef } = useModalAnimation(open, busy ? null : onCancel);
  const titleId = useId();

  if (!isRendered) return null;

  const handleConfirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="modal modal-futuristic d-block"
      tabIndex="-1"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      ref={backdropRef}
    >
      <div className="modal-dialog modal-dialog-centered" role="document" ref={dialogRef}>
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title" id={titleId}>{title}</h5>
            <button type="button" className="btn-close" onClick={onCancel} disabled={busy} aria-label="Close" />
          </div>
          <div className="modal-body">
            <p className="mb-0">{body}</p>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy} autoFocus>
              Cancel
            </button>
            <button type="button" className={`btn btn-${variant}`} onClick={handleConfirm} disabled={busy}>
              {busy ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
                  Working…
                </>
              ) : (
                confirmText
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
