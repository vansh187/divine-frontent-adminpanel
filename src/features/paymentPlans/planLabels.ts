import type { PlanChargeHead } from "../../lib/api";

export const CHARGE_HEAD_LABEL: Record<string, string> = {
  PLC: "PLC",
  IFMS: "IFMS",
  CAM: "CAM",
  "PLC+IFMS": "PLC + IFMS",
  "PLC+CAM": "PLC + CAM",
  "IFMS+CAM": "IFMS + CAM",
  ALL: "PLC + IFMS + CAM",
};

/** "Add charges" dropdown options, in display order. */
export const CHARGE_HEAD_OPTIONS: { value: PlanChargeHead; label: string }[] = [
  { value: "PLC", label: CHARGE_HEAD_LABEL.PLC },
  { value: "IFMS", label: CHARGE_HEAD_LABEL.IFMS },
  { value: "CAM", label: CHARGE_HEAD_LABEL.CAM },
  { value: "PLC+IFMS", label: CHARGE_HEAD_LABEL["PLC+IFMS"] },
  { value: "PLC+CAM", label: CHARGE_HEAD_LABEL["PLC+CAM"] },
  { value: "IFMS+CAM", label: CHARGE_HEAD_LABEL["IFMS+CAM"] },
  { value: "ALL", label: `All (${CHARGE_HEAD_LABEL.ALL})` },
];

/** Combined options that need the backend update (docs/payment-plan-free-text-due-backend.md). */
export const PAIR_CHARGE_HEADS: PlanChargeHead[] = ["PLC+IFMS", "PLC+CAM", "IFMS+CAM"];

/** The individual charges an option adds: "PLC+CAM" -> ["PLC", "CAM"], "ALL" -> all three. */
export function chargesIn(head: string): string[] {
  return head === "ALL" ? ["PLC", "IFMS", "CAM"] : head.split("+");
}
