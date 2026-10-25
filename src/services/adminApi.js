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

export async function listTableRows(config, tableName, options = {}) {
  // backward compat: plain number treated as limit
  if (typeof options === "number") options = { limit: options };

  const {
    limit = null,
    page = 1,
    pageSize = 25,
    sortCol = null,
    sortDir = "asc",
    filters = {},
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

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: data || [], count: count || 0 };
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

/** Uploaded mentor library videos for a user. */
export async function listMentorUploadedVideos(config, mentorId) {
  const supabase = getSupabaseClient(config);
  const { data, error } = await supabase
    .from("mentor_videos")
    .select(
      "id, mentor_id, title, description, video_url, thumbnail_url, is_free, position, created_at, storage_path"
    )
    .eq("mentor_id", mentorId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: false });
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

export async function getMentorUploadedVideo(config, videoId) {
  const supabase = getSupabaseClient(config);
  const { data, error } = await supabase
    .from("mentor_videos")
    .select(
      "id, mentor_id, title, description, video_url, thumbnail_url, is_free, position, is_promoted, promoted_at, created_at, storage_path"
    )
    .eq("id", videoId)
    .maybeSingle();
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
  const { rows, count } = await listTableRows(
    config,
    "mentor_profiles",
    sortFromProfile ? { ...options, sortCol: null } : options
  );

  let enriched = await enrichMentorRowsWithProfiles(config, rows);
  if (sortFromProfile) {
    enriched = sortRowsClientSide(enriched, options.sortCol, options.sortDir);
  }

  return { rows: enriched, count };
}

/** Booking rows with mentor/learner names from profiles (mentor_id, learner_id → profiles.id). */
export async function listBookingRows(config, options = {}) {
  if (typeof options === "number") options = { limit: options };

  const sortFromProfile = BOOKING_SORT_FROM_PROFILES.includes(options.sortCol);
  const { rows, count } = await listTableRows(
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

  return { rows: enriched, count };
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

/** app_config is keyed by `key`, not `id`, so it needs its own upsert. */
export async function saveAppConfig(config, entries) {
  const supabase = getSupabaseClient(config);
  const rows = Object.entries(entries).map(([key, value]) => ({ key, value: String(value) }));
  const { error } = await supabase.from("app_config").upsert(rows, { onConflict: "key" });
  if (error) throw error;
}

export async function createTableRow(config, tableName, payload) {
  const supabase = getSupabaseClient(config);
  const { data, error } = await supabase.from(tableName).insert(payload).select();
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function updateTableRow(config, tableName, id, payload) {
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
  const safeName = String(file?.name || "clip.mp4").replace(/[^\w.\-]+/g, "_");
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
  const safeName = String(file?.name || "slide.jpg").replace(/[^\w.\-]+/g, "_");
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
