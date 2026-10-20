import "server-only";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { UserError, type ActionResult } from "@/lib/errors";
import { TransitionError } from "@/lib/domain/order-machine";

/** Runs a mutation and converts known errors into a user-facing result. */
export async function run<T>(fn: () => Promise<T>, message?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    revalidatePath("/", "layout");
    return { ok: true, data, message };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof UserError || e instanceof TransitionError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
export const strs = (fd: FormData, k: string) => fd.getAll(k).filter((v): v is string => typeof v === "string" && v !== "");
export const int = (fd: FormData, k: string) => {
  const s = str(fd, k);
  return s === "" ? undefined : Number(s);
};
