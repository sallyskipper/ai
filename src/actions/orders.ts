"use server";

import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { parseDollars } from "@/lib/money";
import { UserError, type ActionResult } from "@/lib/errors";
import * as orders from "@/lib/domain/orders";
import * as payments from "@/lib/payments/service";
import { sendMessage, type Upload } from "@/lib/domain/messages";
import { createReview, respondToReview } from "@/lib/domain/reviews";
import type { MinPriceResult } from "@/lib/domain/pricing";
import { run, str } from "./run";

/** Live minimum-price quote for the order form. The same computation runs again on submit. */
export async function quoteAction(serviceSlug: string, details: unknown): Promise<ActionResult<MinPriceResult>> {
  await requireViewer();
  return run(() => orders.quoteMinPrice(serviceSlug, details));
}

export async function createOrderAction(input: {
  serviceSlug: string;
  region: string;
  details: unknown;
  notes: string;
  deadline: string;
  budget: string;
  publish: boolean;
}): Promise<ActionResult> {
  const viewer = await requireViewer();
  const res = await run(async () => {
    const budgetCents = parseDollars(input.budget);
    if (Number.isNaN(budgetCents)) throw new UserError("Enter a valid budget");
    return orders.createOrder(viewer, { ...input, budgetCents });
  });
  if (!res.ok) return res;
  redirect(`/dashboard/orders/${res.data!.id}`);
}

const byId = (fd: FormData) => str(fd, "orderId");

export async function publishOrderAction(fd: FormData) {
  const v = await requireViewer();
  return run(() => orders.publishOrder(v, byId(fd)), "Order is now open for offers");
}

export async function cancelOrderAction(fd: FormData) {
  const v = await requireViewer();
  return run(() => orders.cancelOrder(v, byId(fd), str(fd, "reason")), "Order cancelled");
}

export async function submitOfferAction(fd: FormData) {
  const v = await requireViewer();
  return run(() => {
    const priceCents = parseDollars(str(fd, "price"));
    if (priceCents === undefined || Number.isNaN(priceCents)) throw new UserError("Enter a valid price");
    const etaHours = Math.round(Number(str(fd, "etaValue")) * (str(fd, "etaUnit") === "days" ? 24 : 1));
    return orders.submitOffer(v, byId(fd), { priceCents, etaHours, message: str(fd, "message") });
  }, "Offer submitted");
}

export async function withdrawOfferAction(fd: FormData) {
  const v = await requireViewer();
  return run(() => orders.withdrawOffer(v, str(fd, "offerId")), "Offer withdrawn");
}

export async function acceptOfferAction(fd: FormData): Promise<ActionResult> {
  const v = await requireViewer();
  const res = await run(async () => {
    const orderId = await orders.acceptOffer(v, str(fd, "offerId"));
    return payments.startCheckout(v, orderId);
  });
  if (!res.ok) return res;
  redirect(res.data!);
}

export async function payNowAction(fd: FormData): Promise<ActionResult> {
  const v = await requireViewer();
  const res = await run(() => payments.startCheckout(v, byId(fd)));
  if (!res.ok) return res;
  redirect(res.data!);
}

export async function changeSelectionAction(fd: FormData) {
  const v = await requireViewer();
  return run(() => orders.changeSelection(v, byId(fd)), "You can now choose a different offer");
}

export async function startOrderAction(fd: FormData) {
  const v = await requireViewer();
  return run(() => orders.startOrder(v, byId(fd)), "Order started");
}

export async function submitCompletionAction(fd: FormData) {
  const v = await requireViewer();
  return run(() => orders.submitCompletion(v, byId(fd), str(fd, "note")), "Completion submitted to the customer");
}

export async function confirmCompletionAction(fd: FormData) {
  const v = await requireViewer();
  return run(() => orders.confirmCompletion(v, byId(fd)), "Order completed — thanks!");
}

export async function requestCancellationAction(fd: FormData) {
  const v = await requireViewer();
  return run(() => orders.requestCancellation(v, byId(fd), str(fd, "reason")), "Cancellation requested");
}

export async function acceptCancellationAction(fd: FormData) {
  const v = await requireViewer();
  return run(() => payments.acceptCancellation(v, byId(fd)), "Order cancelled and refunded");
}

export async function declineCancellationAction(fd: FormData) {
  const v = await requireViewer();
  return run(() => orders.declineCancellation(v, byId(fd)), "Cancellation declined");
}

export async function openDisputeAction(fd: FormData) {
  const v = await requireViewer();
  return run(() => orders.openDispute(v, byId(fd), str(fd, "reason")), "Dispute opened — support will review it");
}

export async function sendMessageAction(fd: FormData) {
  const v = await requireViewer();
  return run(async () => {
    const files: Upload[] = [];
    for (const f of fd.getAll("files")) {
      if (f instanceof File && f.size > 0) files.push({ name: f.name, type: f.type, bytes: Buffer.from(await f.arrayBuffer()) });
    }
    await sendMessage(v, byId(fd), str(fd, "body"), files);
  });
}

export async function createReviewAction(fd: FormData) {
  const v = await requireViewer();
  return run(() => createReview(v, byId(fd), Number(str(fd, "rating")), str(fd, "body")), "Review published");
}

export async function respondReviewAction(fd: FormData) {
  const v = await requireViewer();
  return run(() => respondToReview(v, str(fd, "reviewId"), str(fd, "response")), "Response posted");
}
