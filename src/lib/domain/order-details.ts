import { z } from "zod";
import { COACHING_CODES, COMM_OPTIONS, REGION_CODES, isRank, rankIndex } from "@/lib/valorant";

// Service-specific order requirements. These are validated on the server for every
// order; the client form uses the same schemas for instant feedback.

const rank = z.string().refine(isRank, "Choose a valid rank");

export const soloDetailsSchema = z
  .object({
    currentRank: rank,
    desiredRank: rank,
    queue: z.enum(["Competitive", "Premier"]),
    preferences: z.array(z.string().max(60)).max(10).default([]),
    timeframeDays: z.coerce.number().int().min(1).max(60),
  })
  .refine((d) => rankIndex(d.desiredRank) > rankIndex(d.currentRank), {
    message: "Desired rank must be above current rank",
    path: ["desiredRank"],
  });

export const duoDetailsSchema = z
  .object({
    currentRank: rank,
    mode: z.enum(["TARGET_RANK", "GAMES"]),
    targetRank: rank.optional(),
    games: z.coerce.number().int().min(1).max(100).optional(),
    server: z.string().min(1).max(60),
    schedule: z.string().min(1).max(300),
    communication: z.array(z.enum(COMM_OPTIONS as [string, ...string[]])).min(1),
  })
  .superRefine((d, ctx) => {
    if (d.mode === "TARGET_RANK") {
      if (!d.targetRank) ctx.addIssue({ code: "custom", message: "Choose a target rank", path: ["targetRank"] });
      else if (rankIndex(d.targetRank) <= rankIndex(d.currentRank))
        ctx.addIssue({ code: "custom", message: "Target rank must be above current rank", path: ["targetRank"] });
    } else if (!d.games) {
      ctx.addIssue({ code: "custom", message: "Enter number of games", path: ["games"] });
    }
  });

export const coachingDetailsSchema = z.object({
  coachingType: z.enum(COACHING_CODES as [string, ...string[]]),
  currentRank: rank,
  sessionMinutes: z.coerce.number().int().refine((m) => [30, 60, 90, 120].includes(m), "Invalid session length"),
  sessions: z.coerce.number().int().min(1).max(20),
  agent: z.string().max(30).optional(),
  map: z.string().max(30).optional(),
  goals: z.string().min(1, "Tell the coach what you want to improve").max(1000),
});

export type SoloDetails = z.infer<typeof soloDetailsSchema>;
export type DuoDetails = z.infer<typeof duoDetailsSchema>;
export type CoachingDetails = z.infer<typeof coachingDetailsSchema>;

export const baseOrderSchema = z.object({
  region: z.enum(REGION_CODES as [string, ...string[]]),
  notes: z.string().max(2000).default(""),
  deadline: z
    .string()
    .optional()
    .transform((v) => (v ? new Date(v) : undefined))
    .refine((d) => !d || (!isNaN(d.getTime()) && d.getTime() > Date.now()), "Deadline must be in the future"),
  budgetCents: z.number().int().positive().max(10_000_00).optional(),
});

export function detailsSchemaFor(kind: string) {
  switch (kind) {
    case "SOLO_RANK_UP":
      return soloDetailsSchema;
    case "DUO_RANK_UP":
      return duoDetailsSchema;
    case "COACHING":
      return coachingDetailsSchema;
    default:
      throw new Error(`Unknown service kind ${kind}`);
  }
}
