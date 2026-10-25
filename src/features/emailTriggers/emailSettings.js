/** Sender and SMTP details used for Connectiqo emails. */
export const DEFAULT_EMAIL_SETTINGS = {
  senderEmail: "connectiqo@gmail.com",
  senderName: "Connectiqo",
  host: "smtp.gmail.com",
  port: "465",
  username: "connectiqo@gmail.com",
  password: "",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Returns field → message for anything that needs fixing (empty object when valid). */
export function validateEmailSettings(form) {
  const errors = {};
  const port = Number(form.port);
  if (!EMAIL_RE.test(String(form.senderEmail || "").trim())) errors.senderEmail = "Enter a valid email address.";
  if (!String(form.senderName || "").trim()) errors.senderName = "Enter a sender name.";
  if (!/^[a-z0-9.-]+$/i.test(String(form.host || "").trim())) errors.host = "Enter a hostname or IP address.";
  if (!Number.isInteger(port) || port < 1 || port > 65535) errors.port = "Enter a port between 1 and 65535.";
  if (!String(form.username || "").trim()) errors.username = "Enter the SMTP username.";
  return errors;
}
