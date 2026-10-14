import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  deleteMentorUploadedVideo,
  freezeMentor,
  getAdminProfileDetail,
  getAppSessionRecording,
  getTableRowById,
  listMentorUploadedVideos,
  listUserSessionRecordings,
  unfreezeMentor,
  updateTableRow,
} from "../../services/adminApi.js";
import { useAudit } from "../../app/providers/AuditProvider.jsx";
import { useAuth } from "../../app/providers/AuthProvider.jsx";
import { useEnvironment } from "../../app/providers/EnvironmentProvider.jsx";
import { useToast } from "../../app/providers/ToastProvider.jsx";
import { ConfirmModal } from "../../components/common/ConfirmModal.jsx";
import { MentorFreezeModal } from "../../components/common/MentorFreezeModal.jsx";
import { RecordingPlayerModal } from "../../components/common/RecordingPlayerModal.jsx";
import { HScroll } from "../../components/common/HScroll.jsx";
import { copyToClipboard } from "../../utils/clipboard.js";
import { roleDisplayLabel } from "../../utils/displayLabels.js";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "uploads", label: "Uploaded videos" },
  { key: "recordings", label: "Session recordings" },
];

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

function isMentorFreezeActive(mentor) {
  if (!mentor?.mentor_frozen) return false;
  if (!mentor.mentor_frozen_until) return true;
  return new Date(mentor.mentor_frozen_until).getTime() > Date.now();
}

function Field({ label, value, mono = false }) {
  return (
    <div className="user-profile-field">
      <div className="user-profile-field__label">{label}</div>
      <div className={`user-profile-field__value${mono ? " user-profile-field__value--mono" : ""}`}>
        {fmt(value)}
      </div>
    </div>
  );
}

function StatChip({ label, value }) {
  return (
    <div className="user-profile-stat">
      <div className="user-profile-stat__label">{label}</div>
      <div className="user-profile-stat__value">{value ?? 0}</div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="user-profile-section">
      <h6 className="user-profile-section__title">{title}</h6>
      {children}
    </section>
  );
}

