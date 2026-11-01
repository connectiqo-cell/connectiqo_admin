// @vitest-environment jsdom
import { cleanup, fireEvent, render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  setEmailSmtp: vi.fn(),
  getEmailControl: vi.fn(),
  listCreatorEmailTracking: vi.fn(),
  listCompanyEmailTracking: vi.fn(),
  listEmailOutbox: vi.fn(),
  queueTestEmail: vi.fn(),
  retryEmail: vi.fn(),
  setEmailsPaused: vi.fn(),
  updateEmailSettings: vi.fn(),
  updateEmailTemplate: vi.fn(),
}));
const addLog = vi.hoisted(() => vi.fn());
const addToast = vi.hoisted(() => vi.fn());

vi.mock("../../services/adminApi.js", () => api);
const environment = vi.hoisted(() => ({ config: {}, environment: "production" }));
vi.mock("../../app/providers/EnvironmentProvider.jsx", () => ({ useEnvironment: () => environment }));
vi.mock("../../app/providers/AuditProvider.jsx", () => ({ useAudit: () => ({ addLog }) }));
vi.mock("../../app/providers/ToastProvider.jsx", () => ({ useToast: () => ({ addToast }) }));
vi.mock("../../app/providers/AuthProvider.jsx", () => ({ useAuth: () => ({ session: { user: { email: "admin@x.co" } } }) }));

import { EmailTriggersPage } from "./EmailTriggersPage.jsx";
import { draftFromTemplate, overridesFromDraft, validateReminderRules, workerHealth } from "./emailControl.js";

const control = (over = {}) => ({
  settings: {
    emails_paused: false,
    profile_reminder_after_days: 3,
    profile_reminder_every_days: 3,
    profile_reminder_max: 3,
    profile_reminder_stop_above: 75,
    ...over.settings,
  },
  templates: ["creator_welcome", "creator_session_booked", "creator_profile_reminder"].map((template) => ({ template, enabled: true })),
  worker: {
    last_seen_at: new Date().toISOString(),
    mode: "test",
    sender_name: "Connectiqo",
    sender_email: "connectiqo@gmail.com",
    smtp_host: "smtp.gmail.com",
    smtp_port: 465,
    smtp_ok: true,
    allowed_recipients: ["ramvish9923@gmail.com"],
    ...over.worker,
  },
  counts: { waiting: 4, failed: 1, sentToday: 7, unsubscribed: 2, ...over.counts },
});

beforeEach(() => {
  api.getEmailControl.mockResolvedValue(control());
  api.updateEmailTemplate.mockResolvedValue({});
  api.setEmailsPaused.mockResolvedValue(0);
  api.updateEmailSettings.mockResolvedValue({});
  api.queueTestEmail.mockResolvedValue("id");
  api.retryEmail.mockResolvedValue();
  api.listCreatorEmailTracking.mockResolvedValue([]);
  api.listEmailOutbox.mockResolvedValue([]);
});
const render = (ui) => rtlRender(<BrowserRouter>{ui}</BrowserRouter>);
afterEach(() => window.history.replaceState(null, "", "/"));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const openEditor = async (label = "Welcome") => {
  render(<EmailTriggersPage />);
  const row = (await screen.findByLabelText(`${label} email`)).closest(".email-type-row");
  fireEvent.click(within(row).getByRole("button", { name: "Edit email" }));
  return screen.findByRole("dialog");
};

const openTab = async (name) => fireEvent.click(await screen.findByRole("tab", { name }));

