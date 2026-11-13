import { describe, expect, it } from "vitest";
import { localDateISO } from "./format";

describe("localDateISO", () => {
  it("is the local calendar date, even just after local midnight when UTC is still the day before", () => {
    // 00:30 on 14 Nov local time; in India (UTC+5:30) that is 19:00 on 13 Nov UTC.
    expect(localDateISO(new Date(2026, 10, 14, 0, 30))).toBe("2026-11-14");
    expect(localDateISO(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});
