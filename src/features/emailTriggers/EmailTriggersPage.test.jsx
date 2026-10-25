// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ listCreatorEmailTracking: vi.fn() }));

vi.mock("../../services/adminApi.js", () => api);
vi.mock("../../app/providers/EnvironmentProvider.jsx", () => ({ useEnvironment: () => ({ config: {}, environment: "production" }) }));

import { EmailTriggersPage } from "./EmailTriggersPage.jsx";

const base = { greeting_mail_sent: false, profile_completeness: null, open_slots_mail_count: 0 };
const creators = [
  { ...base, id: "a", name: "Asha Rao", email: "asha@x.co" },
  { ...base, id: "b", name: "Ben Login", email: "ben@x.co", is_frozen: true },
  { ...base, id: "c", name: "Cara Creator", email: "cara@x.co", mentor_frozen: true, mentor_frozen_until: null },
  { ...base, id: "d", name: "Dev Deleted", email: "dev@x.co", deleted_at: "2026-10-01T00:00:00Z" },
];

function openCreators() {
  render(<EmailTriggersPage />);
  fireEvent.click(screen.getByRole("button", { name: /Creators/ }));
}

const rowFor = async (name) => (await screen.findByText(name)).closest("tr");

describe("EmailTriggersPage", () => {
  beforeEach(() => {
    api.listCreatorEmailTracking.mockResolvedValue(creators);
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("starts collapsed and loads creators only when opened", async () => {
    render(<EmailTriggersPage />);
    expect(api.listCreatorEmailTracking).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Creators/ }));
    expect(await screen.findByText("Asha Rao")).toBeTruthy();
  });

  it("shows an empty state with no creators", async () => {
    api.listCreatorEmailTracking.mockResolvedValue([]);
    openCreators();
    expect(await screen.findByText("No creators yet.")).toBeTruthy();
  });

  it("shows one status per creator, saying when emails stop", async () => {
    openCreators();
    const active = await rowFor("Asha Rao");
    expect(within(active).getByText("Active")).toBeTruthy();
    expect(within(active).queryByText(/No emails/)).toBeNull();
    expect(within(await rowFor("Ben Login")).getByText("No emails until unfrozen")).toBeTruthy();
    expect(within(await rowFor("Cara Creator")).getByText("Creator frozen")).toBeTruthy();
    expect(within(await rowFor("Dev Deleted")).getByText("No emails")).toBeTruthy();
  });

  it("has no separate email freeze/stop buttons", async () => {
    openCreators();
    await screen.findByText("Asha Rao");
    expect(screen.queryByRole("button", { name: /Freeze|Stop|Unfreeze|Reactivate/ })).toBeNull();
  });

  it("filters to frozen accounts", async () => {
    openCreators();
    await screen.findByText("Asha Rao");
    fireEvent.change(screen.getByLabelText("Filter by account status"), { target: { value: "frozen" } });
    expect(screen.queryByText("Asha Rao")).toBeNull();
    expect(screen.getByText("Ben Login")).toBeTruthy();
    expect(screen.getByText("Cara Creator")).toBeTruthy();
    expect(screen.queryByText("Dev Deleted")).toBeNull();
  });
});