describe("Email control", () => {
  it("explains what to do before the migration is applied", async () => {
    api.getEmailControl.mockResolvedValue(null);
    render(<EmailTriggersPage />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/aren't set up in the database yet/);
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("says in one sentence who receives email right now", async () => {
    render(<EmailTriggersPage />);
    expect(await screen.findByRole("heading", { name: "Test mode" })).toBeTruthy();
    expect(screen.getByText("Only ramvish9923@gmail.com receives automatic emails. Everyone else is skipped.")).toBeTruthy();
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });

  it("the headline warns when the email service has stopped, never started or can't connect", async () => {
    api.getEmailControl.mockResolvedValue(control({ worker: { last_seen_at: new Date(Date.now() - 3600000).toISOString() } }));
    render(<EmailTriggersPage />);
    expect(await screen.findByRole("heading", { name: "Email service has stopped" })).toBeTruthy();
    cleanup();
    api.getEmailControl.mockResolvedValue({ ...control(), worker: null });
    render(<EmailTriggersPage />);
    expect(await screen.findByRole("heading", { name: "Email service isn't running yet" })).toBeTruthy();
    cleanup();
    api.getEmailControl.mockResolvedValue(control({ worker: { smtp_ok: false } }));
    render(<EmailTriggersPage />);
    expect(await screen.findByRole("heading", { name: "Can't connect to the mail server" })).toBeTruthy();
  });

  it("clicking a number opens History with that filter", async () => {
    render(<EmailTriggersPage />);
    fireEvent.click(await screen.findByRole("button", { name: /1\s*Failed/ }));
    expect((await screen.findByRole("tab", { name: "History" })).getAttribute("aria-selected")).toBe("true");
    await waitFor(() => expect(api.listEmailOutbox).toHaveBeenCalledWith({}, { status: "failed", limit: 1000 }));
  });

  const setupControl = (worker = {}) => control({
    settings: { sender_name: null, sender_email: null, reply_to: null, support_email: null },
    worker: { smtp_user: "old@x.co", sender_email: "old@x.co", reply_to: "reply@x.co", support_email: "help@x.co", ...worker },
  });
  const openSetupForm = async () => {
    api.getEmailControl.mockResolvedValue(setupControl());
    render(<EmailTriggersPage />);
    await openTab("Setup");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    return screen.getByRole("button", { name: "Save" });
  };
  const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

  it("the Setup tab shows only the seven settings, with the password hidden", async () => {
    api.getEmailControl.mockResolvedValue(setupControl());
    render(<EmailTriggersPage />);
    expect(screen.queryByText("Sender Name")).toBeNull();
    await openTab("Setup");
    const labels = [...document.querySelectorAll(".details-list dt")].map((node) => node.textContent);
    expect(labels).toEqual(["Sender Name", "Sender Email", "Host", "Port", "Password", "Reply To Address", "Support Address"]);
    const values = [...document.querySelectorAll(".details-list dd")].map((node) => node.textContent);
    expect(values).toEqual(["Connectiqo", "old@x.co", "smtp.gmail.com", "465", "••••••••", "reply@x.co", "help@x.co"]);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getAllByRole("button", { name: /^Edit/ })).toHaveLength(1);
  });

  it("shows a mail server error on the Setup tab", async () => {
    api.getEmailControl.mockResolvedValue(setupControl({ smtp_ok: false, smtp_error: "535 Bad credentials" }));
    render(<EmailTriggersPage />);
    await openTab("Setup");
    expect(screen.getByRole("alert").textContent).toBe("535 Bad credentials");
  });

  it("changing only the sender name or addresses keeps the current password", async () => {
    const save = await openSetupForm();
    expect(save.disabled).toBe(true);
    type("Reply To Address", "not-an-email");
    expect(screen.getByText("Enter a valid email address.")).toBeTruthy();
    expect(save.disabled).toBe(true);
    type("Reply To Address", " hello@x.co ");
    type("Sender Name", "Team");
    fireEvent.click(save);
    await waitFor(() =>
      expect(api.updateEmailSettings).toHaveBeenCalledWith({}, { sender_name: "Team", sender_email: "old@x.co", reply_to: "hello@x.co", support_email: "help@x.co" })
    );
    expect(api.setEmailSmtp).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByLabelText("Sender Name")).toBeNull());
  });

  it("can move to another mail provider; the password goes to the server but not the audit log", async () => {
    api.setEmailSmtp.mockResolvedValue();
    const save = await openSetupForm();
    expect(screen.getByLabelText("Password").value).toBe("");
    type("Sender Email", "hello@company.com");
    type("Host", "smtp.hostinger.com");
    type("Port", "587");
    expect(screen.getByText("Enter the password for this account.")).toBeTruthy();
    expect(save.disabled).toBe(true);
    type("Password", "my secret");
    fireEvent.click(save);
    await waitFor(() =>
      expect(api.setEmailSmtp).toHaveBeenCalledWith({}, { host: "smtp.hostinger.com", port: 587, user: "hello@company.com", password: "my secret", operator: "admin@x.co" })
    );
    await waitFor(() => expect(addLog).toHaveBeenCalled());
    expect(JSON.stringify(addLog.mock.calls)).not.toContain("my secret");
    expect(addLog.mock.calls[0][0].payload).toMatchObject({ smtp_host: "smtp.hostinger.com", smtp_port: 587, password_changed: true });
    await waitFor(() => expect(document.querySelector('input[type="password"]')).toBeNull());
  });

  it("rejects a bad host or port", async () => {
    const save = await openSetupForm();
    type("Host", "smtp host");
    type("Port", "70000");
    type("Password", "x");
    expect(screen.getByText("Enter a host, like smtp.hostinger.com.")).toBeTruthy();
    expect(screen.getByText("Enter a port from 1 to 65535.")).toBeTruthy();
    expect(save.disabled).toBe(true);
  });

  it("says which migration is needed before Setup can be edited", async () => {
    render(<EmailTriggersPage />);
    await openTab("Setup");
    expect(screen.getByRole("alert").textContent).toMatch(/20261031140000_email_smtp_any_provider\.sql/);
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });

  it("offers no way to change who receives email from the panel", async () => {
    api.getEmailControl.mockResolvedValue(control({ settings: { sending_mode: "test", test_recipients: [] } }));
    render(<EmailTriggersPage />);
    await openTab("Setup");
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("the headline is clear when test mode has no addresses, and in practice mode", async () => {
    api.getEmailControl.mockResolvedValue(control({ worker: { allowed_recipients: [] } }));
    render(<EmailTriggersPage />);
    expect(await screen.findByText("Automatic emails are held back. Test emails go to the address you type.")).toBeTruthy();
    cleanup();
    api.getEmailControl.mockResolvedValue(control({ settings: { sending_mode: "dry_run", test_recipients: [] }, worker: { mode: "dry_run" } }));
    render(<EmailTriggersPage />);
    expect(await screen.findByText("Emails are only logged. Nothing reaches anyone.")).toBeTruthy();
  });

  it("the test box warns when a test wouldn't really go out", async () => {
    api.getEmailControl.mockResolvedValue(control({ worker: { mode: "dry_run" } }));
    const dialog = await openEditor();
    expect(within(dialog).getByText(/Practice mode is on, so this test won't really be sent/)).toBeTruthy();
  });

  it("emergency stop asks first, then pauses and logs it", async () => {
    render(<EmailTriggersPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Pause all emails/ }));
    expect(api.setEmailsPaused).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Pause all emails" }));
    await waitFor(() => expect(api.setEmailsPaused).toHaveBeenCalledWith({}, { paused: true, discardWaiting: false, operator: "admin@x.co" }));
    await waitFor(() => expect(addLog).toHaveBeenCalled());
    expect(addLog.mock.calls[0][0].entity).toBe("email_trigger_settings");
  });

  it("when paused, offers resume-and-send or resume-and-discard", async () => {
    api.getEmailControl.mockResolvedValue(control({ settings: { emails_paused: true } }));
    render(<EmailTriggersPage />);
    expect(await screen.findByRole("heading", { name: "All emails are paused" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Resume and discard 4" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toMatch(/4 waiting emails will never be sent/);
    fireEvent.click(within(dialog).getByRole("button", { name: "Resume and discard" }));
    await waitFor(() => expect(api.setEmailsPaused).toHaveBeenCalledWith({}, { paused: false, discardWaiting: true, operator: "admin@x.co" }));
  });

  it("turns one email type off and logs it", async () => {
    render(<EmailTriggersPage />);
    fireEvent.click(await screen.findByLabelText("Welcome email"));
    await waitFor(() => expect(api.updateEmailTemplate).toHaveBeenCalledWith({}, "creator_welcome", { enabled: false }, "admin@x.co"));
    await waitFor(() => expect(addLog).toHaveBeenCalled());
    expect(addLog.mock.calls[0][0].payload).toEqual({ template: "creator_welcome", enabled: false });
  });

  it("validates and saves reminder timing from the reminder's own row", async () => {
    render(<EmailTriggersPage />);
    expect(await screen.findByText(/First reminder after 3 days, then every 3 days, 3 at most\. Stops once the profile is above 75%\./)).toBeTruthy();
    expect(screen.queryByLabelText("Days between reminders")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Change timing" }));
    const save = screen.getByRole("button", { name: "Save timing" });
    expect(save.disabled).toBe(true);
    const days = screen.getByLabelText("Days between reminders");
    fireEvent.change(days, { target: { value: "0" } });
    expect(screen.getByText(/whole number from 1 to 90/)).toBeTruthy();
    expect(save.disabled).toBe(true);
    fireEvent.change(days, { target: { value: "5" } });
    fireEvent.click(save);
    await waitFor(() =>
      expect(api.updateEmailSettings).toHaveBeenCalledWith({}, {
        profile_reminder_after_days: 3,
        profile_reminder_every_days: 5,
        profile_reminder_max: 3,
        profile_reminder_stop_above: 75,
      })
    );
    await waitFor(() => expect(screen.queryByLabelText("Days between reminders")).toBeNull());
  });
});

describe("Template editor", () => {
  it("starts from the original wording and previews it with sample data", async () => {
    const dialog = await openEditor();
    expect(within(dialog).getByLabelText("Subject").value).toBe("Welcome to Connectiqo, {{first_name}}!");
    expect(within(dialog).getByText("Welcome to Connectiqo, Asha!")).toBeTruthy();
    const frame = within(dialog).getByTitle("Email preview");
    expect(frame.getAttribute("sandbox")).toBe("");
    expect(frame.getAttribute("srcdoc")).toContain("Unsubscribe");
  });

  it("blocks saving an unknown placeholder", async () => {
    const dialog = await openEditor();
    fireEvent.change(within(dialog).getByLabelText("Subject"), { target: { value: "Hi {{session_when}}" } });
    expect(within(dialog).getByText(/Not available in this email: session_when/)).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Save" }).disabled).toBe(true);
    expect(within(dialog).getByRole("button", { name: "Send test" }).disabled).toBe(true);
  });

  it("saves changed text only; unchanged fields stay on the built-in wording", async () => {
    const dialog = await openEditor();
    fireEvent.change(within(dialog).getByLabelText("Button text"), { target: { value: "Start now" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(api.updateEmailTemplate).toHaveBeenCalledWith(
        {},
        "creator_welcome",
        { subject: null, heading: null, body: null, button_label: "Start now" },
        "admin@x.co"
      )
    );
  });

  it("starts with no test address and sends the draft to the typed one, without saving", async () => {
    const dialog = await openEditor("Session booked");
    const to = within(dialog).getByLabelText("Send a test to");
    expect(to.value).toBe("");
    expect(within(dialog).getByRole("button", { name: "Send test" }).disabled).toBe(true);
    fireEvent.change(to, { target: { value: "other@x.com" } });
    fireEvent.change(within(dialog).getByLabelText("Heading"), { target: { value: "Booked!" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Send test" }));
    await waitFor(() => expect(api.queueTestEmail).toHaveBeenCalled());
    await waitFor(() => expect(addToast).toHaveBeenCalledWith("Test queued for other@x.com.", "info"));
    const args = api.queueTestEmail.mock.calls[0][1];
    expect(args).toMatchObject({ template: "creator_session_booked", to: "other@x.com" });
    expect(args.overrides.heading).toBe("Booked!");
    expect(api.updateEmailTemplate).not.toHaveBeenCalled();
  });

  it("lists company emails in their own group once their migration is applied", async () => {
    render(<EmailTriggersPage />);
    expect(await screen.findByRole("heading", { name: "Emails to creators" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Emails to companies" })).toBeNull();
    cleanup();

    const brandTemplates = ["brand_welcome", "brand_campaign_reminder", "brand_campaign_live", "brand_new_applications", "brand_new_submission"];
    const base = control();
    api.getEmailControl.mockResolvedValue({ ...base, templates: [...base.templates, ...brandTemplates.map((template) => ({ template, enabled: true }))] });
    render(<EmailTriggersPage />);
    expect(await screen.findByRole("heading", { name: "Emails to companies" })).toBeTruthy();
    for (const label of ["Company welcome", "Create your first campaign", "Campaign is live", "New applications", "New submission"]) {
      expect(screen.getByLabelText(`${label} email`)).toBeTruthy();
    }
    fireEvent.click(screen.getByLabelText("Company welcome email"));
    await waitFor(() => expect(api.updateEmailTemplate).toHaveBeenCalledWith({}, "brand_welcome", { enabled: false }, "admin@x.co"));
  });

  it("the original wording button restores the defaults", async () => {
    api.getEmailControl.mockResolvedValue({
      ...control(),
      templates: [{ template: "creator_welcome", enabled: true, subject: "Custom" }],
    });
    const dialog = await openEditor();
    expect(within(dialog).getByLabelText("Subject").value).toBe("Custom");
    fireEvent.click(within(dialog).getByRole("button", { name: "Use the original wording" }));
    expect(within(dialog).getByLabelText("Subject").value).toBe("Welcome to Connectiqo, {{first_name}}!");
  });
});

describe("Email log", () => {
  it("shows results and reasons, and retries failed emails", async () => {
    api.listEmailOutbox.mockResolvedValue([
      { id: "1", template: "creator_welcome", status: "failed", attempts: 5, last_error: "535 Bad credentials", recipient_name: "Asha", recipient_email: "a@x.co", created_at: "2026-10-31T10:00:00Z" },
      { id: "2", template: "creator_session_booked", status: "sent", attempts: 1, recipient_name: "Ben", recipient_email: "b@x.co", created_at: "2026-10-31T09:00:00Z", sent_at: "2026-10-31T09:01:00Z" },
    ]);
    render(<EmailTriggersPage />);
    await openTab("History");
    expect(await screen.findByText("535 Bad credentials")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Retry" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(api.retryEmail).toHaveBeenCalledWith({}, "1"));
  });

  it("separates real from test emails, searches name and email, and shows unsubscribes", async () => {
    api.listEmailOutbox.mockResolvedValue([
      { id: "1", template: "creator_welcome", status: "sent", is_test: false, recipient_name: "Asha", recipient_email: "asha@x.co", created_at: "2026-10-31T10:00:00Z" },
      { id: "2", template: "creator_welcome", status: "sent", is_test: true, recipient_name: null, recipient_email: "me@x.co", created_at: "2026-10-31T09:00:00Z" },
    ]);
    render(<EmailTriggersPage />);
    await openTab("History");
    expect(await screen.findByText("asha@x.co")).toBeTruthy();
    expect(screen.getByText("Unsubscribed: 2")).toBeTruthy();

    const kind = screen.getByLabelText("Filter by real or test");
    fireEvent.change(kind, { target: { value: "real" } });
    expect(screen.getByText("asha@x.co")).toBeTruthy();
    expect(screen.queryByText("me@x.co")).toBeNull();
    fireEvent.change(kind, { target: { value: "test" } });
    expect(screen.getByText("me@x.co")).toBeTruthy();
    expect(screen.queryByText("asha@x.co")).toBeNull();
    fireEvent.change(kind, { target: { value: "all" } });

    const search = screen.getByLabelText("Search by name or email");
    fireEvent.change(search, { target: { value: "ASHA" } });
    expect(screen.getByText("asha@x.co")).toBeTruthy();
    expect(screen.queryByText("me@x.co")).toBeNull();
    fireEvent.change(search, { target: { value: "me@x" } });
    expect(screen.getByText("me@x.co")).toBeTruthy();
    fireEvent.change(search, { target: { value: "nobody" } });
    expect(screen.getByText("No emails match these filters.")).toBeTruthy();
  });

  it("separates creator emails from company emails, including tests", async () => {
    api.listEmailOutbox.mockResolvedValue([
      { id: "1", audience: "creator", template: "creator_welcome", status: "sent", recipient_email: "creator@x.co", created_at: "2026-10-31T10:00:00Z" },
      { id: "2", audience: "brand", template: "brand_welcome", status: "sent", recipient_email: "company@x.co", created_at: "2026-10-31T09:00:00Z" },
      { id: "3", audience: "brand", template: "brand_new_submission", status: "sent", is_test: true, recipient_email: "me@x.co", created_at: "2026-10-31T08:00:00Z" },
    ]);
    render(<EmailTriggersPage />);
    await openTab("History");
    expect(await screen.findByText("creator@x.co")).toBeTruthy();
    expect(screen.getByText("company@x.co")).toBeTruthy();

    const audience = screen.getByLabelText("Filter by creators or companies");
    fireEvent.change(audience, { target: { value: "brand" } });
    expect(screen.queryByText("creator@x.co")).toBeNull();
    expect(screen.getByText("company@x.co")).toBeTruthy();
    expect(screen.getByText("me@x.co")).toBeTruthy();

    fireEvent.change(audience, { target: { value: "creator" } });
    expect(screen.getByText("creator@x.co")).toBeTruthy();
    expect(screen.queryByText("company@x.co")).toBeNull();

    fireEvent.change(screen.getByLabelText("Filter by real or test"), { target: { value: "test" } });
    expect(screen.getByText("No emails match these filters.")).toBeTruthy();
  });

  it("says so when older emails are left out of the search", async () => {
    api.listEmailOutbox.mockResolvedValue(
      Array.from({ length: 1000 }, (_, i) => ({ id: String(i), template: "creator_welcome", status: "sent", recipient_email: `u${i}@x.co`, created_at: "2026-10-31T10:00:00Z" }))
    );
    render(<EmailTriggersPage />);
    await openTab("History");
    expect(await screen.findByText(/Showing the newest 1,000 emails/)).toBeTruthy();
  });
});

describe("Remembering the view", () => {
  it("opens the tab and filters from the address, and saves changes to it", async () => {
    window.history.replaceState(null, "", "/emails?tab=history&status=failed&audience=brand&q=acme");
    api.listEmailOutbox.mockResolvedValue([
      { id: "1", audience: "brand", template: "brand_welcome", status: "failed", recipient_email: "acme@x.co", created_at: "2026-10-31T10:00:00Z" },
      { id: "2", audience: "brand", template: "brand_welcome", status: "failed", recipient_email: "other@x.co", created_at: "2026-10-31T09:00:00Z" },
    ]);
    render(<EmailTriggersPage />);
    expect((await screen.findByRole("tab", { name: "History" })).getAttribute("aria-selected")).toBe("true");
    await waitFor(() => expect(api.listEmailOutbox).toHaveBeenCalledWith({}, { status: "failed", limit: 1000 }));
    expect(await screen.findByText("acme@x.co")).toBeTruthy();
    expect(screen.queryByText("other@x.co")).toBeNull();
    fireEvent.change(screen.getByLabelText("Filter by real or test"), { target: { value: "real" } });
    expect(window.location.search).toContain("type=real");
    fireEvent.click(screen.getByRole("tab", { name: "Setup" }));
    expect(window.location.search).toContain("tab=setup");
  });

  it("ignores a tab in the address that does not exist", async () => {
    window.history.replaceState(null, "", "/emails?tab=nonsense");
    render(<EmailTriggersPage />);
    expect((await screen.findByRole("tab", { name: "Emails" })).getAttribute("aria-selected")).toBe("true");
  });
});

describe("Companies tab", () => {
  const company = (over) => ({
    id: "1",
    name: "Acme Foods",
    email: "acme@x.co",
    greeting_mail_sent: false,
    campaign_launched: false,
    reminders_sent: 0,
    unsubscribed: false,
    ...over,
  });
  const cells = (name) => [...screen.getByText(name).closest("tr").querySelectorAll("td")].map((td) => td.textContent);

  it("loads when opened and shows each company's email status", async () => {
    api.getEmailControl.mockResolvedValue(control({ settings: { brand_reminder_max: 3 } }));
    api.listCompanyEmailTracking.mockResolvedValue([
      company({ greeting_mail_sent: true, campaign_launched: true, reminders_sent: 2, unsubscribed: true }),
      company({ id: "2", name: "Frozen Co", email: "f@x.co", is_frozen: true }),
      company({ id: "3", name: "Gone Co", email: "g@x.co", deleted_at: "2026-10-01T00:00:00Z" }),
    ]);
    render(<EmailTriggersPage />);
    const tab = await screen.findByRole("tab", { name: "Companies" });
    expect(api.listCompanyEmailTracking).not.toHaveBeenCalled();
    fireEvent.click(tab);

    await screen.findByText("Acme Foods");
    expect(cells("Acme Foods").slice(1)).toEqual(["Active", "Sent", "Yes", "2 of 3", "Yes"]);
    expect(cells("Frozen Co").slice(1)).toEqual(["FrozenNo emails until unfrozen", "Not sent", "No", "0 of 3", "No"]);
    expect(cells("Gone Co")[1]).toBe("DeletedNo emails");
    expect(screen.queryByRole("textbox", { name: /edit/i })).toBeNull();
  });

  it("searches and filters, and shows a load error with a retry", async () => {
    api.listCompanyEmailTracking.mockResolvedValue([company(), company({ id: "2", name: "Frozen Co", email: "f@x.co", is_frozen: true })]);
    render(<EmailTriggersPage />);
    await openTab("Companies");
    await screen.findByText("Acme Foods");
    fireEvent.change(screen.getByLabelText("Filter by account status"), { target: { value: "frozen" } });
    expect(screen.queryByText("Acme Foods")).toBeNull();
    expect(screen.getByText("Frozen Co")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Filter by account status"), { target: { value: "all" } });
    fireEvent.change(screen.getByPlaceholderText("Search by company or email…"), { target: { value: "nobody" } });
    expect(screen.getByText("No companies match your filters.")).toBeTruthy();
    cleanup();

    window.history.replaceState(null, "", "/");
    api.listCompanyEmailTracking.mockRejectedValueOnce(new Error("Could not read")).mockResolvedValue([company()]);
    render(<EmailTriggersPage />);
    await openTab("Companies");
    expect((await screen.findByRole("alert")).textContent).toMatch(/Could not read/);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Acme Foods")).toBeTruthy();
  });
});

describe("helpers", () => {
  it("workerHealth", () => {
    expect(workerHealth(null)).toBe("never");
    expect(workerHealth({ last_seen_at: new Date(1000).toISOString() }, 1000 + 60000)).toBe("online");
    expect(workerHealth({ last_seen_at: new Date(1000).toISOString() }, 1000 + 600000)).toBe("offline");
  });
  it("draft and overrides round-trip without storing the defaults", () => {
    const draft = draftFromTemplate("creator_welcome", { subject: "Mine" });
    expect(overridesFromDraft("creator_welcome", draft)).toEqual({ subject: "Mine", heading: null, body: null, button_label: null });
    expect(overridesFromDraft("creator_welcome", { subject: "   " }).subject).toBeNull();
  });
  it("reminder rules", () => {
    expect(validateReminderRules({ profile_reminder_stop_above: "75", profile_reminder_after_days: "3", profile_reminder_every_days: "3", profile_reminder_max: "3" })).toEqual({});
    expect(Object.keys(validateReminderRules({ profile_reminder_stop_above: "100", profile_reminder_after_days: "", profile_reminder_every_days: "1.5", profile_reminder_max: "-1" }))).toHaveLength(4);
  });
});
