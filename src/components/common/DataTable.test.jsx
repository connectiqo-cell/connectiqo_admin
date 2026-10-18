// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DataTable } from "./DataTable.jsx";
import { ErrorBoundary } from "./ErrorBoundary.jsx";
import { inferKind } from "../../utils/formatters.js";

afterEach(cleanup);

const profiles = [
  { id: "3f2a91bc-1234-4abc-9def-0123456789ab", name: "Asha", email: "asha@x.com", role: "mentor", is_frozen: false, created_at: "2026-10-18T11:24:22Z" },
  { id: "9b1c22aa-1234-4abc-9def-0123456789ab", name: "Ravi", email: null, role: "learner", is_frozen: true, created_at: null },
];

describe("DataTable", () => {
  // Regression: tables without person columns pass personColumns={null}; this crashed the
  // whole app (black screen) with "Cannot read properties of null (reading 'id')".
  it.each([
    ["null", null],
    ["undefined", undefined],
  ])("renders when personColumns is %s", (_label, personColumns) => {
    render(<DataTable rows={profiles} personColumns={personColumns} visibleColumns={["name", "email", "is_frozen", "created_at"]} />);
    expect(screen.getByText("Asha")).toBeTruthy();
  });

  it("renders every column when no visibleColumns are given (Database Explorer)", () => {
    render(<DataTable rows={profiles} personColumns={null} />);
    expect(screen.getByRole("columnheader", { name: /ID/ })).toBeTruthy();
  });

  it("shows readable headers and values", () => {
    render(<DataTable rows={profiles} visibleColumns={["name", "is_frozen", { key: "role", kind: "status" }]} />);
    expect(screen.getByRole("columnheader", { name: "Status" })).toBeTruthy();
    expect(screen.getByText("Frozen")).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByText("mentor")).toBeTruthy();
  });

  it("shows names for person columns", () => {
    const rows = [{ id: "t1", mentor_id: "m1", amount_total_paise: 250000 }];
    render(
      <DataTable
        rows={rows}
        visibleColumns={["mentor_id", "amount_total_paise"]}
        personColumns={{ mentor_id: "Mentor" }}
        people={{ m1: { id: "m1", name: "Meera", email: "meera@x.com" } }}
      />
    );
    expect(screen.getByText("Meera")).toBeTruthy();
    expect(screen.getByText("₹2,500.00")).toBeTruthy();
  });

  it("shows an empty state", () => {
    render(<DataTable rows={[]} personColumns={null} />);
    expect(screen.getByText("No records found")).toBeTruthy();
  });

  it("sorts from keyboard-reachable header buttons", () => {
    const onSort = vi.fn();
    render(<DataTable rows={profiles} visibleColumns={["name"]} onSort={onSort} />);
    fireEvent.click(screen.getByRole("button", { name: /Name/ }));
    expect(onSort).toHaveBeenCalledWith("name");
  });

  it("calls row actions with the row", () => {
    const onEdit = vi.fn();
    render(<DataTable rows={profiles} visibleColumns={["name"]} onEdit={onEdit} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Ravi" }));
    expect(onEdit).toHaveBeenCalledWith(profiles[1]);
  });
});

describe("inferKind", () => {
  it("accepts a null personColumns map", () => {
    expect(inferKind("id", "3f2a91bc-1234-4abc-9def-0123456789ab", null)).toBe("id");
  });
});

describe("ErrorBoundary", () => {
  function Boom() {
    throw new Error("kaboom");
  }

  it("shows a message instead of a blank screen, and resets on navigation", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { rerender } = render(
      <ErrorBoundary resetKey="/users">
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByRole("alert").textContent).toMatch(/Something went wrong/);
    expect(screen.getByText("kaboom")).toBeTruthy();

    rerender(
      <ErrorBoundary resetKey="/payments">
        <p>Payments page</p>
      </ErrorBoundary>
    );
    expect(screen.getByText("Payments page")).toBeTruthy();
    spy.mockRestore();
  });
});
