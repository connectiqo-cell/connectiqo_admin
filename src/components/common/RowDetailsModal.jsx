import { useModalAnimation } from "../../hooks/useModalAnimation.js";

export function RowDetailsModal({ open, title, data, onClose, fields = null }) {
  const { isRendered, backdropRef, dialogRef } = useModalAnimation(open);

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
