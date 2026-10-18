// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Pagination } from "./Pagination.jsx";

afterEach(cleanup);

let container;

function setup(props = {}) {
  const onPageChange = vi.fn();
  const onPageSizeChange = vi.fn();
  ({ container } = render(
    <Pagination page={1} pageSize={25} count={124} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} {...props} />
  ));
  return { onPageChange, onPageSizeChange };
}

/** Visible page items, including "…" gaps (which are hidden from screen readers). */
const pageLabels = () =>
  [...container.querySelectorAll(".admin-pagination__pages li")]
    .map((li) => li.textContent.trim())
    .filter((text) => text && !/chevron/.test(text));

describe("Pagination", () => {
  it("summarises the visible range", () => {
    setup({ page: 2 });
    expect(screen.getByRole("navigation").textContent).toMatch(/Showing 26–50 of 124 records/);
  });

  it("shows a short last page correctly", () => {
    setup({ page: 5 });
    expect(screen.getByRole("navigation").textContent).toMatch(/Showing 101–124 of 124/);
  });

  it("lists all pages when there are few", () => {
    setup({ page: 1 }); // 124 / 25 → 5 pages
    expect(pageLabels()).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("collapses long ranges around the current page", () => {
    setup({ page: 6, pageSize: 10 }); // 13 pages
    expect(pageLabels()).toEqual(["1", "…", "5", "6", "7", "…", "13"]);
  });

  it("marks the current page", () => {
    setup({ page: 3 });
    expect(screen.getByRole("button", { name: "Page 3" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("button", { name: "Page 2" }).getAttribute("aria-current")).toBeNull();
  });

  it("disables Previous on the first page and Next on the last", () => {
    setup({ page: 1 });
    expect(screen.getByRole("button", { name: "Previous page" }).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Next page" }).disabled).toBe(false);
    cleanup();
    setup({ page: 5 });
    expect(screen.getByRole("button", { name: "Next page" }).disabled).toBe(true);
  });

  it("navigates with Next, Previous and page numbers", () => {
    const { onPageChange } = setup({ page: 3 });
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
    fireEvent.click(screen.getByRole("button", { name: "Page 5" }));
    expect(onPageChange.mock.calls).toEqual([[4], [2], [5]]);
  });

  it("does not fire when clicking the current page", () => {
    const { onPageChange } = setup({ page: 3 });
    fireEvent.click(screen.getByRole("button", { name: "Page 3" }));
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it("changes page size", () => {
    const { onPageSizeChange } = setup();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "50" } });
    expect(onPageSizeChange).toHaveBeenCalledWith(50);
  });

  it("locks every control while loading", () => {
    setup({ page: 3, disabled: true });
    for (const button of screen.getAllByRole("button")) expect(button.disabled).toBe(true);
    expect(screen.getByRole("combobox").disabled).toBe(true);
  });
});
