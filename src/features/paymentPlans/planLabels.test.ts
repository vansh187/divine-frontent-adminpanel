import { describe, expect, it } from "vitest";
import { CHARGE_HEAD_LABEL, CHARGE_HEAD_OPTIONS, PAIR_CHARGE_HEADS, chargesIn } from "./planLabels";

describe("Add charges options", () => {
  it("offers the three singles, the three pairs and All, in that order", () => {
    expect(CHARGE_HEAD_OPTIONS.map((o) => o.value)).toEqual([
      "PLC",
      "IFMS",
      "CAM",
      "PLC+IFMS",
      "PLC+CAM",
      "IFMS+CAM",
      "ALL",
    ]);
    expect(CHARGE_HEAD_OPTIONS.map((o) => o.label)).toEqual([
      "PLC",
      "IFMS",
      "CAM",
      "PLC + IFMS",
      "PLC + CAM",
      "IFMS + CAM",
      "All (PLC + IFMS + CAM)",
    ]);
  });

  it("sends pairs in the backend's canonical form: PLC, IFMS, CAM order, '+' and no spaces", () => {
    for (const head of PAIR_CHARGE_HEADS) {
      expect(head).toMatch(/^(PLC|IFMS|CAM)\+(PLC|IFMS|CAM)$/);
      const [a, b] = head.split("+");
      expect(["PLC", "IFMS", "CAM"].indexOf(a)).toBeLessThan(["PLC", "IFMS", "CAM"].indexOf(b));
      // Fits divine_payment_plan_instalments.charge_head varchar(10).
      expect(head.length).toBeLessThanOrEqual(10);
    }
  });

  it("labels backend output heads, including the computed PLC+IFMS+CAM", () => {
    expect(CHARGE_HEAD_LABEL["PLC+IFMS"]).toBe("PLC + IFMS");
    expect(CHARGE_HEAD_LABEL.ALL).toBe("PLC + IFMS + CAM");
  });

  it.each([
    ["PLC", ["PLC"]],
    ["PLC+CAM", ["PLC", "CAM"]],
    ["IFMS+CAM", ["IFMS", "CAM"]],
    ["ALL", ["PLC", "IFMS", "CAM"]],
  ])("chargesIn(%s)", (head, expected) => {
    expect(chargesIn(head)).toEqual(expected);
  });
});
