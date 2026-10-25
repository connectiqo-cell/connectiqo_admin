/**
 * Account state that decides whether a creator gets emails, in priority order.
 * Mirrors can_email_user() in the database:
 *   deleted        → never emailed
 *   login_frozen   → no emails while frozen
 *   creator_frozen → no creator emails while the freeze is in effect
 *   active         → receives emails
 */
export function accountStatus(row, now = Date.now()) {
  if (!row || row.profile_missing || row.deleted_at) return "deleted";
  if (row.is_frozen) return "login_frozen";
  if (row.mentor_frozen && (!row.mentor_frozen_until || Date.parse(row.mentor_frozen_until) > now)) return "creator_frozen";
  return "active";
}

export const canReceiveEmails = (row, now = Date.now()) => accountStatus(row, now) === "active";

/** Filters creator rows by name/email search, greeting and account status. */
export function filterCreatorRows(rows, { query = "", greeting = "all", account = "all", now = Date.now() } = {}) {
  const q = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (greeting === "sent" && !row.greeting_mail_sent) return false;
    if (greeting === "not_sent" && row.greeting_mail_sent) return false;
    if (account === "frozen") {
      const status = accountStatus(row, now);
      if (status !== "login_frozen" && status !== "creator_frozen") return false;
    } else if (account !== "all" && accountStatus(row, now) !== account) {
      return false;
    }
    if (!q) return true;
    return [row.name, row.email].some((value) => String(value || "").toLowerCase().includes(q));
  });
}

/** Totals shown above the creators table. */
export function summarizeCreatorRows(rows, now = Date.now()) {
  const statuses = rows.map((row) => accountStatus(row, now));
  return {
    total: rows.length,
    receiving: statuses.filter((s) => s === "active").length,
    frozen: statuses.filter((s) => s === "login_frozen" || s === "creator_frozen").length,
    deleted: statuses.filter((s) => s === "deleted").length,
    greetingSent: rows.filter((row) => row.greeting_mail_sent).length,
    sessionMails: rows.reduce((sum, row) => sum + (Number(row.open_slots_mail_count) || 0), 0),
  };
}
