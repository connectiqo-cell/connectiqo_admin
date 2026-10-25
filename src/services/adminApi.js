import { getSupabaseClient } from "./supabaseClientFactory.js";
import {
  deleteVideoSdkRecording,
  getVideoSdkRecording,
  listVideoSdkRecordings,
  listVideoSdkSessions,
} from "./videosdkClient.js";

const TABLE_ORDER_CONFIG = {
  profiles: { column: "created_at", ascending: false },
  bookings: { column: "created_at", ascending: false },
  transactions: { column: "created_at", ascending: false },
  earnings: { column: "created_at", ascending: false },
  withdrawal_requests: { column: "created_at", ascending: false },
  platform_fee_rules: { column: "created_at", ascending: false },
  app_categories: { column: "sort_order", ascending: true },
  mentor_categories: { column: "sort_order", ascending: true },
  hero_slides: { column: "position", ascending: true },
  home_marketing_clips: { column: "sort_order", ascending: true },
  mentor_wallets: { column: "updated_at", ascending: false },
  user_reports: { column: "created_at", ascending: false },
  // mentor_profiles often has neither created_at nor updated_at in this project.
  mentor_profiles: { column: null, ascending: false },
};

/**
 * Tables the admin UI is permitted to read/write via the generic CRUD helpers below.
 * Deliberately excludes `admins` and any other sensitive/system table — this is the
 * actual enforcement point (not just DatabaseExplorerPage's suggestion list), since
 * generic CRUD ultimately relies on Supabase RLS, which this app doesn't control.
 */
export const ALLOWED_TABLES = new Set([
  "profiles",
  "bookings",
  "mentor_profiles",
  "mentor_categories",
  "platform_fee_rules",
  "hero_slides",
  "transactions",
  "earnings",
  "mentor_wallets",
  "withdrawal_requests",
  "availability_slots",
  "user_reports",
  // app_categories / wallet_transactions were listed here but don't exist in the
  // database; add them back once those tables are created.
]);

/**
 * Searchable columns per table, taken from the real Postgres schema.
 * `text`: text columns matched with case-insensitive "contains" (ilike).
 * `uuid`: uuid columns matched exactly when the search box holds a full UUID.
 * Only these may be used: ilike on uuid/date/numeric columns makes Postgres error.
 * Secrets/tokens (razorpay_signature, fcm_token, bank_account) are deliberately left out.
 */
export const TABLE_SEARCH_COLUMNS = {
  profiles: {
    text: ["name", "email", "username", "role"],
    uuid: ["id"],
  },
  bookings: {
    text: ["status", "message", "meeting_id", "reschedule_reason"],
    uuid: ["id", "learner_id", "mentor_id", "slot_id", "original_booking_id"],
  },
  mentor_profiles: {
    text: ["specialization", "category", "bio", "location", "kyc_status", "upi_id", "account_holder_name", "razorpay_account_status"],
    uuid: ["id"],
  },
  mentor_categories: {
    text: ["name", "slug", "icon"],
    uuid: ["id"],
  },
  platform_fee_rules: {
    text: ["notes"],
    uuid: ["id"],
  },
  hero_slides: {
    text: ["image_url", "storage_path"],
    uuid: ["id"],
  },
  transactions: {
    text: ["status", "admin_note", "razorpay_order_id", "razorpay_payment_id", "currency", "booking_message"],
    uuid: ["id", "booking_id", "learner_id", "mentor_id", "slot_id"],
  },
  earnings: {
    text: ["status", "source", "notes", "route_transfer_id"],
    uuid: ["id", "mentor_id", "booking_id"],
  },
  mentor_wallets: {
    text: [],
    uuid: ["id"],
  },
  withdrawal_requests: {
    text: ["status", "admin_note", "upi_id", "payout_method", "payout_reference", "razorpay_payout_id", "processed_by", "rejected_reason"],
    uuid: ["id", "mentor_id"],
  },
  availability_slots: {
    text: [],
    uuid: ["id", "mentor_id"],
  },
  user_reports: {
    text: ["reason", "details", "context_type", "status"],
    uuid: ["id", "reporter_id", "reported_user_id", "context_id"],
  },
};

/**
 * Columns holding a profiles.id (from the database's foreign keys), with the label to show.
 * Tables list these people by name instead of by UUID.
 */
