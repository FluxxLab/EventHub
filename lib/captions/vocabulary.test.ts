import { describe, expect, it } from "vitest";

import { addTerms, MAX_TERMS } from "./vocabulary";

describe("addTerms", () => {
  it("splits what is pasted, trims it and keeps each term once", () => {
    expect(
      addTerms(["full product"], " FMWASD, Full Product\nKaduna  State ,, "),
    ).toEqual(["full product", "FMWASD", "Kaduna State"]);
  });

  it("leaves out sentences and stops at the most the captions take", () => {
    const many = Array.from(
      { length: MAX_TERMS + 5 },
      (_, i) => `term ${i}`,
    ).join(",");
    const terms = addTerms([], `${"x".repeat(61)},${many}`);
    expect(terms).toHaveLength(MAX_TERMS);
    expect(terms[0]).toBe("term 0");
  });
});
