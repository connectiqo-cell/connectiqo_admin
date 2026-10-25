import { useEffect, useId, useMemo, useState } from "react";
import { useModalAnimation } from "../../hooks/useModalAnimation.js";

const READ_ONLY_KEYS = ["id", "created_at", "updated_at"];

function fieldKind(key, value) {
  if (READ_ONLY_KEYS.includes(key)) return "readonly";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (typeof value === "object" && value !== null) return "json";
  return "text";
}

function FieldInput({ inputId, kind, value, onChange, onJsonError }) {
  const [jsonDraft, setJsonDraft] = useState(() =>
    kind === "json" ? JSON.stringify(value, null, 2) : ""
  );

  if (kind === "readonly") {
    return (
      <input
        id={inputId}
        type="text"
        className="form-control form-control-sm font-monospace"
        value={String(value ?? "")}
        readOnly
        style={{ opacity: 0.55, cursor: "not-allowed" }}
      />
    );
  }

  if (kind === "boolean") {
    return (
      <div className="form-check form-switch mt-1">
        <input
          id={inputId}
          type="checkbox"
          role="switch"
          className="form-check-input"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
        <label className="form-check-label" htmlFor={inputId}>
          {value ? "Yes" : "No"}
        </label>
      </div>
    );
  }

  if (kind === "number") {
    return (
      <input
        id={inputId}
        type="number"
        className="form-control form-control-sm"
        value={value ?? ""}
        // Empty stays null instead of silently becoming 0.
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      />
    );
  }

  if (kind === "json") {
    let invalid = false;
    try {
      JSON.parse(jsonDraft);
    } catch {
      invalid = true;
    }
    return (
      <>
        <textarea
          id={inputId}
          className={`form-control form-control-sm font-monospace ${invalid ? "is-invalid" : ""}`}
          rows={4}
          value={jsonDraft}
          aria-invalid={invalid}
          onChange={(e) => {
            const text = e.target.value;
            setJsonDraft(text);
            try {
              onChange(JSON.parse(text));
              onJsonError(false);
            } catch {
              onJsonError(true);
            }
          }}
        />
        {invalid ? <div className="invalid-feedback">Invalid JSON — fix this before saving.</div> : null}
      </>
    );
  }

  return (
    <input
      id={inputId}
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
  const [invalidFields, setInvalidFields] = useState({});
  const [saving, setSaving] = useState(false);
  const { isRendered, backdropRef, dialogRef } = useModalAnimation(open, saving ? null : onClose);
  const idPrefix = useId();

  const isFormMode = initialValue && Object.keys(initialValue).length > 0;

  // Field types come from the original row so editing a value never changes its input type.
  const kinds = useMemo(
    () =>
      Object.fromEntries(Object.entries(initialValue || {}).map(([k, v]) => [k, fieldKind(k, v)])),
    [initialValue]
  );

  useEffect(() => {
    setFields(initialValue ? { ...initialValue } : {});
    setJsonText(JSON.stringify(initialValue || {}, null, 2));
    setJsonError("");
    setInvalidFields({});
  }, [initialValue, open]);

  if (!isRendered) return null;

  const updateField = (key, value) => setFields((prev) => ({ ...prev, [key]: value }));
  const hasInvalidFields = Object.values(invalidFields).some(Boolean);

  const handleSave = async () => {
    if (saving || hasInvalidFields) return;
    let payload;
    if (isFormMode) {
      payload = fields;
    } else {
      try {
        payload = JSON.parse(jsonText);
      } catch {
        setJsonError("Invalid JSON — please fix before saving.");
        return;
      }
    }
    setSaving(true);
    try {
      await onSave(payload);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="modal modal-futuristic d-block"
      tabIndex="-1"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${idPrefix}-title`}
      ref={backdropRef}
    >
      <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable" role="document" ref={dialogRef}>
        <form
          className="modal-content"
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
        >
          <div className="modal-header">
            <h5 className="modal-title" id={`${idPrefix}-title`}>{title}</h5>
            <button type="button" className="btn-close" onClick={onClose} disabled={saving} aria-label="Close" />
          </div>

          <div className="modal-body">
            <fieldset disabled={saving} className="d-grid gap-3">
              {isFormMode ? (
                Object.entries(fields).map(([key, value]) => {
                  const inputId = `${idPrefix}-${key}`;
                  return (
                    <div key={key}>
                      <label htmlFor={inputId} className="form-label small fw-semibold mb-1" style={{ color: "var(--admin-muted)" }}>
                        {key}
                        {READ_ONLY_KEYS.includes(key) && (
                          <span className="fw-normal ms-2" style={{ fontSize: "0.75rem" }}>(read-only)</span>
                        )}
                      </label>
                      <FieldInput
                        inputId={inputId}
                        kind={kinds[key] || "text"}
                        value={value}
                        onChange={(v) => updateField(key, v)}
                        onJsonError={(bad) => setInvalidFields((prev) => ({ ...prev, [key]: bad }))}
                      />
                    </div>
                  );
                })
              ) : (
                <div>
                  <label htmlFor={`${idPrefix}-json`} className="text-muted small mb-2">
                    Enter the new row as JSON.
                  </label>
                  <textarea
                    id={`${idPrefix}-json`}
                    className={`form-control font-monospace ${jsonError ? "is-invalid" : ""}`}
                    rows={14}
                    value={jsonText}
                    onChange={(e) => {
                      setJsonText(e.target.value);
                      setJsonError("");
                    }}
                    placeholder='{ "name": "value" }'
                  />
                  {jsonError && <div className="invalid-feedback d-block">{jsonError}</div>}
                </div>
              )}
            </fieldset>
          </div>

          <div className="modal-footer">
            {hasInvalidFields ? (
              <span className="text-danger small me-auto">Fix invalid JSON fields to save.</span>
            ) : null}
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving || hasInvalidFields}>
              {saving ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
                  Saving…
                </>
              ) : (
                "Save"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
