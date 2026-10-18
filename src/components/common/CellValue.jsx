import { useState } from "react";
import {
  booleanBadge,
  formatDate,
  formatDateTime,
  formatInr,
  formatPaise,
  formatRelative,
  formatTime,
  shortId,
  statusTone,
} from "../../utils/formatters.js";

const Empty = () => <span className="cell-empty" aria-label="empty">—</span>;

export function Badge({ tone = "neutral", children }) {
  return <span className={`admin-badge admin-badge--${tone}`}>{children}</span>;
}

/** Shortened UUID; click copies the full value. */
export function IdValue({ value }) {
  const [copied, setCopied] = useState(false);
  const full = String(value);
  const copy = (e) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(full).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      },
      () => {}
    );
  };
  return (
    <button
      type="button"
      className="cell-id"
      onClick={copy}
      title={copied ? "Copied!" : `${full} — click to copy`}
      aria-label={`Copy ID ${full}`}
    >
      <span>{shortId(full)}</span>
      <span className="material-icons" aria-hidden="true">{copied ? "check" : "content_copy"}</span>
    </button>
  );
}

/** Person name (from the profiles lookup) with email on hover; falls back to the short ID. */
export function PersonValue({ id, person }) {
  if (!id) return <Empty />;
  if (!person?.name && !person?.email) return <IdValue value={id} />;
  return (
    <span className="cell-person" title={[person.email, id].filter(Boolean).join("\n")}>
      <span className="cell-person__avatar" aria-hidden="true">
        {(person.name || person.email || "?").trim().charAt(0).toUpperCase()}
      </span>
      <span className="cell-person__name">{person.name || person.email}</span>
    </span>
  );
}

/**
 * Render one table cell by kind (see inferKind). `people` maps profile id → { name, email }.
 */
export function CellValue({ kind, columnKey, value, people }) {
  if (kind === "person") return <PersonValue id={value} person={people?.[value]} />;
  if (value === null || value === undefined || value === "") {
    return kind === "boolean" ? <Badge tone="neutral">No</Badge> : <Empty />;
  }

  switch (kind) {
    case "paise":
      return <span className="cell-num">{formatPaise(value)}</span>;
    case "inr":
      return <span className="cell-num">{formatInr(value)}</span>;
    case "percent":
      return <span className="cell-num">{value}%</span>;
    case "number":
      return <span className="cell-num">{Number(value).toLocaleString()}</span>;
    case "boolean": {
      const { text, tone } = booleanBadge(columnKey, value);
      return <Badge tone={tone}>{text}</Badge>;
    }
    case "status":
      return <Badge tone={statusTone(value)}>{String(value).replace(/_/g, " ")}</Badge>;
    case "datetime":
      return (
        <time className="cell-date" dateTime={String(value)} title={formatRelative(value)}>
          {formatDateTime(value)}
        </time>
      );
    case "date":
      return <time className="cell-date" dateTime={String(value)}>{formatDate(value)}</time>;
    case "time":
      return <span className="cell-date">{formatTime(value)}</span>;
    case "id":
      return <IdValue value={value} />;
    case "link":
      return (
        <a href={String(value)} target="_blank" rel="noopener noreferrer" className="cell-link" title={String(value)}>
          Open <span className="material-icons" aria-hidden="true">open_in_new</span>
        </a>
      );
    case "json": {
      const json = JSON.stringify(value);
      if (Array.isArray(value)) {
        return <span className="text-muted" title={json}>{value.length} item{value.length === 1 ? "" : "s"}</span>;
      }
      return <span className="text-muted fst-italic" title={json}>{"{…}"}</span>;
    }
    default: {
      const text = String(value);
      return <span className="cell-text" title={text.length > 40 ? text : undefined}>{text}</span>;
    }
  }
}
