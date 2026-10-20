import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { loginAction } from "@/actions/auth";
import { ActionForm, SubmitButton } from "@/components/forms";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getViewer()) redirect(next && /^\/(?![\/\\])/.test(next) ? next : "/dashboard");
  return (
    <div className="card p-8">
      <h1 className="font-display text-2xl font-semibold">Welcome back</h1>
      <p className="mt-1 text-sm text-muted">Sign in to manage your orders.</p>
      <ActionForm action={loginAction} className="mt-6 space-y-4">
        <input type="hidden" name="next" value={next ?? ""} />
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
        </div>
        <SubmitButton className="w-full" pendingText="Signing in…">Sign in</SubmitButton>
      </ActionForm>
      <p className="mt-6 text-center text-sm text-muted">
        New to Redline? <Link href="/register" className="font-medium text-red-hot hover:underline">Create an account</Link>
      </p>
      {process.env.NODE_ENV !== "production" && (
        <p className="mt-4 rounded-md border border-line bg-coal px-3 py-2 text-xs text-faint">
          Dev accounts: customer@redline.local / provider@redline.local (Password123!), admin@redline.local (ChangeMe!123)
        </p>
      )}
    </div>
  );
}
