import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import type { ActorRef } from "@/lib/domain/transition";

const uid = () => randomBytes(4).toString("hex");

export async function makeUser(role: "CUSTOMER" | "PROVIDER" | "ADMIN", providerStatus?: "APPROVED" | "PENDING" | "SUSPENDED") {
  const u = await db.user.create({
    data: { email: `${role.toLowerCase()}-${uid()}@test.local`, passwordHash: "x", displayName: `${role} ${uid()}`, role },
  });
  if (role === "PROVIDER" && providerStatus)
    await db.providerProfile.create({
      data: {
        userId: u.id,
        status: providerStatus,
        regions: ["NA"],
        supportedServices: ["valorant-duo-rank-up", "valorant-coaching"],
        coachingSpecialties: [],
        agents: [],
        languages: [],
      },
    });
  return { id: u.id, role, email: u.email } as ActorRef & { email: string };
}

export const coachingOrder = {
  serviceSlug: "valorant-coaching",
  region: "NA",
  details: { coachingType: "LIVE_1ON1", currentRank: "Gold 2", sessionMinutes: 60, sessions: 2, goals: "Improve crosshair placement" },
  publish: true,
};
