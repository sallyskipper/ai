import type { OrderStatus } from "@prisma/client";

// Explicit order state machine. Every status change in the app goes through
// `planTransition`, which is called on the server inside the same database
// transaction that writes the new status.

export type Actor = "CUSTOMER" | "PROVIDER" | "ADMIN" | "SYSTEM";

export type OrderAction =
  | "PUBLISH"
  | "OFFER_RECEIVED"
  | "ACCEPT_OFFER"
  | "CHANGE_SELECTION"
  | "PAYMENT_SUCCEEDED"
  | "START"
  | "SUBMIT_COMPLETION"
  | "AWAIT_CONFIRMATION"
  | "CONFIRM_COMPLETION"
  | "CANCEL"
  | "REQUEST_CANCELLATION"
  | "ACCEPT_CANCELLATION"
  | "DECLINE_CANCELLATION"
  | "OPEN_DISPUTE"
  | "RESOLVE_REFUND"
  | "RESOLVE_RELEASE";

type Rule = {
  from: OrderStatus[];
  /** null = restore order.previousStatus */
  to: OrderStatus | null;
  actors: Actor[];
};

const PRE_PAYMENT: OrderStatus[] = ["DRAFT", "OPEN_FOR_OFFERS", "OFFERS_RECEIVED", "AWAITING_PAYMENT"];
const PAID_ACTIVE: OrderStatus[] = ["ASSIGNED", "IN_PROGRESS"];

export const TRANSITIONS: Record<OrderAction, Rule> = {
  PUBLISH: { from: ["DRAFT"], to: "OPEN_FOR_OFFERS", actors: ["CUSTOMER"] },
  OFFER_RECEIVED: { from: ["OPEN_FOR_OFFERS"], to: "OFFERS_RECEIVED", actors: ["SYSTEM"] },
  ACCEPT_OFFER: { from: ["OFFERS_RECEIVED"], to: "AWAITING_PAYMENT", actors: ["CUSTOMER"] },
  CHANGE_SELECTION: { from: ["AWAITING_PAYMENT"], to: "OFFERS_RECEIVED", actors: ["CUSTOMER"] },
  PAYMENT_SUCCEEDED: { from: ["AWAITING_PAYMENT"], to: "ASSIGNED", actors: ["SYSTEM"] },
  START: { from: ["ASSIGNED"], to: "IN_PROGRESS", actors: ["PROVIDER"] },
  SUBMIT_COMPLETION: { from: ["IN_PROGRESS"], to: "COMPLETION_SUBMITTED", actors: ["PROVIDER"] },
  AWAIT_CONFIRMATION: { from: ["COMPLETION_SUBMITTED"], to: "AWAITING_CUSTOMER_CONFIRMATION", actors: ["SYSTEM"] },
  CONFIRM_COMPLETION: { from: ["AWAITING_CUSTOMER_CONFIRMATION"], to: "COMPLETED", actors: ["CUSTOMER"] },
  CANCEL: { from: PRE_PAYMENT, to: "CANCELLED", actors: ["CUSTOMER", "ADMIN"] },
  REQUEST_CANCELLATION: { from: PAID_ACTIVE, to: "CANCELLATION_REQUESTED", actors: ["CUSTOMER", "PROVIDER"] },
  ACCEPT_CANCELLATION: { from: ["CANCELLATION_REQUESTED"], to: "REFUNDED", actors: ["CUSTOMER", "PROVIDER", "ADMIN"] },
  DECLINE_CANCELLATION: { from: ["CANCELLATION_REQUESTED"], to: null, actors: ["CUSTOMER", "PROVIDER"] },
  OPEN_DISPUTE: {
    from: ["ASSIGNED", "IN_PROGRESS", "AWAITING_CUSTOMER_CONFIRMATION", "CANCELLATION_REQUESTED"],
    to: "DISPUTED",
    actors: ["CUSTOMER", "PROVIDER"],
  },
  RESOLVE_REFUND: { from: ["DISPUTED"], to: "REFUNDED", actors: ["ADMIN"] },
  RESOLVE_RELEASE: { from: ["DISPUTED"], to: "COMPLETED", actors: ["ADMIN"] },
};

export class TransitionError extends Error {
  constructor(message: string, public status = 409) {
    super(message);
  }
}

export function canTransition(action: OrderAction, status: OrderStatus, actor: Actor): boolean {
  const rule = TRANSITIONS[action];
  return rule.from.includes(status) && rule.actors.includes(actor);
}

/** Returns the status the order moves to, or throws if the move is not allowed. */
export function planTransition(
  action: OrderAction,
  order: { status: OrderStatus; previousStatus: OrderStatus | null },
  actor: Actor,
): OrderStatus {
  const rule = TRANSITIONS[action];
  if (!rule.actors.includes(actor)) throw new TransitionError(`${actor} cannot perform ${action}`, 403);
  if (!rule.from.includes(order.status))
    throw new TransitionError(`Cannot ${action.toLowerCase().replace(/_/g, " ")} while order is ${label(order.status)}`);
  if (rule.to === null) {
    if (!order.previousStatus) throw new TransitionError("No previous status to restore");
    return order.previousStatus;
  }
  return rule.to;
}

export const STATUS_LABELS: Record<OrderStatus, string> = {
  DRAFT: "Draft",
  OPEN_FOR_OFFERS: "Open for Offers",
  OFFERS_RECEIVED: "Offers Received",
  AWAITING_PAYMENT: "Awaiting Payment",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In Progress",
  COMPLETION_SUBMITTED: "Completion Submitted",
  AWAITING_CUSTOMER_CONFIRMATION: "Awaiting Confirmation",
  COMPLETED: "Completed",
  CANCELLATION_REQUESTED: "Cancellation Requested",
  CANCELLED: "Cancelled",
  DISPUTED: "Disputed",
  REFUNDED: "Refunded",
};

export function label(status: OrderStatus) {
  return STATUS_LABELS[status];
}

export const ACTIVE_STATUSES: OrderStatus[] = [
  "ASSIGNED",
  "IN_PROGRESS",
  "COMPLETION_SUBMITTED",
  "AWAITING_CUSTOMER_CONFIRMATION",
  "CANCELLATION_REQUESTED",
  "DISPUTED",
];
export const OPEN_STATUSES: OrderStatus[] = ["OPEN_FOR_OFFERS", "OFFERS_RECEIVED"];
export const CLOSED_STATUSES: OrderStatus[] = ["COMPLETED", "CANCELLED", "REFUNDED"];
