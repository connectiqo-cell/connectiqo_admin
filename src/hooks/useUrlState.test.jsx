// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useClearUrlKeys, useOnChange, useUrlNumber, useUrlState } from "./useUrlState.js";

const parseJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};
const EMPTY = {};

function Page({ onPageReset = () => {} }) {
  const [q, setQ] = useUrlState("q", "");
  const [tab, setTab] = useUrlState("tab", "queue", { allowed: ["queue", "done"] });
  const [page, setPage] = useUrlNumber("page", 1);
  const [filters, setFilters] = useUrlState("filters", EMPTY, { parse: parseJson, serialize: JSON.stringify });
  const clear = useClearUrlKeys();
  useOnChange(() => {
    onPageReset();
    setPage(1);
  }, [q]);
  return (
    <div>
      <input aria-label="search" value={q} onChange={(e) => setQ(e.target.value)} />
      <output aria-label="tab">{tab}</output>
      <output aria-label="page">{page}</output>
      <output aria-label="filters">{JSON.stringify(filters)}</output>
      <button onClick={() => setPage((p) => p + 1)}>next</button>
      <button onClick={() => { setTab("done"); setPage(1); }}>both</button>
      <button onClick={() => setFilters((prev) => ({ ...prev, status: "paid" }))}>filter</button>
      <button onClick={() => clear(["q", "page"])}>clear</button>
      <Link to="/page">same page link</Link>
      <Link to="/other">other page</Link>
    </div>
  );
}

function open(search = "", props = {}) {
  window.history.replaceState(null, "", `/page${search}`);
  return render(
    <BrowserRouter>
      <Routes>
        <Route path="/page" element={<Page {...props} />} />
        <Route path="/other" element={<div>Other page</div>} />
      </Routes>
    </BrowserRouter>
  );
}

const text = (label) => screen.getByLabelText(label).textContent;

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

describe("useUrlState", () => {
  it("restores everything from the address, like after a refresh or a shared link", () => {
    open('?q=asha&tab=done&page=3&filters=%7B%22status%22%3A%22paid%22%7D');
    expect(screen.getByLabelText("search").value).toBe("asha");
    expect(text("tab")).toBe("done");
    expect(text("page")).toBe("3");
    expect(text("filters")).toBe('{"status":"paid"}');
  });

  it("doesn't lose the page number when the page opens", () => {
    const onPageReset = vi.fn();
    open("?q=asha&page=3", { onPageReset });
    expect(onPageReset).not.toHaveBeenCalled();
    expect(window.location.search).toBe("?q=asha&page=3");
  });

  it("keeps defaults out of the address", () => {
    open();
    expect(window.location.search).toBe("");
    fireEvent.click(screen.getByText("next"));
    expect(window.location.search).toBe("?page=2");
    fireEvent.change(screen.getByLabelText("search"), { target: { value: "a" } });
    expect(new URLSearchParams(window.location.search).get("q")).toBe("a");
    expect(new URLSearchParams(window.location.search).has("page")).toBe(false);
    fireEvent.change(screen.getByLabelText("search"), { target: { value: "" } });
    expect(window.location.search).toBe("");
  });

  it("applies two changes made in one click", () => {
    open("?page=4");
    fireEvent.click(screen.getByText("both"));
    expect(text("tab")).toBe("done");
    expect(text("page")).toBe("1");
    expect(window.location.search).toBe("?tab=done");
  });

  it("supports updates based on the previous value", () => {
    open("?page=2");
    fireEvent.click(screen.getByText("next"));
    fireEvent.click(screen.getByText("next"));
    expect(text("page")).toBe("4");
    fireEvent.click(screen.getByText("filter"));
    expect(text("filters")).toBe('{"status":"paid"}');
  });

  it("ignores invalid values in the address", () => {
    open("?tab=hacked&page=-3&filters=%7Bbroken");
    expect(text("tab")).toBe("queue");
    expect(text("page")).toBe("1");
    expect(text("filters")).toBe("{}");
  });

  it("shows every typed character straight away", () => {
    open();
    const input = screen.getByLabelText("search");
    for (const value of ["a", "as", "ash", "asha"]) {
      fireEvent.change(input, { target: { value } });
      expect(input.value).toBe(value);
    }
  });

  it("clears when the sidebar link to the same page is clicked", async () => {
    open("?q=asha&page=3");
    await act(async () => {
      fireEvent.click(screen.getByText("same page link"));
    });
    expect(window.location.search).toBe("");
    expect(screen.getByLabelText("search").value).toBe("");
    expect(text("page")).toBe("1");
  });

  it("clears chosen settings only", () => {
    open("?q=asha&page=3&tab=done");
    fireEvent.click(screen.getByText("clear"));
    expect(window.location.search).toBe("?tab=done");
  });

  it("comes back to the same view with the browser's back button", async () => {
    open("?q=asha&page=3");
    await act(async () => {
      fireEvent.click(screen.getByText("other page"));
    });
    expect(screen.getByText("Other page")).toBeTruthy();
    await act(async () => {
      window.history.back();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(screen.getByLabelText("search").value).toBe("asha");
    expect(text("page")).toBe("3");
  });
});

describe("useOnChange", () => {
  it("skips the first run", () => {
    const callback = vi.fn();
    function Demo() {
      const [n, setN] = useState(0);
      useOnChange(callback, [n]);
      return <button onClick={() => setN(1)}>change</button>;
    }
    render(<Demo />);
    expect(callback).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("change"));
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
