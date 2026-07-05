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
  mentor_wallets: { column: "updated_at", ascending: false },
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
  "app_categories",
  "platform_fee_rules",
  "hero_slides",
  "transactions",
  "earnings",
  "mentor_wallets",
  "withdrawal_requests",
  "availability_slots",
  "wallet_transactions",
]);

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

  // Server-side search: only applied when the caller supplies real, text-typed
  // column names — this filters the whole table, not just the current page.
  const trimmedSearch = search.trim();
  if (trimmedSearch && searchColumns.length) {
    const escaped = trimmedSearch.replace(/[%,()]/g, "");
    if (escaped) {
      const orExpr = searchColumns.map((col) => `${col}.ilike.%${escaped}%`).join(",");
      query = query.or(orExpr);
    }
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: data || [], count: count || 0 };
}

async function fetchProfilesByIds(config, ids) {
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
