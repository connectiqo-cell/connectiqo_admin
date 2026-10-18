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
  "platform_fee_rules",
  "hero_slides",
  "transactions",
  "earnings",
  "mentor_wallets",
  "withdrawal_requests",
  "availability_slots",
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
};

/**
 * Columns holding a profiles.id (from the database's foreign keys), with the label to show.
 * Tables list these people by name instead of by UUID.
 */
export const PERSON_COLUMNS = {
  bookings: { learner_id: "Learner", mentor_id: "Mentor" },
  transactions: { learner_id: "Learner", mentor_id: "Mentor" },
  earnings: { mentor_id: "Mentor" },
  withdrawal_requests: { mentor_id: "Mentor" },
  availability_slots: { mentor_id: "Mentor" },
  mentor_wallets: { id: "Mentor" },
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
