// @vitest-environment jsdom
// Every page must at least open. Unit tests only cover some pages; a typo in an import or a
// wrong helper name on any of the others should still fail here instead of at build time.
import { describe, expect, it } from "vitest";

const pages = import.meta.glob("../../features/*/*Page.jsx");

describe("every page", () => {
  it("finds the pages", () => {
    expect(Object.keys(pages).length).toBeGreaterThan(10);
  });

  for (const [path, load] of Object.entries(pages)) {
    it(`loads ${path.split("/").pop()}`, async () => {
      const mod = await load();
      expect(Object.values(mod).some((value) => typeof value === "function")).toBe(true);
    });
  }
});
