import { useEffect, useMemo, useState } from "react";
import { HScroll } from "./HScroll.jsx";

const PRESETS = [
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "90d", label: "90 days", days: 90 },
  { key: "indefinite", label: "Indefinite", days: null },
  { key: "custom", label: "Custom date", days: "custom" },
];

function toLocalInputValue(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function MentorFreezeModal({
  open,
  row,
  busy = false,
  onCancel,
  onConfirmFreeze,
  onConfirmUnfreeze,
}) {
  const isActive =
    row?.mentor_frozen === true &&
    (!row?.mentor_frozen_until || new Date(row.mentor_frozen_until).getTime() > Date.now());

  const [preset, setPreset] = useState("7d");
  const [customUntil, setCustomUntil] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return toLocalInputValue(d);
  });
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) return;
    setPreset("7d");
    const d = new Date();
    d.setDate(d.getDate() + 7);
    setCustomUntil(toLocalInputValue(d));
    setReason(row?.mentor_freeze_reason || "");
  }, [open, row?.id, row?.mentor_freeze_reason]);

  const untilIso = useMemo(() => {
    if (preset === "indefinite") return null;
    if (preset === "custom") {
      const d = new Date(customUntil);
      if (Number.isNaN(d.getTime())) return null;
      return d.toISOString();
    }
    const match = PRESETS.find((p) => p.key === preset);
    if (!match?.days) return null;
    const d = new Date();
    d.setDate(d.getDate() + match.days);
    return d.toISOString();
  }, [preset, customUntil]);

  if (!open || !row) return null;

  const name = row.name || row.email || row.id;

  return (
    <div className="modal modal-futuristic d-block" tabIndex="-1" role="dialog">
      <div className="modal-dialog modal-dialog-centered" role="document">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">
              {isActive ? "Mentor freeze" : "Freeze mentor"}
            </h5>
            <button type="button" className="btn-close" onClick={onCancel} disabled={busy} />
          </div>
          <div className="modal-body">
            <p className="mb-2">
              {isActive ? (
                <>
                  <strong>{name}</strong> is currently frozen as a mentor
                  {row.mentor_frozen_until
                    ? ` until ${new Date(row.mentor_frozen_until).toLocaleString()}`
                    : " indefinitely"}
                  . Learner access stays open. Unfreeze to restore their mentor profile and videos.
                </>
              ) : (
                <>
                  Freeze <strong>{name}</strong> as a mentor only. Their profile and videos will be
                  hidden, unlocks pause, and mentor tools lock — they can still use learner features.
                </>
              )}
            </p>

            {!isActive ? (
              <>
                <label className="form-label small text-muted mb-1">Duration</label>
                <HScroll className="mb-3">
                  {PRESETS.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      className={`btn btn-sm ${preset === p.key ? "btn-primary" : "btn-outline-secondary"}`}
                      onClick={() => setPreset(p.key)}
                      disabled={busy}
                    >
                      {p.label}
                    </button>
                  ))}
                </HScroll>
                {preset === "custom" ? (
                  <div className="mb-3">
                    <label className="form-label small text-muted mb-1">Ends at</label>
                    <input
                      type="datetime-local"
                      className="form-control form-control-sm"
                      value={customUntil}
                      onChange={(e) => setCustomUntil(e.target.value)}
                      disabled={busy}
                    />
                  </div>
                ) : null}
                <label className="form-label small text-muted mb-1">Reason (optional)</label>
                <textarea
                  className="form-control form-control-sm"
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Shown to the mentor on their Me / Upload tabs"
                  disabled={busy}
                />
              </>
            ) : null}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            {isActive ? (
              <button
                type="button"
                className="btn btn-success"
                disabled={busy}
                onClick={() => onConfirmUnfreeze?.(row)}
              >
                Unfreeze mentor
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-warning"
                disabled={busy || (preset === "custom" && !untilIso)}
                onClick={() =>
                  onConfirmFreeze?.(row, {
                    until: untilIso,
                    reason: reason.trim() || null,
                  })
                }
              >
                Freeze mentor
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
