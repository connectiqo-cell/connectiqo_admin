import { useEffect, useState } from "react";
import { useModalAnimation } from "../../hooks/useModalAnimation.js";

const READ_ONLY_KEYS = ["id", "created_at", "updated_at"];

function FieldInput({ fieldKey, value, onChange }) {
  if (READ_ONLY_KEYS.includes(fieldKey)) {
    return (
      <input
        type="text"
        className="form-control form-control-sm font-monospace"
        value={String(value ?? "")}
        readOnly
        style={{ opacity: 0.55, cursor: "not-allowed" }}
      />
    );
  }

  if (typeof value === "boolean") {
    return (
      <div className="form-check mt-1">
        <input
          type="checkbox"
          className="form-check-input"
          id={`field-${fieldKey}`}
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
        <label className="form-check-label" htmlFor={`field-${fieldKey}`}>
          {value ? "true" : "false"}
        </label>
      </div>
    );
  }

  if (typeof value === "number") {
    return (
      <input
        type="number"
        className="form-control form-control-sm"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    );
  }

  if (typeof value === "object" && value !== null) {
    return (
      <textarea
        className="form-control form-control-sm font-monospace"
        rows={3}
        defaultValue={JSON.stringify(value, null, 2)}
        onChange={(e) => {
          try { onChange(JSON.parse(e.target.value)); } catch { /* let user keep typing */ }
        }}
      />
    );
  }

  return (
    <input
      type="text"
      className="form-control form-control-sm"
      value={String(value ?? "")}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function JsonEditorModal({ open, title, initialValue, onClose, onSave }) {
  const [fields, setFields] = useState({});
  const [jsonText, setJsonText] = useState("{}");
  const [jsonError, setJsonError] = useState("");
  const { isRendered, backdropRef, dialogRef } = useModalAnimation(open);

  const isFormMode = initialValue && Object.keys(initialValue).length > 0;

  useEffect(() => {
    setFields(initialValue ? { ...initialValue } : {});
    setJsonText(JSON.stringify(initialValue || {}, null, 2));
    setJsonError("");
  }, [initialValue, open]);

  if (!isRendered) return null;

  const updateField = (key, value) => setFields(prev => ({ ...prev, [key]: value }));

  const handleSave = () => {
    if (isFormMode) {
      onSave(fields);
    } else {
      try {
        onSave(JSON.parse(jsonText));
      } catch {
        setJsonError("Invalid JSON — please fix before saving.");
      }
    }
  };

  return (
    <div className="modal modal-futuristic d-block" tabIndex="-1" role="dialog" ref={backdropRef}>
      <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable" role="document" ref={dialogRef}>
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">{title}</h5>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>

          <div className="modal-body">
            {isFormMode ? (
              <div className="d-grid gap-3">
                {Object.entries(fields).map(([key, value]) => (
                  <div key={key}>
                    <label className="form-label small fw-semibold mb-1" style={{ color: "var(--admin-muted)" }}>
                      {key}
                      {READ_ONLY_KEYS.includes(key) && (
                        <span className="fw-normal ms-2" style={{ fontSize: "0.75rem" }}>(read-only)</span>
                      )}
                    </label>
                    <FieldInput fieldKey={key} value={value} onChange={(v) => updateField(key, v)} />
                  </div>
                ))}
              </div>
            ) : (
              <>
                <p className="text-muted small mb-2">Enter the new row as JSON.</p>
                <textarea
                  className="form-control font-monospace"
                  rows={14}
                  value={jsonText}
                  onChange={(e) => setJsonText(e.target.value)}
                  placeholder='{ "name": "value" }'
                />
                {jsonError && <div className="text-danger small mt-2">{jsonError}</div>}
              </>
            )}
          </div>

          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}
