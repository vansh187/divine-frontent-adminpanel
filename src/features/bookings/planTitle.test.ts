import { describe, expect, it } from "vitest";
import { planTitle } from "./planTitle";

describe("planTitle", () => {
  it.each([
    [{ name: "Flexi Plan", short_code: "PP1", code: "PP1/FPP/10-90", version: 2 }, "Flexi Plan (PP1) · v2"],
    [{ name: "Flexi Plan", code: "PP1/FPP/10-90" }, "Flexi Plan (PP1/FPP/10-90)"],
    [{ code: "PP1/FPP/10-90", short_code: "PP1" }, "PP1/FPP/10-90 (PP1)"],
    [{ short_code: "PP1" }, "PP1"],
    [{ name: "  ", code: "STD" }, "STD"],
    [{ name: "Flexi", short_code: "Flexi" }, "Flexi"],
    [{ name: "Flexi", short_code: "FLEXI", code: "flexi" }, "Flexi"],
    [{ name: "Flexi", short_code: "flexi", code: "F/1" }, "Flexi (F/1)"],
    [{ name: "Plan", version: 0 }, "Plan"],
  ])("%j -> %s", (plan, expected) => {
    expect(planTitle(plan)).toBe(expected);
  });

  it("returns null when there is nothing to show", () => {
    expect(planTitle(null)).toBeNull();
    expect(planTitle(undefined)).toBeNull();
    expect(planTitle({})).toBeNull();
    expect(planTitle({ name: " ", code: "", short_code: null })).toBeNull();
  });
});
