import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { Link } from "react-router-dom";

function fmt(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  return String(value);
}

function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
}

function Field({ label, value, mono = false }) {
  return (
    <div className="col-12 col-md-6">
      <div className="small text-muted mb-1">{label}</div>
      <div className={mono ? "font-monospace small text-break" : "fw-semibold text-break"}>
        {fmt(value)}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="mb-4">
      <h6 className="text-uppercase text-muted small fw-bold mb-3" style={{ letterSpacing: "0.04em" }}>
        {title}
      </h6>
      <div className="row g-3">{children}</div>
    </div>
  );
}

function StatChip({ label, value }) {
  return (
    <div className="col-6 col-md-3">
      <div className="border rounded p-2 h-100">
        <div className="text-muted small">{label}</div>
        <div className="h5 mb-0">{value ?? 0}</div>
      </div>
    </div>
  );
}

function isMentorFreezeActive(mentor) {
  if (!mentor?.mentor_frozen) return false;
  if (!mentor.mentor_frozen_until) return true;
  return new Date(mentor.mentor_frozen_until).getTime() > Date.now();
}

export function ProfileDetailsModal({
  open,
  detail,
  loading = false,
  onClose,
  onFreezeMentor,
  onBanLogin,
}) {
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
      gsap.fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: 0.22, ease: "power2.out" });
      gsap.fromTo(
        dialog,
        { opacity: 0, y: 24, scale: 0.965 },
        { opacity: 1, y: 0, scale: 1, duration: 0.32, ease: "power3.out" }
      );
    } else {
      gsap.to(dialog, { opacity: 0, y: 14, scale: 0.98, duration: 0.2, ease: "power2.in" });
      gsap.to(backdrop, {
        opacity: 0,
        duration: 0.18,
        ease: "power2.in",
        onComplete: () => setIsRendered(false),
      });
    }
  }, [open, isRendered]);

  if (!isRendered) return null;

  const profile = detail?.profile;
  const mentor = detail?.mentor;
  const learner = detail?.learner;
  const stats = detail?.stats || {};
  const mentorFrozen = isMentorFreezeActive(mentor);

  return (
    <div className="modal modal-futuristic d-block" tabIndex="-1" role="dialog" ref={backdropRef}>
      <div className="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable" role="document" ref={dialogRef}>
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Profile details</h5>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>
          <div className="modal-body">
            {loading || !profile ? (
              <div className="d-flex align-items-center gap-2 text-muted py-4">
                <div className="spinner-border spinner-border-sm" role="status" />
                <span>Loading profile…</span>
              </div>
            ) : (
              <>
                <div className="d-flex flex-wrap align-items-center gap-3 mb-4">
                  {profile.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt=""
                      className="rounded-circle"
                      style={{ width: 64, height: 64, objectFit: "cover" }}
                    />
                  ) : (
                    <div
                      className="rounded-circle bg-secondary-subtle d-flex align-items-center justify-content-center fw-semibold"
                      style={{ width: 64, height: 64 }}
                    >
                      {(profile.name || profile.email || "?").slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-grow-1 min-w-0">
                    <div className="h5 mb-0 text-truncate">{profile.name || "Unnamed user"}</div>
                    <div className="text-muted small text-truncate">
                      {profile.email || "—"}
                      {profile.username ? ` · @${profile.username}` : ""}
                    </div>
                    <div className="d-flex flex-wrap gap-2 mt-2">
                      <span className="badge rounded-pill bg-secondary-subtle text-secondary-emphasis">
                        {profile.role || "role?"}
                      </span>
                      {profile.is_frozen ? (
                        <span className="badge rounded-pill bg-danger-subtle text-danger-emphasis">
                          Login banned
                        </span>
                      ) : null}
                      {mentorFrozen ? (
                        <span className="badge rounded-pill bg-warning-subtle text-warning-emphasis">
                          Mentor frozen
                          {mentor.mentor_frozen_until
                            ? ` until ${fmtDate(mentor.mentor_frozen_until)}`
                            : " (indefinite)"}
                        </span>
                      ) : mentor ? (
                        <span className="badge rounded-pill bg-success-subtle text-success-emphasis">
                          Mentor active
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <Section title="Identity">
                  <Field label="User ID" value={profile.id} mono />
                  <Field label="Username" value={profile.username ? `@${profile.username}` : null} />
                  <Field label="Email" value={profile.email} />
                  <Field label="Role" value={profile.role} />
                  <Field label="Created" value={fmtDate(profile.created_at)} />
                  <Field label="Avatar URL" value={profile.avatar_url} mono />
                </Section>

                <Section title="Moderation">
                  <Field label="Login banned" value={Boolean(profile.is_frozen)} />
                  <Field label="Mentor frozen" value={mentorFrozen} />
                  <Field label="Frozen until" value={fmtDate(mentor?.mentor_frozen_until)} />
                  <Field label="Freeze reason" value={mentor?.mentor_freeze_reason} />
                </Section>

                <Section title="Activity">
                  <StatChip label="Videos" value={stats.videos} />
                  <StatChip label="Bookings (mentor)" value={stats.bookingsAsMentor} />
                  <StatChip label="Bookings (learner)" value={stats.bookingsAsLearner} />
                  <StatChip label="Reviews" value={stats.reviews} />
                  <StatChip label="Reports against" value={stats.reportsAgainst} />
                  <StatChip label="Reports filed" value={stats.reportsFiled} />
                  <StatChip label="Unlock buyers" value={stats.unlockBuyers} />
                  <StatChip label="Unlocks owned" value={stats.unlocksOwned} />
                </Section>

                {mentor ? (
                  <Section title="Mentor profile">
                    <Field label="Specialization" value={mentor.specialization} />
                    <Field label="Category" value={mentor.category} />
                    <Field label="Experience (years)" value={mentor.experience_years} />
                    <Field label="Rating" value={mentor.rating} />
                    <Field label="Total sessions" value={mentor.total_sessions} />
                    <Field label="Price / hour" value={mentor.price_per_hour} />
                    <Field label="Unlock price" value={mentor.unlock_price} />
                    <Field label="Location" value={mentor.location} />
                    <Field label="Website" value={mentor.website} />
                    <Field label="Skills" value={mentor.skills} />
                    <div className="col-12">
                      <div className="small text-muted mb-1">Bio</div>
                      <div className="border rounded p-2 small" style={{ whiteSpace: "pre-wrap" }}>
                        {fmt(mentor.bio)}
                      </div>
                    </div>
                    <Field label="YouTube" value={mentor.youtube_url} mono />
                    <Field label="Instagram" value={mentor.instagram_url} mono />
                    <Field label="X" value={mentor.x_url} mono />
                    <Field label="LinkedIn" value={mentor.linkedin_url} mono />
                    <Field label="Cover image" value={mentor.cover_image_url} mono />
                  </Section>
                ) : (
                  <div className="alert alert-light border mb-4">No mentor profile row for this user.</div>
                )}

                {learner ? (
                  <Section title="Learner profile">
                    <div className="col-12">
                      <div className="small text-muted mb-1">Bio</div>
                      <div className="border rounded p-2 small" style={{ whiteSpace: "pre-wrap" }}>
                        {fmt(learner.bio)}
                      </div>
                    </div>
                    <Field label="Interests" value={learner.interests} />
                  </Section>
                ) : null}
              </>
            )}
          </div>
          <div className="modal-footer flex-wrap gap-2">
            {profile?.id ? (
              <Link className="btn btn-outline-secondary me-auto" to={`/reports`}>
                Open reports
              </Link>
            ) : null}
            {onBanLogin && profile ? (
              <button type="button" className="btn btn-outline-danger" onClick={() => onBanLogin(profile)}>
                {profile.is_frozen ? "Unban login" : "Ban login"}
              </button>
            ) : null}
            {onFreezeMentor && profile ? (
              <button type="button" className="btn btn-warning" onClick={() => onFreezeMentor(profile)}>
                {mentorFrozen ? "Manage freeze" : "Freeze mentor"}
              </button>
            ) : null}
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
