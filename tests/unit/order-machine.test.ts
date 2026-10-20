import { describe, expect, it } from "vitest";
import { canTransition, planTransition, TRANSITIONS } from "@/lib/domain/order-machine";

describe("order state machine", () => {
  it("only lets the system mark an order paid", () => {
    expect(canTransition("PAYMENT_SUCCEEDED", "AWAITING_PAYMENT", "SYSTEM")).toBe(true);
    expect(canTransition("PAYMENT_SUCCEEDED", "AWAITING_PAYMENT", "CUSTOMER")).toBe(false);
    expect(canTransition("PAYMENT_SUCCEEDED", "AWAITING_PAYMENT", "ADMIN")).toBe(false);
  });

  it("cannot skip payment to start work", () => {
    expect(() => planTransition("START", { status: "AWAITING_PAYMENT", previousStatus: null }, "PROVIDER")).toThrow();
  });

  it("only the customer confirms completion", () => {
    expect(() => planTransition("CONFIRM_COMPLETION", { status: "AWAITING_CUSTOMER_CONFIRMATION", previousStatus: null }, "PROVIDER")).toThrow();
    expect(planTransition("CONFIRM_COMPLETION", { status: "AWAITING_CUSTOMER_CONFIRMATION", previousStatus: null }, "CUSTOMER")).toBe("COMPLETED");
  });

  it("restores the previous status when a cancellation is declined", () => {
    expect(planTransition("DECLINE_CANCELLATION", { status: "CANCELLATION_REQUESTED", previousStatus: "IN_PROGRESS" }, "CUSTOMER")).toBe("IN_PROGRESS");
  });

  it("paid orders cannot be cancelled directly", () => {
    for (const s of ["ASSIGNED", "IN_PROGRESS"] as const) expect(canTransition("CANCEL", s, "CUSTOMER")).toBe(false);
  });

  it("terminal states have no outgoing transitions", () => {
    for (const s of ["COMPLETED", "CANCELLED", "REFUNDED"] as const)
      for (const rule of Object.values(TRANSITIONS)) expect(rule.from).not.toContain(s);
  });
});
