import { useEffect, useRef, useState } from "react";
import gsap from "gsap";

export function ConfirmModal({
  title = "Confirm action",
  body = "Are you sure?",
  open,
  onCancel,
  onConfirm,
  confirmText = "Confirm",
  variant = "danger",
}) {
  const [isRendered, setIsRendered] = useState(open);
  const backdropRef = useRef(null);
  const dialogRef = useRef(null);

  useEffect(() => {
    if (open) {
      setIsRendered(true);
    }
  }, [open]);

  useEffect(() => {
    if (!isRendered) return;
    const backdrop = backdropRef.current;
    const dialog = dialogRef.current;
    if (!backdrop || !dialog) return;

    if (open) {
      gsap.fromTo(
        backdrop,
        { opacity: 0 },
        { opacity: 1, duration: 0.22, ease: "power2.out" }
      );
      gsap.fromTo(
        dialog,
        { opacity: 0, y: 28, scale: 0.96 },
        { opacity: 1, y: 0, scale: 1, duration: 0.3, ease: "power3.out" }
      );
    } else {
      gsap.to(dialog, {
        opacity: 0,
        y: 18,
        scale: 0.97,
        duration: 0.22,
        ease: "power2.in",
      });
      gsap.to(backdrop, {
        opacity: 0,
        duration: 0.2,
        ease: "power2.in",
        onComplete: () => setIsRendered(false),
      });
    }
  }, [open, isRendered]);

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
            <div className="mb-0">{body}</div>
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
