"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, destroySession, hashPassword, verifyPassword } from "@/lib/auth";
import { UserError, type ActionResult } from "@/lib/errors";
import { REGION_CODES } from "@/lib/valorant";
import { run, str } from "./run";

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(10, "Password must be at least 10 characters").max(200),
  displayName: z.string().trim().min(3, "Display name must be at least 3 characters").max(24).regex(/^[\w .-]+$/, "Letters, numbers, spaces, . _ - only"),
  accountType: z.enum(["CUSTOMER", "PROVIDER"]),
  region: z.enum(REGION_CODES as [string, ...string[]]),
});

const COLORS = ["#E50914", "#3FB5C4", "#B38CF0", "#E8B64B", "#2FBF71", "#FF7A45"];

export async function registerAction(fd: FormData): Promise<ActionResult> {
  const res = await run(async () => {
    const parsed = registerSchema.safeParse({
      email: str(fd, "email"),
      password: fd.get("password"),
      displayName: str(fd, "displayName"),
      accountType: str(fd, "accountType"),
      region: str(fd, "region"),
    });
    if (!parsed.success) throw new UserError(parsed.error.issues[0].message);
    const { email, password, displayName, accountType, region } = parsed.data;
    if (await db.user.findUnique({ where: { email } })) throw new UserError("An account with this email already exists");
    const user = await db.user.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        displayName,
        role: accountType,
        region,
        avatarColor: COLORS[Math.floor(Math.random() * COLORS.length)],
      },
    });
    await createSession(user.id);
    return accountType;
  });
  if (!res.ok) return res;
  redirect(res.data === "PROVIDER" ? "/dashboard/apply" : "/dashboard");
}

export async function loginAction(fd: FormData): Promise<ActionResult> {
  const email = str(fd, "email").toLowerCase();
  const password = String(fd.get("password") ?? "");
  const user = await db.user.findUnique({ where: { email } });
  // Always run bcrypt to keep timing similar for unknown emails.
  const ok = await verifyPassword(password, user?.passwordHash ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva");
  if (!user || !ok) return { ok: false, error: "Incorrect email or password" };
  if (user.status !== "ACTIVE") return { ok: false, error: "This account is suspended. Contact support." };
  await createSession(user.id);
  const next = str(fd, "next");
  redirect(/^\/(?![\/\\])/.test(next) ? next : user.role === "ADMIN" ? "/admin" : "/dashboard");
}

export async function logoutAction() {
  await destroySession();
  redirect("/");
}