export const PERSON_COLUMNS = {
  bookings: { learner_id: "Booked by", mentor_id: "Creator" },
  transactions: { learner_id: "Booked by", mentor_id: "Creator" },
  earnings: { mentor_id: "Creator" },
  withdrawal_requests: { mentor_id: "Creator" },
  availability_slots: { mentor_id: "Creator" },
  mentor_wallets: { id: "Creator" },
  user_reports: { reporter_id: "Reported by", reported_user_id: "Reported user" },
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when the table can be searched server-side at all (text or id columns). */
export function isTableSearchable(tableName) {
  const cfg = TABLE_SEARCH_COLUMNS[tableName];
  return Boolean(cfg && (cfg.text.length || cfg.uuid.length));
}

function assertAllowedTable(tableName) {
  if (!ALLOWED_TABLES.has(tableName)) {
    throw new Error(`Table "${tableName}" is not permitted for admin UI access.`);
  }
}

export async function listTableRows(config, tableName, options = {}) {
  assertAllowedTable(tableName);
  // backward compat: plain number treated as limit
  if (typeof options === "number") options = { limit: options };

  const {
    limit = null,
    page = 1,
    pageSize = 25,
    sortCol = null,
    sortDir = "asc",
    filters = {},
    search = "",
    searchColumns = [],
    // Also return { people: { [profileId]: { id, name, email } } } for this page's person columns.
    withPeople = false,
  } = options;

  const supabase = getSupabaseClient(config);
  const orderConfig = TABLE_ORDER_CONFIG[tableName];

  const from = limit != null ? 0 : (page - 1) * pageSize;
  const to   = limit != null ? limit - 1 : from + pageSize - 1;

  const orderColumn    = sortCol || orderConfig?.column;
  const orderAscending = sortCol ? sortDir === "asc" : Boolean(orderConfig?.ascending);

  let query = supabase.from(tableName).select("*", { count: "exact" }).range(from, to);

  if (orderColumn) {
    query = query.order(orderColumn, { ascending: orderAscending, nullsFirst: false });
  }

  Object.entries(filters).forEach(([key, val]) => {
    if (val && val !== "all") query = query.eq(key, val);
  });

  // Server-side search across the whole table (not just the current page).
  // Only runs when the caller opts in with real text columns (searchColumns).
  //  - A full UUID matches the table's id columns exactly (e.g. paste a booking_id).
  //  - Otherwise each word must appear in at least one text column, in any order,
  //    so "john gmail" finds name "John" with email "...@gmail.com".
  const trimmedSearch = search.trim();
  if (trimmedSearch && searchColumns.length) {
    const uuidColumns = TABLE_SEARCH_COLUMNS[tableName]?.uuid || [];
    if (UUID_PATTERN.test(trimmedSearch) && uuidColumns.length) {
      query = query.or(uuidColumns.map((col) => `${col}.eq.${trimmedSearch}`).join(","));
    } else {
      // uuid columns can't be ilike-matched, so only text columns take part here.
      const textColumns = searchColumns.filter((col) => !uuidColumns.includes(col));
      if (!textColumns.length) return { rows: [], count: 0 };
      const words = trimmedSearch
        .split(/\s+/)
        // Strip characters that break PostgREST's or() syntax or act as wildcards.
        .map((word) => word.replace(/[,()"\\%*]/g, ""))
        .filter(Boolean);
      words.forEach((word) => {
        query = query.or(textColumns.map((col) => `${col}.ilike.*${word}*`).join(","));
      });
    }
  }

  const { data, error, count } = await query;
  if (error) throw error;
  const rows = data || [];
  const people = withPeople ? await lookupPeople(config, tableName, rows) : {};
  return { rows, count: count || 0, people };
}

/** Names for the person columns of these rows. Never fails the caller: falls back to {}. */
async function lookupPeople(config, tableName, rows) {
  const columns = Object.keys(PERSON_COLUMNS[tableName] || {});
  if (!columns.length || !rows.length) return {};
  try {
    return await fetchProfilesByIds(config, rows.flatMap((row) => columns.map((col) => row[col])));
  } catch {
    return {};
  }
}

export async function fetchProfilesByIds(config, ids) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (!uniqueIds.length) return {};

  const supabase = getSupabaseClient(config);
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, name, email")
    .in("id", uniqueIds);

  if (error) throw error;
  return Object.fromEntries((profiles || []).map((profile) => [profile.id, profile]));
}

export async function getTableRowById(config, tableName, id) {
  assertAllowedTable(tableName);
  if (!id) return null;
  const supabase = getSupabaseClient(config);
  const { data, error } = await supabase.from(tableName).select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

async function countExact(supabase, table, column, value, extra = null) {
  try {
    let query = supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq(column, value);
    if (typeof extra === "function") query = extra(query);
    const { count, error } = await query;
    if (error) return 0;
    return count || 0;
  } catch {
    return 0;
  }
}

/** Full profile snapshot for admin moderation view. */
export async function getAdminProfileDetail(config, profileId) {
  if (!profileId) return null;
  const supabase = getSupabaseClient(config);

  const [
    profileRes,
    mentorRes,
    learnerRes,
    videoCount,
    mentorBookingCount,
    learnerBookingCount,
    reportsAgainstCount,
    reportsFiledCount,
    reviewCount,
    unlockBuyerCount,
    unlockOwnedCount,
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", profileId).maybeSingle(),
    supabase.from("mentor_profiles").select("*").eq("id", profileId).maybeSingle(),
    supabase.from("learner_profiles").select("*").eq("id", profileId).maybeSingle(),
    countExact(supabase, "mentor_videos", "mentor_id", profileId),
    countExact(supabase, "bookings", "mentor_id", profileId),
    countExact(supabase, "bookings", "learner_id", profileId),
    countExact(supabase, "user_reports", "reported_user_id", profileId),
    countExact(supabase, "user_reports", "reporter_id", profileId),
    countExact(supabase, "reviews", "mentor_id", profileId),
    countExact(supabase, "learner_unlocks", "mentor_id", profileId),
    countExact(supabase, "learner_unlocks", "learner_id", profileId),
  ]);

  if (profileRes.error) throw profileRes.error;
  if (!profileRes.data) return null;

  return {
    profile: profileRes.data,
    mentor: mentorRes.error ? null : mentorRes.data || null,
    learner: learnerRes.error ? null : learnerRes.data || null,
    stats: {
      videos: videoCount,
      bookingsAsMentor: mentorBookingCount,
      bookingsAsLearner: learnerBookingCount,
      reportsAgainst: reportsAgainstCount,
      reportsFiled: reportsFiledCount,
      reviews: reviewCount,
      unlockBuyers: unlockBuyerCount,
      unlocksOwned: unlockOwnedCount,
    },
  };
}

/**
 * Uploaded mentor library videos for a user. video_url/hls_url have no
 * direct SELECT grant for authenticated — this goes through an
 * admin-gated RPC instead (admin_list_mentor_videos), same pattern as the
 * web portal's viewer-facing get_*_for_viewer functions.
 */
export async function listMentorUploadedVideos(config, mentorId) {
  const supabase = getSupabaseClient(config);
  const { data, error } = await supabase.rpc("admin_list_mentor_videos", { p_mentor_id: mentorId });
  if (error) throw error;
  return data || [];
}

/**
 * All mentor library videos (app Videos tab) — metadata only.
 * Call getMentorUploadedVideo(id) on Play for the file URL.
 */
export async function listAllMentorUploadedVideos(
  config,
  { page = 1, pageSize = 50, search = "" } = {}
) {
  const supabase = getSupabaseClient(config);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const q = String(search || "")
    .trim()
    .replace(/[%_,]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 80);

  let query = supabase
    .from("mentor_videos")
    .select(
      "id, mentor_id, title, description, thumbnail_url, is_free, position, is_promoted, promoted_at, created_at, storage_path",
      { count: "exact" }
    )
    .order("is_promoted", { ascending: false })
    .order("promoted_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (q) {
    // Title / description match; mentor name search needs a join — filter client-side after enrich if needed
    query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  const rows = data || [];
  const profileById = await fetchProfilesByIds(
    config,
    rows.map((row) => row.mentor_id)
  );

  let enriched = rows.map((row) => ({
    ...row,
    mentor_name: profileById[row.mentor_id]?.name ?? null,
    mentor_email: profileById[row.mentor_id]?.email ?? null,
  }));

  // If search looks like a mentor name/email and title filter returned little, broaden via profiles
  if (q && enriched.length === 0) {
    const { data: mentors } = await supabase
      .from("profiles")
      .select("id")
      .or(`name.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(40);
    const mentorIds = (mentors || []).map((m) => m.id);
    if (mentorIds.length) {
      const { data: byMentor, error: byErr, count: byCount } = await supabase
        .from("mentor_videos")
        .select(
          "id, mentor_id, title, description, thumbnail_url, is_free, position, is_promoted, promoted_at, created_at, storage_path",
          { count: "exact" }
        )
        .in("mentor_id", mentorIds)
        .order("is_promoted", { ascending: false })
        .order("promoted_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .range(from, to);
      if (byErr) throw byErr;
      const mentorRows = byMentor || [];
      const profiles2 = await fetchProfilesByIds(
        config,
        mentorRows.map((row) => row.mentor_id)
      );
      return {
        rows: mentorRows.map((row) => ({
          ...row,
          mentor_name: profiles2[row.mentor_id]?.name ?? null,
          mentor_email: profiles2[row.mentor_id]?.email ?? null,
        })),
        total: byCount ?? mentorRows.length,
      };
    }
  }

  return {
    rows: enriched,
    total: count ?? enriched.length,
  };
}

/** video_url/hls_url have no direct SELECT grant for authenticated — goes through admin_get_mentor_video instead. */
export async function getMentorUploadedVideo(config, videoId) {
  const supabase = getSupabaseClient(config);
  const { data, error } = await supabase.rpc("admin_get_mentor_video", { p_video_id: videoId }).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Video not found");
  return data;
}

export async function updateMentorUploadedVideo(config, videoId, payload) {
  const supabase = getSupabaseClient(config);
  const updates = {};
  if (payload.title !== undefined) updates.title = payload.title;
  if (payload.description !== undefined) updates.description = payload.description;
  if (payload.is_free !== undefined) updates.is_free = Boolean(payload.is_free);
  if (payload.position !== undefined) updates.position = Number(payload.position) || 0;

  let data = null;
  if (Object.keys(updates).length) {
    const result = await supabase
      .from("mentor_videos")
      .update(updates)
      .eq("id", videoId)
      .select(
        "id, mentor_id, title, description, thumbnail_url, is_free, position, is_promoted, promoted_at, created_at, storage_path"
      )
      .single();
    if (result.error) throw result.error;
    data = result.data;
  }

  if (payload.is_promoted !== undefined) {
    data = await setMentorVideoPromoted(config, videoId, payload.is_promoted);
  }

  if (!data) {
    data = await getMentorUploadedVideo(config, videoId);
  }
  return data;
}

/** Pin / unpin a video at the top of the learner Videos feed. */
export async function setMentorVideoPromoted(config, videoId, promoted) {
  return callAdminRpc(config, "admin_set_mentor_video_promoted", {
    p_id: videoId,
    p_promoted: Boolean(promoted),
  });
}

const MENTOR_VIDEO_BUCKET = "mentor-videos";
const MENTOR_THUMB_BUCKET = "mentor-videos-thumbnail";

function storagePathFromPublicUrl(url, bucket) {
  if (!url || typeof url !== "string") return null;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(url.slice(idx + marker.length).split("?")[0]);
}

/** Delete mentor video row + best-effort storage objects. */
export async function deleteMentorUploadedVideo(config, video) {
  const supabase = getSupabaseClient(config);
  const id = video?.id;
  if (!id) throw new Error("Video id required");

  const paths = [];
  if (video.storage_path) paths.push(video.storage_path);
  const fromUrl = storagePathFromPublicUrl(video.video_url, MENTOR_VIDEO_BUCKET);
  if (fromUrl && !paths.includes(fromUrl)) paths.push(fromUrl);

  if (paths.length) {
    await supabase.storage.from(MENTOR_VIDEO_BUCKET).remove(paths).catch(() => {});
  }

  const thumbPath = storagePathFromPublicUrl(video.thumbnail_url, MENTOR_THUMB_BUCKET);
  if (thumbPath) {
    await supabase.storage.from(MENTOR_THUMB_BUCKET).remove([thumbPath]).catch(() => {});
  }

  // The HLS ladder lives under hls/<id>/ as a folder of manifests and segments,
  // not a single object, so it has to be listed before it can be removed.
  try {
    const { data: hlsFiles } = await supabase.storage
      .from(MENTOR_VIDEO_BUCKET)
      .list(`hls/${id}`);
    if (hlsFiles?.length) {
      await supabase.storage
        .from(MENTOR_VIDEO_BUCKET)
        .remove(hlsFiles.map((f) => `hls/${id}/${f.name}`));
    }
  } catch {
    // Best-effort, like the others: an orphaned segment must not block the delete.
  }

  const { error } = await supabase.from("mentor_videos").delete().eq("id", id);
  if (error) throw error;
}

/** Session recordings where the user is mentor or learner (metadata only — URLs on play). */
export async function listUserSessionRecordings(config, userId) {
  const supabase = getSupabaseClient(config);
  const { data, error } = await supabase
    .from("recordings")
    .select("id, booking_id, meeting_id, mentor_id, learner_id, recorded_at, created_at")
    .or(`mentor_id.eq.${userId},learner_id.eq.${userId}`)
    .order("recorded_at", { ascending: false });
  if (error) throw error;

  const rows = data || [];
  const otherIds = [
    ...new Set(
      rows.flatMap((r) => [r.mentor_id, r.learner_id]).filter((id) => id && id !== userId)
    ),
  ];
  const profileById = await fetchProfilesByIds(config, otherIds);

  return rows.map((row) => ({
    ...row,
    source: "app",
    roomId: row.meeting_id || null,
    status: "ready",
    role: row.mentor_id === userId ? "mentor" : "learner",
    counterpart_name:
      profileById[row.mentor_id === userId ? row.learner_id : row.mentor_id]?.name ?? null,
    counterpart_email:
      profileById[row.mentor_id === userId ? row.learner_id : row.mentor_id]?.email ?? null,
  }));
}

/** Fetch playable URLs for one app recording (called on Play). */
export async function getAppSessionRecording(config, recordingId) {
  const supabase = getSupabaseClient(config);
  const { data, error } = await supabase
    .from("recordings")
    .select(
      "id, booking_id, meeting_id, mentor_id, learner_id, recording_url, recording_playback_url, recorded_at, created_at"
    )
    .eq("id", recordingId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Recording not found");

  const fileUrl = data.recording_playback_url || data.recording_url || null;
  return {
    ...data,
    source: "app",
    roomId: data.meeting_id || null,
    status: fileUrl ? "ready" : "pending",
    fileUrl,
    url: fileUrl,
  };
}

function sortRowsClientSide(rows, sortCol, sortDir) {
  if (!sortCol) return rows;
  const ascending = sortDir === "asc";
  return [...rows].sort((a, b) => {
    const left = String(a[sortCol] ?? "").toLowerCase();
    const right = String(b[sortCol] ?? "").toLowerCase();
    return ascending ? left.localeCompare(right) : right.localeCompare(left);
  });
}

async function enrichMentorRowsWithProfiles(config, rows) {
  if (!rows?.length) return [];

  const profileById = await fetchProfilesByIds(
    config,
    rows.map((row) => row.id)
  );

  return rows.map((row) => ({
    ...row,
    name: profileById[row.id]?.name ?? null,
    email: profileById[row.id]?.email ?? null,
  }));
}

const MENTOR_PROFILE_SORT_FROM_PROFILES = ["name", "email"];
const BOOKING_SORT_FROM_PROFILES = ["mentor_name", "learner_name", "mentor_email", "learner_email"];

/** Mentor profile rows with linked profile name/email (mentor_profiles.id → profiles.id). */
export async function listMentorProfileRows(config, options = {}) {
  if (typeof options === "number") options = { limit: options };

  const sortFromProfile = MENTOR_PROFILE_SORT_FROM_PROFILES.includes(options.sortCol);
  const { rows, count, people } = await listTableRows(
    config,
    "mentor_profiles",
    sortFromProfile ? { ...options, sortCol: null } : options
  );

  let enriched = await enrichMentorRowsWithProfiles(config, rows);
  if (sortFromProfile) {
    enriched = sortRowsClientSide(enriched, options.sortCol, options.sortDir);
  }

  return { rows: enriched, count, people };
}

/** Booking rows with mentor/learner names from profiles (mentor_id, learner_id → profiles.id). */
export async function listBookingRows(config, options = {}) {
  if (typeof options === "number") options = { limit: options };

  const sortFromProfile = BOOKING_SORT_FROM_PROFILES.includes(options.sortCol);
  const { rows, count, people } = await listTableRows(
    config,
    "bookings",
    sortFromProfile ? { ...options, sortCol: null } : options
  );

  const profileById = await fetchProfilesByIds(
    config,
    rows.flatMap((row) => [row.mentor_id, row.learner_id])
  );

  let enriched = rows.map((row) => ({
    ...row,
    mentor_name: profileById[row.mentor_id]?.name ?? null,
    learner_name: profileById[row.learner_id]?.name ?? null,
    mentor_email: profileById[row.mentor_id]?.email ?? null,
    learner_email: profileById[row.learner_id]?.email ?? null,
  }));

  if (sortFromProfile) {
    enriched = sortRowsClientSide(enriched, options.sortCol, options.sortDir);
  }

  return { rows: enriched, count, people };
}

export async function callAdminRpc(config, fnName, args = {}) {
  const supabase = getSupabaseClient(config);
  const { data, error } = await supabase.rpc(fnName, args);
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

/** User report rows enriched with reporter + reported profile name/email. */
export async function listUserReportRows(config, options = {}) {
  if (typeof options === "number") options = { limit: options };

  const { rows, count } = await listTableRows(config, "user_reports", options);

  const profileById = await fetchProfilesByIds(
    config,
    rows.flatMap((row) => [row.reporter_id, row.reported_user_id])
  );

  const enriched = rows.map((row) => ({
    ...row,
    reporter_name: profileById[row.reporter_id]?.name ?? null,
    reporter_email: profileById[row.reporter_id]?.email ?? null,
    reported_name: profileById[row.reported_user_id]?.name ?? null,
    reported_email: profileById[row.reported_user_id]?.email ?? null,
  }));

  return { rows: enriched, count };
}

export async function updateUserReportStatus(config, reportId, status, operator = null) {
  return callAdminRpc(config, "admin_update_user_report_status", {
    p_id: reportId,
    p_status: status,
    p_operator: operator,
  });
}

export async function freezeMentor(config, mentorId, { until = null, reason = null, operator = null } = {}) {
  return callAdminRpc(config, "admin_freeze_mentor", {
    p_id: mentorId,
    p_until: until,
    p_reason: reason,
    p_operator: operator,
  });
}

export async function unfreezeMentor(config, mentorId, operator = null) {
  return callAdminRpc(config, "admin_unfreeze_mentor", {
    p_id: mentorId,
    p_operator: operator,
  });
}

/** Every visible mentor with trending score + pin/hide overrides, in Welcome-screen order. */
export async function getTrendingBoard(config) {
  const supabase = getSupabaseClient(config);
  const { data, error } = await supabase.rpc("admin_get_trending_board");
  if (error) throw error;
  return data || [];
}

/** Replace the ordered pin list (first id = first card on the Welcome screen). */
export async function setTrendingPins(config, mentorIds) {
  return callAdminRpc(config, "admin_set_trending_pins", { p_mentor_ids: mentorIds });
}

export async function setTrendingHidden(config, mentorId, hidden) {
  return callAdminRpc(config, "admin_set_trending_hidden", {
    p_mentor_id: mentorId,
    p_hidden: Boolean(hidden),
  });
}

/** Withdrawal request rows enriched with mentor name/email and current wallet balance. */
export async function listWithdrawalRequestRows(config, options = {}) {
  if (typeof options === "number") options = { limit: options };

  const { rows, count } = await listTableRows(config, "withdrawal_requests", options);

  const mentorIds = [...new Set(rows.map((row) => row.mentor_id).filter(Boolean))];
  const profileById = await fetchProfilesByIds(config, mentorIds);

  const supabase = getSupabaseClient(config);
  const { data: wallets, error: walletError } = mentorIds.length
    ? await supabase.from("mentor_wallets").select("id, balance").in("id", mentorIds)
    : { data: [], error: null };
  if (walletError) throw walletError;
  const walletById = Object.fromEntries((wallets || []).map((wallet) => [wallet.id, wallet]));

  const enriched = rows.map((row) => ({
    ...row,
    mentor_name: profileById[row.mentor_id]?.name ?? null,
    mentor_email: profileById[row.mentor_id]?.email ?? null,
    wallet_balance: walletById[row.mentor_id]?.balance ?? null,
  }));

  return { rows: enriched, count };
}

export async function createTableRow(config, tableName, payload) {
  assertAllowedTable(tableName);
  const supabase = getSupabaseClient(config);
  const { data, error } = await supabase.from(tableName).insert(payload).select();
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function updateTableRow(config, tableName, id, payload) {
  assertAllowedTable(tableName);
  const supabase = getSupabaseClient(config);
  const { data, error } = await supabase
    .from(tableName)
    .update(payload)
    .eq("id", id)
    .select();
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function deleteTableRow(config, tableName, id) {
  assertAllowedTable(tableName);
  const supabase = getSupabaseClient(config);
  const { error } = await supabase.from(tableName).delete().eq("id", id);
  if (error) throw error;
}

const MARKETING_BUCKET = "marketing-clips";

/**
 * Upload a video file to public marketing storage; returns public URL for home_marketing_clips.media_url.
 */
export async function uploadMarketingClipFile(config, file) {
  const supabase = getSupabaseClient(config);
  const safeName = String(file?.name || "clip.mp4").replace(/[^\w.-]+/g, "_");
  const path = `uploads/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from(MARKETING_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: true,
    contentType: file.type || "video/mp4",
  });
  if (error) throw error;
  const { data } = supabase.storage.from(MARKETING_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) throw new Error("Could not resolve public URL for upload");
  return data.publicUrl;
}

export async function deleteMarketingStorageObjectByPublicUrl(config, publicUrl) {
  const supabase = getSupabaseClient(config);
  const marker = `/storage/v1/object/public/${MARKETING_BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return;
  const objectPath = publicUrl.slice(idx + marker.length);
  if (!objectPath) return;
  const { error } = await supabase.storage.from(MARKETING_BUCKET).remove([objectPath]);
  if (error) throw error;
}

const HERO_SLIDES_BUCKET = "hero_slides";

export async function uploadHeroSlide(config, file) {
  const supabase = getSupabaseClient(config);
  const safeName = String(file?.name || "slide.jpg").replace(/[^\w.-]+/g, "_");
  const path = `${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(HERO_SLIDES_BUCKET)
    .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type || "image/jpeg" });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(HERO_SLIDES_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) throw new Error("Could not resolve public URL for upload");

  return { publicUrl: data.publicUrl, storagePath: path };
}

export async function deleteHeroSlideStorage(config, storagePath) {
  if (!storagePath) return;
  const supabase = getSupabaseClient(config);
  const { error } = await supabase.storage.from(HERO_SLIDES_BUCKET).remove([storagePath]);
  if (error) throw error;
}

const FETCH_BATCH = 1000;

/** Every row of a table (selected columns only), fetched in batches — no silent 1,000-row cap. */
export async function listAllRows(config, tableName, columns = "*") {
  assertAllowedTable(tableName);
  const supabase = getSupabaseClient(config);
  const rows = [];
  for (let from = 0; ; from += FETCH_BATCH) {
    const { data, error } = await supabase
      .from(tableName)
      .select(columns)
      .order("id", { ascending: true }) // stable order so batches never overlap or skip
      .range(from, from + FETCH_BATCH - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < FETCH_BATCH) return rows;
  }
}

/** How each transaction status counts toward money totals. */
export const TX_STATUS_GROUPS = {
  collected: ["paid", "completed", "captured", "success"],
  unpaid: ["created", "pending", "initiated"],
  failed: ["failed"],
  refunded: ["refunded"],
};

function txGroup(status) {
  const s = String(status || "").toLowerCase();
  return Object.keys(TX_STATUS_GROUPS).find((group) => TX_STATUS_GROUPS[group].includes(s)) || "other";
}

// Money is summed in whole paise (exact integers) and converted once at the end;
// adding rupee floats directly drifts (e.g. 2,500 × ₹0.10 → ₹249.99999999999).
const asPaise = (paise) => Math.round(Number(paise) || 0);
const rupeesAsPaise = (rupees) => Math.round((Number(rupees) || 0) * 100);
const toRupees = (paise) => paise / 100;

/**
 * Payment figures for the Payments overview, computed over all rows.
 * Only `collected` transactions count as money received; unpaid checkouts are reported separately.
 */
export async function getPaymentSummary(config) {
  const [transactions, earnings, wallets, withdrawals] = await Promise.all([
    listAllRows(config, "transactions", "id, status, amount_total_paise, mentor_earning_paise, platform_fee_paise"),
    listAllRows(config, "earnings", "id, status, amount"),
    listAllRows(config, "mentor_wallets", "id, balance, total_earned, total_withdrawn"),
    listAllRows(config, "withdrawal_requests", "id, status, amount"),
  ]);

  const tx = { collected: null, unpaid: null, failed: null, refunded: null, other: null };
  Object.keys(tx).forEach((k) => { tx[k] = { count: 0, total: 0, mentor: 0, platform: 0 }; });
  const byStatus = {};

  transactions.forEach((row) => {
    const total = asPaise(row.amount_total_paise);
    const bucket = tx[txGroup(row.status)];
    bucket.count += 1;
    bucket.total += total;
    bucket.mentor += asPaise(row.mentor_earning_paise);
    bucket.platform += asPaise(row.platform_fee_paise);

    const status = String(row.status || "unknown").toLowerCase();
    byStatus[status] ??= { status, group: txGroup(status), count: 0, total: 0 };
    byStatus[status].count += 1;
    byStatus[status].total += total;
  });

  // Convert the paise accumulators to rupees for display.
  Object.values(tx).forEach((bucket) => {
    bucket.total = toRupees(bucket.total);
    bucket.mentor = toRupees(bucket.mentor);
    bucket.platform = toRupees(bucket.platform);
  });
  Object.values(byStatus).forEach((entry) => {
    entry.total = toRupees(entry.total);
  });

  const sumRupees = (rows, field) => toRupees(rows.reduce((sum, row) => sum + rupeesAsPaise(row[field]), 0));
  const sumBy = (rows, predicate) => {
    const matching = rows.filter(predicate);
    return { count: matching.length, total: sumRupees(matching, "amount") };
  };
  const isStatus = (...statuses) => (row) => statuses.includes(String(row.status || "").toLowerCase());

  return {
    transactions: {
      ...tx,
      count: transactions.length,
      byStatus: Object.values(byStatus).sort((a, b) => b.total - a.total),
    },
    earnings: {
      count: earnings.length,
      completed: sumBy(earnings, isStatus("completed", "paid")),
      pending: sumBy(earnings, isStatus("pending", "unpaid")),
    },
    wallets: {
      count: wallets.length,
      balance: sumRupees(wallets, "balance"),
      earned: sumRupees(wallets, "total_earned"),
      withdrawn: sumRupees(wallets, "total_withdrawn"),
    },
    withdrawals: {
      count: withdrawals.length,
      pending: sumBy(withdrawals, isStatus("pending")),
      approved: sumBy(withdrawals, isStatus("approved", "paid", "processed")),
    },
  };
}

/** Largest minimum an admin may set (₹10,00,000) — guards against a stray extra zero. */
export const MAX_MIN_WITHDRAWAL = 1000000;

/**
 * Payout settings (single row, id = true). Returns null when the payout_settings
 * table doesn't exist yet (migration 20261024000000 not applied).
 * The minimum is enforced server-side by deduct_wallet_for_withdrawal.
 */
export async function getPayoutSettings(config) {
  const supabase = getSupabaseClient(config);
  const { data, error } = await supabase
    .from("payout_settings")
    .select("min_withdrawal_amount, updated_at, updated_by")
    .eq("id", true)
    .maybeSingle();
  if (error) {
    // 42P01 = undefined table (Postgres); PGRST205 = table not in PostgREST schema cache.
    if (error.code === "42P01" || error.code === "PGRST205") return null;
    throw error;
  }
  return data ? { ...data, min_withdrawal_amount: Number(data.min_withdrawal_amount) } : null;
}

/** Set the minimum withdrawal (whole rupees). Admin-only via RLS (is_admin()). */
export async function updateMinWithdrawal(config, amount, operator) {
  const value = Number(amount);
  if (!Number.isInteger(value) || value < 1 || value > MAX_MIN_WITHDRAWAL) {
    throw new Error(`Minimum must be a whole number of rupees between ₹1 and ₹${MAX_MIN_WITHDRAWAL.toLocaleString("en-IN")}`);
  }
  const supabase = getSupabaseClient(config);
  const { data, error } = await supabase
    .from("payout_settings")
    .update({ min_withdrawal_amount: value, updated_at: new Date().toISOString(), updated_by: operator || null })
    .eq("id", true)
    .select("min_withdrawal_amount, updated_at, updated_by")
    .maybeSingle();
  if (error) throw error;
  // RLS silently matches zero rows for non-admins instead of erroring.
  if (!data) throw new Error("Not saved — your account isn't allowed to change payout settings.");
  return { ...data, min_withdrawal_amount: Number(data.min_withdrawal_amount) };
}

/**
 * Email tracking for every creator (columns added to mentor_profiles by migration
 * 20261025000000), with name/email and account state (login freeze, creator freeze,
 * deleted). Emails follow the account state. Newest email activity first.
 */
export async function listCreatorEmailTracking(config) {
  const supabase = getSupabaseClient(config);
  const { data, error } = await supabase
    .from("mentor_profiles")
    .select(
      "id, greeting_mail_sent, greeting_mail_sent_at, profile_completeness, open_slots_mail_count, last_open_slots_mail_at, " +
        "mentor_frozen, mentor_frozen_until, mentor_freeze_reason"
    );
  if (error) throw error;

  const rows = data || [];
  const ids = rows.map((row) => row.id);
  const { data: profiles, error: profileError } = ids.length
    ? await supabase.from("profiles").select("id, name, email, is_frozen, deleted_at").in("id", ids)
    : { data: [], error: null };
  if (profileError) throw profileError;
  const profileById = Object.fromEntries((profiles || []).map((profile) => [profile.id, profile]));

  const lastActivity = (row) => Math.max(
    Date.parse(row.greeting_mail_sent_at || 0) || 0,
    Date.parse(row.last_open_slots_mail_at || 0) || 0
  );

  return rows
    .map((row) => {
      const profile = profileById[row.id];
      return {
        ...row,
        name: profile?.name ?? null,
        email: profile?.email ?? null,
        is_frozen: Boolean(profile?.is_frozen),
        deleted_at: profile?.deleted_at ?? null,
        // No profile row means the account no longer exists.
        profile_missing: !profile,
      };
    })
    .sort((a, b) => lastActivity(b) - lastActivity(a) || String(a.name || "").localeCompare(String(b.name || "")));
}

export async function listDashboardStats(config) {
  const [profiles, bookings, mentorProfiles] = await Promise.all([
    listTableRows(config, "profiles", 1),
    listTableRows(config, "bookings", 1),
    listTableRows(config, "mentor_profiles", 1),
  ]);

  return {
    usersCount: profiles.count,
    bookingsCount: bookings.count,
    mentorsCount: mentorProfiles.count,
  };
}

/**
 * App recordings list — metadata only (no URLs).
 * Call getAppSessionRecording(id) when the admin hits Play.
 */
export async function listAppSessionRecordings(config, { limit = 200 } = {}) {
  const supabase = getSupabaseClient(config);
  const { data, error } = await supabase
    .from("recordings")
    .select("id, booking_id, meeting_id, mentor_id, learner_id, recorded_at, created_at")
    .order("recorded_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  const rows = data || [];
  const profileById = await fetchProfilesByIds(
    config,
    rows.flatMap((row) => [row.mentor_id, row.learner_id])
  );

  return rows.map((row) => ({
    id: row.id,
    booking_id: row.booking_id,
    meeting_id: row.meeting_id,
    mentor_id: row.mentor_id,
    learner_id: row.learner_id,
    recorded_at: row.recorded_at,
    created_at: row.created_at,
    source: "app",
    roomId: row.meeting_id || null,
    // URLs load on Play — treat listed rows as ready until proven otherwise
    status: "ready",
    mentor_name: profileById[row.mentor_id]?.name ?? null,
    learner_name: profileById[row.learner_id]?.name ?? null,
  }));
}

/** Recent bookings that have (or had) a VideoSDK meeting — admin sessions fallback. */
export async function listAppSessionsFromBookings(config, { limit = 200 } = {}) {
  const supabase = getSupabaseClient(config);
  const { data, error } = await supabase
    .from("bookings")
    .select("id, mentor_id, learner_id, status, meeting_id, created_at")
    .not("meeting_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  const rows = data || [];
  const profileById = await fetchProfilesByIds(
    config,
    rows.flatMap((row) => [row.mentor_id, row.learner_id])
  );

  return rows.map((row) => ({
    id: row.id,
    roomId: row.meeting_id,
    status: row.status,
    start: row.created_at,
    end: row.created_at,
    source: "app",
    mentor_name: profileById[row.mentor_id]?.name ?? null,
    learner_name: profileById[row.learner_id]?.name ?? null,
    mentor_id: row.mentor_id,
    learner_id: row.learner_id,
  }));
}

export async function listVideoSdkOverview(config) {
  const [recordings, sessions] = await Promise.all([
    listVideoSdkRecordings(config),
    listVideoSdkSessions(config),
  ]);

  return {
    recordings,
    sessions,
  };
}

export {
  listVideoSdkRecordings,
  listVideoSdkSessions,
  getVideoSdkRecording,
  deleteVideoSdkRecording,
};
