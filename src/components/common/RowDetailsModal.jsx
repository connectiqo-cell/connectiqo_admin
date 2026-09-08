import { useEffect, useRef, useState } from "react";
import gsap from "gsap";

export function RowDetailsModal({ open, title, data, onClose, fields = null }) {
  const [isRendered, setIsRendered] = useState(open);
  const backdropRef = useRef(null);
  const dialogRef = useRef(null);

  useEffect(() => {
    if (open) setIsRendered(true);
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
        { opacity: 0, y: 24, scale: 0.965 },
        { opacity: 1, y: 0, scale: 1, duration: 0.32, ease: "power3.out" }
      );
    } else {
      gsap.to(dialog, {
        opacity: 0,
        y: 14,
        scale: 0.98,
        duration: 0.2,
        ease: "power2.in",
      });
      gsap.to(backdrop, {
        opacity: 0,
        duration: 0.18,
        ease: "power2.in",
        onComplete: () => setIsRendered(false),
      });
    }
  }, [open, isRendered]);

  if (!isRendered) return null;

  const displayFields =
    Array.isArray(fields) && fields.length
      ? fields
      : Object.keys(data || {}).map((key) => ({
          key,
          label: key.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()),
        }));

  const getValue = (key) => {
    const value = data?.[key];
    if (value === null || value === undefined || value === "") return "-";
    if (key === "created_at") {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
    }
    return String(value);
  };

  return (
    <div className="modal modal-futuristic d-block" tabIndex="-1" role="dialog" ref={backdropRef}>
      <div className="modal-dialog modal-lg modal-dialog-centered" role="document" ref={dialogRef}>
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">{title}</h5>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>
          <div className="modal-body">
            <div className="row g-3">
              {displayFields.map((field) => (
                <div className="col-12" key={field.key}>
                  <label className="form-label fw-semibold mb-1">{field.label}</label>
                  <input
                    className="form-control"
                    value={getValue(field.key)}
                    readOnly
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
