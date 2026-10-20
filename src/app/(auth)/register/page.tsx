import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { registerAction } from "@/actions/auth";
import { REGIONS } from "@/lib/valorant";
import { ActionForm, SubmitButton } from "@/components/forms";

export const metadata = { title: "Create account" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  if (await getViewer()) redirect("/dashboard");
  const provider = (await searchParams).type === "provider";
  return (
    <div className="card p-8">
      <h1 className="font-display text-2xl font-semibold">Create your account</h1>
      <p className="mt-1 text-sm text-muted">Join as a customer, or apply to become a vetted provider.</p>
      <ActionForm action={registerAction} className="mt-6 space-y-4">
        <fieldset>
          <legend className="label">Account type</legend>
          <div className="grid grid-cols-2 gap-2">
            {[
              ["CUSTOMER", "Customer", "Order services"],
              ["PROVIDER", "Provider", "Apply to offer services"],
            ].map(([v, t, d]) => (
              <label key={v} className="cursor-pointer rounded-lg border border-line bg-ink p-3 transition-colors has-[:checked]:border-red has-[:checked]:bg-red/5">
                <input type="radio" name="accountType" value={v} defaultChecked={provider ? v === "PROVIDER" : v === "CUSTOMER"} className="sr-only" />
                <span className="block text-sm font-semibold">{t}</span>
                <span className="block text-xs text-muted">{d}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label className="label" htmlFor="displayName">Display name</label>
          <input id="displayName" name="displayName" required minLength={3} maxLength={24} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required className="input" />
          <p className="mt-1 text-xs text-faint">At least 10 characters.</p>
        </div>
        <div>
          <label className="label" htmlFor="region">Region</label>
          <select id="region" name="region" className="input" defaultValue="NA">
            {REGIONS.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
          </select>
        </div>
        <SubmitButton className="w-full" pendingText="Creating account…">Create account</SubmitButton>
        <p className="text-xs text-faint">Redline will never ask for your game account password.</p>
      </ActionForm>
      <p className="mt-6 text-center text-sm text-muted">
        Already have an account? <Link href="/login" className="font-medium text-red-hot hover:underline">Sign in</Link>
      </p>
    </div>
  );
}
