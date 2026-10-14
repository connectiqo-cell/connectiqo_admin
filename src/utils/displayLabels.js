const ROLE_WORDS = [
  [/\bMentors\b/g, "Creators"],
  [/\bMentor\b/g, "Creator"],
  [/\bLearners\b/g, "Customers"],
  [/\bLearner\b/g, "Booked By"],
];

/**
 * Header label generated from a column/key name. With `raw`, keeps the plain
 * humanized name (Database Explorer shows real column names).
 */
export function columnDisplayLabel(column, { raw = false } = {}) {
  const label = String(column)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  if (raw) return label;
  return ROLE_WORDS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), label);
}

/** Profile role value as shown to admins (both app roles are "creator"). */
export function roleDisplayLabel(role) {
  const value = String(role || "").toLowerCase();
  return value === "mentor" || value === "learner" ? "creator" : role;
}
