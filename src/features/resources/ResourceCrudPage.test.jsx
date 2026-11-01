// @vitest-environment jsdom
import { cleanup, fireEvent, render as rtlRender, screen, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const environment = vi.hoisted(() => ({ config: {}, environment: "production" }));
const listTableRows = vi.hoisted(() => vi.fn());

vi.mock("../../services/adminApi.js", async (original) => ({
  ...(await original()),
  listTableRows,
  fetchProfilesByIds: vi.fn().mockResolvedValue({}),
}));
vi.mock("../../app/providers/EnvironmentProvider.jsx", () => ({ useEnvironment: () => environment }));
vi.mock("../../app/providers/AuditProvider.jsx", () => ({ useAudit: () => ({ addLog: vi.fn() }) }));
vi.mock("../../app/providers/ToastProvider.jsx", () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock("../../app/providers/AuthProvider.jsx", () => ({ useAuth: () => ({ session: { user: { email: "a@x.co" } } }) }));

import { ResourceCrudPage } from "./ResourceCrudPage.jsx";

const render = (ui) => rtlRender(<BrowserRouter>{ui}</BrowserRouter>);
const rows = Array.from({ length: 25 }, (_, i) => ({ id: `id-${i}`, status: "pending" }));
const lastCall = () => listTableRows.mock.calls.at(-1)[2];

beforeEach(() => {
  listTableRows.mockResolvedValue({ rows, count: 1000 });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("ResourceCrudPage remembers the view", () => {
  it("opens on the page, sort and filter in the address, without resetting them", async () => {
    window.history.replaceState(null, "", "/bookings?page=3&size=50&sort=status&dir=desc&filters=%7B%22status%22%3A%22paid%22%7D");
    render(<ResourceCrudPage title="Bookings" tableName="bookings" />);
    await waitFor(() => expect(listTableRows).toHaveBeenCalled());
    await screen.findByText("id-0".slice(0, 8));

    const first = listTableRows.mock.calls[0][2];
    expect(first).toMatchObject({ page: 3, pageSize: 50, sortCol: "status", sortDir: "desc", filters: { status: "paid" } });
    expect(window.location.search).toContain("page=3");
    expect(listTableRows).toHaveBeenCalledTimes(1);
  });

  it("steps back when the address asks for a page past the end, but only after loading", async () => {
    window.history.replaceState(null, "", "/bookings?page=99");
    listTableRows.mockResolvedValue({ rows: [], count: 30 });
    render(<ResourceCrudPage title="Bookings" tableName="bookings" />);
    await waitFor(() => expect(lastCall().page).toBe(2));
    expect(listTableRows.mock.calls[0][2].page).toBe(99);
    expect(window.location.search).toBe("?page=2");
  });

  it("saves search to the address and goes back to page 1", async () => {
    window.history.replaceState(null, "", "/bookings?page=3");
    render(<ResourceCrudPage title="Bookings" tableName="bookings" searchColumns={["status"]} />);
    await waitFor(() => expect(listTableRows).toHaveBeenCalled());
    const box = await screen.findByRole("searchbox");
    fireEvent.change(box, { target: { value: "paid" } });
    expect(box.value).toBe("paid");
    await waitFor(() => expect(window.location.search).toBe("?q=paid"), { timeout: 2000 });
  });
});
