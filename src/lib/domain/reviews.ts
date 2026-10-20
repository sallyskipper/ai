import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { UserError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import type { ActorRef } from "./transition";

/** Only the customer of a completed order may review it, once. */
export async function createReview(user: ActorRef, orderId: string, rating: number, body: string) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new UserError("Rating must be 1–5 stars");
  const text = body.trim();
  if (text.length < 10 || text.length > 2000) throw new UserError("Review must be 10–2000 characters");
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order || order.customerId !== user.id) throw new UserError("You can only review your own orders", 403);
  if (order.status !== "COMPLETED" || !order.providerId) throw new UserError("You can review an order once it is completed");
  try {
    return await db.$transaction(async (tx) => {
      const review = await tx.review.create({
        data: { orderId, authorId: user.id, providerId: order.providerId!, rating, body: text },
      });
      await notify(tx, order.providerId, "REVIEW", "New review", `You received a ${rating}-star review on order #${order.number}.`, "/dashboard/reviews");
      return review;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      throw new UserError("You have already reviewed this order");
    throw e;
  }
}

export async function respondToReview(user: ActorRef, reviewId: string, response: string) {
  const text = response.trim();
  if (text.length < 2 || text.length > 1000) throw new UserError("Response must be 2–1000 characters");
  const review = await db.review.findUnique({ where: { id: reviewId } });
  if (!review || review.providerId !== user.id) throw new UserError("Review not found", 404);
  if (review.providerResponse) throw new UserError("You have already responded to this review");
  await db.review.update({ where: { id: reviewId }, data: { providerResponse: text, respondedAt: new Date() } });
}

export async function moderateReview(user: ActorRef, reviewId: string, status: "PUBLISHED" | "FLAGGED" | "REMOVED", note: string) {
  if (user.role !== "ADMIN") throw new UserError("Admins only", 403);
  await db.$transaction(async (tx) => {
    const review = await tx.review.update({ where: { id: reviewId }, data: { status, moderationNote: note || null } });
    await audit(tx, user.id, `review.${status.toLowerCase()}`, "Review", reviewId, { note, providerId: review.providerId });
  });
}

/** Public performance statistics, computed only from real orders and published reviews. */
export async function providerStats(providerId: string) {
  const [ratingAgg, completed, refundedOrCancelled, offers] = await Promise.all([
    db.review.aggregate({ where: { providerId, status: "PUBLISHED" }, _avg: { rating: true }, _count: true }),
    db.order.count({ where: { providerId, status: "COMPLETED" } }),
    db.order.count({ where: { providerId, status: { in: ["REFUNDED", "CANCELLED"] }, assignedAt: { not: null } } }),
    db.offer.findMany({
      where: { providerId },
      select: { createdAt: true, order: { select: { publishedAt: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);
  const finished = completed + refundedOrCancelled;
  const gaps = offers
    .filter((o) => o.order.publishedAt)
    .map((o) => (o.createdAt.getTime() - o.order.publishedAt!.getTime()) / 60000)
    .filter((m) => m >= 0);
  return {
    avgRating: ratingAgg._avg.rating,
    reviewCount: ratingAgg._count,
    completedOrders: completed,
    completionRate: finished ? completed / finished : null,
    cancellationRate: finished ? refundedOrCancelled / finished : null,
    avgResponseMinutes: gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null,
  };
}
