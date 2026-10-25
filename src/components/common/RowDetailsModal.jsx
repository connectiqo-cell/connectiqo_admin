import { useId, useState } from "react";
import { useModalAnimation } from "../../hooks/useModalAnimation.js";
import { booleanBadge, formatPlain, formatRelative, humanizeKey, inferKind, statusTone } from "../../utils/formatters.js";
import { Badge } from "./CellValue.jsx";

function CopyButton({ text, label }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-sm btn-outline-secondary details-copy"
      onClick={() =>
        navigator.clipboard?.writeText(text).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          },
          () => {}
        )
      }
      title={copied ? "Copied!" : "Copy"}
      aria-label={`Copy ${label}`}
    >
      <span className="material-icons" aria-hidden="true">{copied ? "check" : "content_copy"}</span>
    </button>
  );
}

function DetailValue({ fieldKey, label, value, people, personColumns }) {
  const kind = inferKind(fieldKey, value, personColumns || {});
  const empty = value === null || value === undefined || value === "";

  if (kind === "boolean") {
    const { text, tone } = booleanBadge(fieldKey, value);
    return <Badge tone={tone}>{text}</Badge>;
  }
  if (empty) return <span className="text-muted">—</span>;

  if (kind === "status") return <Badge tone={statusTone(value)}>{String(value).replace(/_/g, " ")}</Badge>;

  if (kind === "person") {
    const person = people?.[value];
    return (
      <div className="details-row">
        <div className="min-w-0">
          {person ? (
            <div className="fw-semibold">
              {person.name || "—"}
              {person.email ? <span className="text-muted fw-normal"> · {person.email}</span> : null}
            </div>
          ) : null}
          <code className="details-id">{String(value)}</code>
        </div>
        <CopyButton text={String(value)} label={label} />
      </div>
    );
  }

  if (kind === "id") {
    return (
      <div className="details-row">
        <code className="details-id">{String(value)}</code>
        <CopyButton text={String(value)} label={label} />
      </div>
    );
  }

  if (kind === "json") {
    return <pre className="json-pre mb-0">{JSON.stringify(value, null, 2)}</pre>;
  }

  if (kind === "link") {
    return (
      <a href={String(value)} target="_blank" rel="noopener noreferrer" className="text-break">
        {String(value)}
      </a>
    );
  }

  if (kind === "datetime") {
    return (
      <span>
        {formatPlain(kind, value)} <span className="text-muted small">({formatRelative(value)})</span>
      </span>
    );
  }

  return <span className="text-break" style={{ whiteSpace: "pre-wrap" }}>{formatPlain(kind, value)}</span>;
}

export function RowDetailsModal({
  open,
  title,
  data,
  onClose,
  fields = null,
  people = null,
  personColumns = null,
  /** Show real column names (Database Explorer). */
  rawLabels = false,
}) {
  const { isRendered, backdropRef, dialogRef } = useModalAnimation(open, onClose);
  const titleId = useId();

  if (!isRendered) return null;

  const displayFields =
    Array.isArray(fields) && fields.length
      ? fields
      : Object.keys(data || {}).map((key) => ({
          key,
          label: rawLabels ? humanizeKey(key, { raw: true }) : personColumns?.[key] || humanizeKey(key),
        }));

  return (
    <div
      className="modal modal-futuristic d-block"
      tabIndex="-1"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      ref={backdropRef}
    >
      <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable" role="document" ref={dialogRef}>
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title" id={titleId}>{title}</h5>
            <button type="button" className="btn-close" onClick={onClose} aria-label="Close" />
          </div>
          <div className="modal-body">
            <dl className="details-list mb-0">
              {displayFields.map((field) => (
                <div className="details-list__item" key={field.key}>
                  <dt>{field.label}</dt>
                  <dd>
                    <DetailValue
                      fieldKey={field.key}
                      label={field.label}
                      value={data?.[field.key]}
                      people={people}
                      personColumns={personColumns}
                    />
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