export function UserProfilePage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { config, environment } = useEnvironment();
  const { addLog } = useAudit();
  const { addToast } = useToast();
  const { session } = useAuth();
  const operator = session?.user?.email || session?.email || "admin";

  const [tab, setTab] = useState("overview");
  const [detail, setDetail] = useState(null);
  const [uploads, setUploads] = useState([]);
  const [recordings, setRecordings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [error, setError] = useState("");

  const [banRow, setBanRow] = useState(null);
  const [mentorFreezeRow, setMentorFreezeRow] = useState(null);
  const [mentorFreezeBusy, setMentorFreezeBusy] = useState(false);
  const [playTarget, setPlayTarget] = useState(null);
  const [playLoadingId, setPlayLoadingId] = useState(null);
  const [deleteVideoTarget, setDeleteVideoTarget] = useState(null);

  const loadDetail = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError("");
    try {
      const data = await getAdminProfileDetail(config, userId);
      if (!data) {
        setDetail(null);
        setError("Profile not found");
        return;
      }
      setDetail(data);
    } catch (err) {
      setError(err.message || "Failed to load profile");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [config, userId]);

  const loadMedia = useCallback(async () => {
    if (!userId) return;
    setMediaLoading(true);
    try {
      const [videoRows, recordingRows] = await Promise.all([
        listMentorUploadedVideos(config, userId),
        listUserSessionRecordings(config, userId),
      ]);
      setUploads(videoRows);
      setRecordings(recordingRows);
    } catch (err) {
      addToast(err.message || "Failed to load media", "error");
    } finally {
      setMediaLoading(false);
    }
  }, [config, userId, addToast]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    if (tab === "uploads" || tab === "recordings" || tab === "overview") {
      loadMedia();
    }
  }, [tab, loadMedia]);

  const profile = detail?.profile;
  const mentor = detail?.mentor;
  const learner = detail?.learner;
  const stats = detail?.stats || {};
  const mentorFrozen = isMentorFreezeActive(mentor);

  const tabCounts = useMemo(
    () => ({
      uploads: uploads.length,
      recordings: recordings.length,
    }),
    [uploads.length, recordings.length]
  );

  const openMentorFreeze = async () => {
    if (!profile?.id) return;
    setMentorFreezeBusy(true);
    try {
      const mentorRow = await getTableRowById(config, "mentor_profiles", profile.id);
      setMentorFreezeRow({
        id: profile.id,
        name: profile.name,
        email: profile.email,
        mentor_frozen: mentorRow?.mentor_frozen === true,
        mentor_frozen_until: mentorRow?.mentor_frozen_until ?? null,
        mentor_freeze_reason: mentorRow?.mentor_freeze_reason ?? null,
      });
    } catch (err) {
      addToast(err.message || "Could not load creator freeze status", "error");
    } finally {
      setMentorFreezeBusy(false);
    }
  };

  const confirmBanLogin = async () => {
    if (!banRow?.id) return;
    try {
      const next = !Boolean(banRow.is_frozen);
      const updated = await updateTableRow(config, "profiles", banRow.id, { is_frozen: next });
      addLog({
        action: "UPDATE",
        entity: "profiles",
        environment,
        payload: { ...updated, _admin_action: next ? "ban_login" : "unban_login" },
      });
      addToast(`${banRow.name || "User"} ${next ? "banned from login" : "login restored"}`);
      setBanRow(null);
      await loadDetail();
    } catch (err) {
      addToast(err.message || "Ban toggle failed", "error");
    }
  };

  const confirmMentorFreeze = async (row, { until, reason }) => {
    setMentorFreezeBusy(true);
    try {
      const updated = await freezeMentor(config, row.id, { until, reason, operator });
      addLog({
        action: "UPDATE",
        entity: "mentor_profiles",
        environment,
        payload: { ...updated, _admin_action: "mentor_freeze" },
      });
      addToast(`${row.name || "Creator"} frozen`);
      setMentorFreezeRow(null);
      await loadDetail();
    } catch (err) {
      addToast(err.message || "Creator freeze failed", "error");
    } finally {
      setMentorFreezeBusy(false);
    }
  };

  const confirmMentorUnfreeze = async (row) => {
    setMentorFreezeBusy(true);
    try {
      const updated = await unfreezeMentor(config, row.id, operator);
      addLog({
        action: "UPDATE",
        entity: "mentor_profiles",
        environment,
        payload: { ...updated, _admin_action: "mentor_unfreeze" },
      });
      addToast(`${row.name || "Creator"} restored`);
      setMentorFreezeRow(null);
      await loadDetail();
    } catch (err) {
      addToast(err.message || "Creator unfreeze failed", "error");
    } finally {
      setMentorFreezeBusy(false);
    }
  };

  const copy = async (text, label) => {
    const ok = await copyToClipboard(text);
    addToast(ok ? `${label} copied` : `Could not copy ${label.toLowerCase()}`, ok ? "success" : "error");
  };

  const handlePlayRecording = async (row) => {
    if (!row?.id) return;
    setPlayLoadingId(row.id);
    try {
      const details = await getAppSessionRecording(config, row.id);
      if (!details?.fileUrl && !details?.url) {
        addToast("This recording has no playable file URL yet", "error");
        return;
      }
      setPlayTarget({ ...row, ...details });
    } catch (err) {
      addToast(err.message || "Could not load recording", "error");
    } finally {
      setPlayLoadingId(null);
    }
  };

  const confirmDeleteUpload = async () => {
    if (!deleteVideoTarget?.id) return;
    try {
      await deleteMentorUploadedVideo(config, deleteVideoTarget);
      addLog({
        action: "DELETE",
        entity: "mentor_videos",
        environment,
        payload: deleteVideoTarget,
      });
      addToast("Video deleted");
      if (playTarget?.id === deleteVideoTarget.id) setPlayTarget(null);
      setDeleteVideoTarget(null);
      await loadMedia();
    } catch (err) {
      addToast(err.message || "Delete failed", "error");
      setDeleteVideoTarget(null);
    }
  };

  return (
    <div className="user-profile-page">
      <div className="admin-card p-3 p-md-4">
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary mb-3"
          onClick={() => navigate("/users")}
        >
          ← Back to profiles
        </button>

        {loading ? (
          <div className="text-muted py-2">Loading profile…</div>
        ) : profile ? (
          <div className="user-profile-hero">
            <div className="user-profile-hero__identity">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="user-profile-hero__avatar" />
              ) : (
                <div className="user-profile-hero__avatar user-profile-hero__avatar-fallback">
                  {(profile.name || "?").slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="user-profile-hero__meta">
                <h1 className="user-profile-hero__name">{profile.name || "Unnamed user"}</h1>
                <div className="user-profile-hero__sub">
                  {profile.email}
                  {profile.username ? ` · @${profile.username}` : ""}
                </div>
                <div className="user-profile-badges">
                  <span className="badge rounded-pill bg-secondary-subtle text-secondary-emphasis">
                    {roleDisplayLabel(profile.role) || "role?"}
                  </span>
                  {profile.is_frozen ? (
                    <span className="badge rounded-pill bg-danger-subtle text-danger-emphasis">
                      Login banned
                    </span>
                  ) : null}
                  {mentorFrozen ? (
                    <span className="badge rounded-pill bg-warning-subtle text-warning-emphasis">
                      Creator frozen
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="user-profile-actions">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={() => copy(profile.id, "User ID")}
              >
                Copy ID
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-danger"
                onClick={() => setBanRow(profile)}
              >
                {profile.is_frozen ? "Unban login" : "Ban login"}
              </button>
              <button
                type="button"
                className="btn btn-sm btn-warning"
                onClick={openMentorFreeze}
                disabled={mentorFreezeBusy}
              >
                {mentorFrozen ? "Manage freeze" : "Freeze creator"}
              </button>
              <Link className="btn btn-sm btn-outline-primary" to="/reports">
                Reports
              </Link>
            </div>
          </div>
        ) : (
          <div className="text-danger">{error || "Profile not found"}</div>
        )}
      </div>

      {error && profile ? <div className="alert alert-danger mb-0">{error}</div> : null}

      <div className="admin-card p-3 p-md-4">
        <div className="user-profile-tabs">
          <HScroll>
            {TABS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`btn btn-sm ${tab === item.key ? "btn-primary" : "btn-outline-secondary"}`}
                onClick={() => setTab(item.key)}
              >
                {item.label}
                {item.key !== "overview" ? (
                  <span className="badge rounded-pill bg-secondary-subtle text-secondary-emphasis ms-2">
                    {tabCounts[item.key] ?? 0}
                  </span>
                ) : null}
              </button>
            ))}
          </HScroll>
          <button
            type="button"
            className="btn btn-sm btn-outline-primary"
            onClick={() => {
              loadDetail();
              loadMedia();
            }}
            disabled={loading || mediaLoading}
          >
            Refresh
          </button>
        </div>

        {tab === "overview" ? (
          loading || !profile ? (
            <div className="text-muted py-4">Loading…</div>
          ) : (
            <>
              <Section title="Activity">
                <div className="user-profile-stats">
                  <StatChip label="Uploaded videos" value={stats.videos ?? uploads.length} />
                  <StatChip label="Session recordings" value={recordings.length} />
                  <StatChip label="Bookings (as creator)" value={stats.bookingsAsMentor} />
                  <StatChip label="Bookings (as customer)" value={stats.bookingsAsLearner} />
                  <StatChip label="Reviews" value={stats.reviews} />
                  <StatChip label="Reports against" value={stats.reportsAgainst} />
                  <StatChip label="Unlock buyers" value={stats.unlockBuyers} />
                  <StatChip label="Unlocks owned" value={stats.unlocksOwned} />
                </div>
              </Section>

              <Section title="Identity">
                <div className="user-profile-fields">
                  <Field label="User ID" value={profile.id} mono />
                  <Field label="Username" value={profile.username ? `@${profile.username}` : null} />
                  <Field label="Email" value={profile.email} />
                  <Field label="Created" value={fmtDate(profile.created_at)} />
                  <Field label="Login banned" value={Boolean(profile.is_frozen)} />
                  <Field label="Creator frozen" value={mentorFrozen} />
                  <Field label="Frozen until" value={fmtDate(mentor?.mentor_frozen_until)} />
                  <Field label="Freeze reason" value={mentor?.mentor_freeze_reason} />
                </div>
              </Section>

              {mentor ? (
                <Section title="Creator profile">
                  <div className="user-profile-fields">
                    <Field label="Specialization" value={mentor.specialization} />
                    <Field label="Category" value={mentor.category} />
                    <Field label="Price / hour" value={mentor.price_per_hour} />
                    <Field label="Unlock price" value={mentor.unlock_price} />
                    <Field label="Rating" value={mentor.rating} />
                    <Field label="Total sessions" value={mentor.total_sessions} />
                  </div>
                  <div className="user-profile-field mt-1">
                    <div className="user-profile-field__label">Bio</div>
                    <div className="user-profile-block">{fmt(mentor.bio)}</div>
                  </div>
                </Section>
              ) : null}

              {learner ? (
                <Section title="Customer profile">
                  <div className="user-profile-field">
                    <div className="user-profile-field__label">Bio</div>
                    <div className="user-profile-block">{fmt(learner.bio)}</div>
                  </div>
                  <div className="user-profile-fields mt-2">
                    <Field label="Interests" value={learner.interests} />
                  </div>
                </Section>
              ) : null}
            </>
          )
        ) : null}

        {tab === "uploads" ? (
          mediaLoading ? (
            <div className="text-muted py-4">Loading uploaded videos…</div>
          ) : uploads.length === 0 ? (
            <div className="user-profile-empty">No uploaded creator videos for this user.</div>
          ) : (
            <div className="user-profile-media-list">
              {uploads.map((video) => (
                <div key={video.id} className="user-profile-media-item">
                  {video.thumbnail_url ? (
                    <img src={video.thumbnail_url} alt="" className="user-profile-media-thumb" />
                  ) : (
                    <div className="user-profile-media-thumb">
                      <span className="material-icons text-muted">movie</span>
                    </div>
                  )}
                  <div className="user-profile-media-body">
                    <div className="fw-semibold text-truncate">{video.title || "Untitled video"}</div>
                    <div className="text-muted small">
                      {video.is_free ? "Free" : "Paid library"} · {fmtDate(video.created_at)}
                    </div>
                    {video.description ? (
                      <div className="small text-muted text-truncate">{video.description}</div>
                    ) : null}
                  </div>
                  <div className="user-profile-media-actions">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      onClick={() => copy(video.id, "Video ID")}
                    >
                      Copy ID
                    </button>
                    {video.video_url ? (
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        onClick={() =>
                          setPlayTarget({ id: video.id, fileUrl: video.video_url, url: video.video_url })
                        }
                      >
                        Play
                      </button>
                    ) : null}
                    {video.video_url ? (
                      <a
                        className="btn btn-sm btn-outline-primary"
                        href={video.video_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open
                      </a>
                    ) : null}
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-danger"
                      onClick={() => setDeleteVideoTarget(video)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : null}

        {tab === "recordings" ? (
          mediaLoading ? (
            <div className="text-muted py-4">Loading session recordings…</div>
          ) : recordings.length === 0 ? (
            <div className="user-profile-empty">No session recordings for this user.</div>
          ) : (
            <div className="user-profile-media-list">
              {recordings.map((row) => (
                <div key={row.id} className="user-profile-media-item">
                  <div className="user-profile-media-thumb user-profile-media-thumb--icon">
                    <span className="material-icons text-muted">videocam</span>
                  </div>
                  <div className="user-profile-media-body">
                    <div className="fw-semibold">Session recording · {row.role === "mentor" ? "as creator" : "booked by this user"}</div>
                    <div className="text-muted small">
                      with {row.counterpart_name || row.counterpart_email || "unknown"} ·{" "}
                      {fmtDate(row.recorded_at || row.created_at)}
                    </div>
                    <div className="text-muted small font-monospace text-truncate">
                      booking {row.booking_id}
                    </div>
                  </div>
                  <div className="user-profile-media-actions">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      onClick={() => copy(row.id, "Recording ID")}
                    >
                      Copy ID
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={() => handlePlayRecording(row)}
                      disabled={playLoadingId === row.id}
                    >
                      {playLoadingId === row.id ? "Loading…" : "Play"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : null}
      </div>

      <ConfirmModal
        open={Boolean(deleteVideoTarget)}
        title="Delete uploaded video"
        body={`Permanently delete "${deleteVideoTarget?.title || "this video"}" from the creator library.`}
        confirmText="Delete video"
        onCancel={() => setDeleteVideoTarget(null)}
        onConfirm={confirmDeleteUpload}
      />

      <ConfirmModal
        open={Boolean(banRow)}
        title={banRow?.is_frozen ? "Restore login?" : "Ban login (full account)?"}
        body={
          banRow?.is_frozen
            ? `Restore sign-in access for "${banRow?.name || banRow?.email}".`
            : `Block all sign-in for "${banRow?.name || banRow?.email}". Prefer creator freeze unless you need a full ban.`
        }
        confirmText={banRow?.is_frozen ? "Unban login" : "Ban login"}
        onCancel={() => setBanRow(null)}
        onConfirm={confirmBanLogin}
      />

      <MentorFreezeModal
        open={Boolean(mentorFreezeRow)}
        row={mentorFreezeRow}
        busy={mentorFreezeBusy}
        onCancel={() => setMentorFreezeRow(null)}
        onConfirmFreeze={confirmMentorFreeze}
        onConfirmUnfreeze={confirmMentorUnfreeze}
      />

      <RecordingPlayerModal
        open={Boolean(playTarget)}
        recording={playTarget}
        onClose={() => setPlayTarget(null)}
      />
    </div>
  );
}
