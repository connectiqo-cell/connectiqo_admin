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
  const { isRendered, backdropRef, dialogRef } = useModalAnimation(open);

  if (!isRendered) return null;

  return (
    <div className="modal modal-futuristic d-block" tabIndex="-1" role="dialog" ref={backdropRef}>
      <div className="modal-dialog modal-dialog-centered" role="document" ref={dialogRef}>
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">{title}</h5>
            <button type="button" className="btn-close" onClick={onCancel} />
          </div>
          <div className="modal-body">
            <p className="mb-0">{body}</p>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className={`btn btn-${variant}`} onClick={onConfirm}>
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
