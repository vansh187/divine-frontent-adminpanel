import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ApiCustomer } from "../../lib/api";
import { PlotPlans } from "./PlotPlans";

const base: ApiCustomer = {
  id: "C1", full_name: "Rohit Mehra", email: null, phone: null, source: "OFFLINE_IMPORT", status: "BOOKED",
  created_at: "2026-11-05T00:00:00Z", last_activity_at: "2026-11-05T00:00:00Z",
};

describe("PlotPlans", () => {
  it("shows each plot with its own plan", () => {
    render(<PlotPlans customer={{ ...base, plot_plans: [
      { project_name: "Suraksha Enclave", unit_number: "D7", payment_plan: "PP1", applicant_name: "Mr. Rohit Mehra" },
      { project_name: "Suraksha Enclave", unit_number: "D8", payment_plan: "PP3", applicant_name: "Mr. Vikas Rao" },
      { project_name: "Suraksha Enclave", unit_number: "D9", payment_plan: null },
    ] }} />);
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "D7 · PP1 · Mr. Rohit Mehra", "D8 · PP3 · Mr. Vikas Rao", "D9 · —",
    ]);
  });

  it("falls back to the plan codes, then a dash", () => {
    const { rerender } = render(<PlotPlans customer={{ ...base, payment_plans: ["PP1"] }} />);
    expect(screen.getByText("PP1")).toBeInTheDocument();
    rerender(<PlotPlans customer={base} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
