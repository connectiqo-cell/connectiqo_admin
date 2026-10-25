import { describe, expect, it } from "vitest";
import { filterRowsBySearch, getSearchResultHint } from "./searchUtils.js";

const rows = [
  { id: 1, name: "John Doe", email: "john@gmail.com", meta: { city: "Pune" } },
  { id: 2, name: "Priya Sharma", email: "priya@yahoo.com", meta: { city: "Delhi" } },
  { id: 3, name: "Doe Ray", email: "ray@gmail.com", meta: null },
];

describe("filterRowsBySearch", () => {
  it("returns every row for an empty or blank query", () => {
    expect(filterRowsBySearch(rows, "")).toBe(rows);
    expect(filterRowsBySearch(rows, "   ")).toBe(rows);
  });

  it("is case-insensitive", () => {
    expect(filterRowsBySearch(rows, "PRIYA").map((r) => r.id)).toEqual([2]);
  });

  it("requires every word, in any order and across columns", () => {
    expect(filterRowsBySearch(rows, "doe gmail").map((r) => r.id)).toEqual([1, 3]);
    expect(filterRowsBySearch(rows, "gmail john").map((r) => r.id)).toEqual([1]);
    expect(filterRowsBySearch(rows, "doe yahoo")).toEqual([]);
  });

  it("matches values inside nested objects but not their key names", () => {
    expect(filterRowsBySearch(rows, "pune").map((r) => r.id)).toEqual([1]);
    // "city" is a key in every meta object — it must not match all rows.
    expect(filterRowsBySearch(rows, "city")).toEqual([]);
  });

  it("only searches the given columns when provided", () => {
    expect(filterRowsBySearch(rows, "gmail", ["name"])).toEqual([]);
    expect(filterRowsBySearch(rows, "gmail", ["email"]).map((r) => r.id)).toEqual([1, 3]);
  });

  it("handles empty input safely", () => {
    expect(filterRowsBySearch([], "x")).toEqual([]);
    expect(filterRowsBySearch(null, "x")).toEqual([]);
  });
});

describe("getSearchResultHint", () => {
  it("is empty when there is no query", () => {
    expect(getSearchResultHint(5, 10, "")).toBeNull();
  });

  it("reports matches when everything was searched", () => {
    expect(getSearchResultHint(3, 10, "doe")).toBe("3 of 10 records match");
    expect(getSearchResultHint(1, 1, "doe")).toBe("1 match");
  });

  it("warns when only part of the table was loaded", () => {
    expect(getSearchResultHint(2, 25, "doe", 124)).toBe("2 matches in the 25 loaded records — 99 more not searched");
  });
});
