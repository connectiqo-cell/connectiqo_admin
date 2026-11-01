import { useState } from "react";
import { setEmailsPaused } from "../../services/adminApi.js";
import { ConfirmModal } from "../../components/common/ConfirmModal.jsx";
import { emailStatusSummary } from "./emailControl.js";

const COUNTS = [
  { key: "waiting", status: "pending", label: "Waiting" },
  { key: "sentToday", status: "sent", label: "Sent (24h)" },
  { key: "failed", status: "failed", label: "Failed" },
];

/** What is happening with email right now, the emergency stop, and the queue numbers. */
export function EmailControlCard({ config, control, environment, operator, addLog, addToast, onChanged, onOpenHistory }) {
  const { settings, worker, counts } = control;
  const paused = settings.emails_paused;
  const summary = emailStatusSummary(settings, worker);
  const [action, setAction] = useState(null); // pause | send | discard

  const run = async () => {
    try {
      const discarded = await setEmailsPaused(config, {
        paused: action === "pause",
        discardWaiting: action === "discard",
        operator,
      });
      addLog({
        action: "UPDATE",
        entity: "email_trigger_settings",
        environment,
        payload: { _admin_action: action === "pause" ? "pause_emails" : "resume_emails", discarded },
      });
      addToast(action === "pause" ? "All emails paused" : action === "discard" ? `Emails resumed; ${discarded} discarded` : "Emails resumed");
      setAction(null);
      await onChanged();
    } catch (err) {
      addToast(err.message || "Could not change the emergency stop", "error");
    }
  };

  const CONFIRM = {
    pause: {
      title: "Pause all emails?",
      body: "No email goes out until you resume. New emails keep queuing. Test emails still work.",
      confirmText: "Pause all emails",
      variant: "danger",
    },
    send: {
      title: "Resume and send?",
      body: `Sending resumes, including ${counts.waiting} waiting email${counts.waiting === 1 ? "" : "s"}. Some may be out of date.`,
      confirmText: "Resume and send",
      variant: "primary",
    },
    discard: {
      title: "Resume and discard?",
      body: `${counts.waiting} waiting email${counts.waiting === 1 ? "" : "s"} will never be sent. New emails go out normally.`,
      confirmText: "Resume and discard",
      variant: "danger",
    },
  };

  return (
    <section className="admin-card p-3 p-md-4 d-grid gap-3">
      <div className={`email-status email-status--${summary.tone}`} role="status">
        <span className="material-icons email-status__icon" aria-hidden="true">{summary.icon}</span>
        <div className="email-row-text">
          <h2 className="h6 mb-1">{summary.title}</h2>
          <div className="small">{summary.detail}</div>
        </div>
        {paused ? (
          <div className="d-flex flex-wrap gap-2">
            <button type="button" className="btn btn-sm btn-primary" onClick={() => setAction("send")}>Resume and send</button>
            {counts.waiting > 0 ? (
              <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setAction("discard")}>
                Resume and discard {counts.waiting}
              </button>
            ) : null}
          </div>
        ) : (
          <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setAction("pause")}>
            <span className="material-icons align-middle me-1" style={{ fontSize: 16 }} aria-hidden="true">pause_circle</span>
            Pause all emails
          </button>
        )}
      </div>

      <div className="email-counts">
        {COUNTS.map(({ key, status, label }) => (
          <button type="button" className="email-count" key={key} onClick={() => onOpenHistory(status)}>
            <span className={`email-count__value ${key === "failed" && counts.failed > 0 ? "text-danger" : ""}`}>{counts[key]}</span>
            <span className="text-muted small">{label}</span>
          </button>
        ))}
      </div>

      <ConfirmModal
        open={Boolean(action)}
        {...(action ? CONFIRM[action] : {})}
        onCancel={() => setAction(null)}
        onConfirm={run}
      />
    </section>
  );
}
