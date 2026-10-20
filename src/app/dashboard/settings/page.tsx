import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { REGIONS } from "@/lib/valorant";
import { changePasswordAction, updateAccountAction } from "@/actions/account";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, CardHeader, PageHeader } from "@/components/ui";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const viewer = await requireViewer();
  const user = await db.user.findUniqueOrThrow({ where: { id: viewer.id } });
  return (
    <>
      <PageHeader title="Settings" subtitle="Manage your account." />
      <div className="grid max-w-4xl gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Account" />
          <ActionForm action={updateAccountAction} className="space-y-4 px-5 py-4">
            <div><label className="label">Email</label><input disabled value={user.email} className="input" /></div>
            <div><label className="label" htmlFor="displayName">Display name</label><input id="displayName" name="displayName" defaultValue={user.displayName} required minLength={3} maxLength={24} className="input" /></div>
            <div>
              <label className="label" htmlFor="region">Region</label>
              <select id="region" name="region" defaultValue={user.region ?? "NA"} className="input">
                {REGIONS.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
              </select>
            </div>
            <SubmitButton>Save changes</SubmitButton>
          </ActionForm>
        </Card>
        <Card>
          <CardHeader title="Password" subtitle="Changing your password signs out your other sessions." />
          <ActionForm action={changePasswordAction} resetOnSuccess className="space-y-4 px-5 py-4">
            <div><label className="label" htmlFor="current">Current password</label><input id="current" name="current" type="password" required autoComplete="current-password" className="input" /></div>
            <div><label className="label" htmlFor="next">New password</label><input id="next" name="next" type="password" required minLength={10} autoComplete="new-password" className="input" /></div>
            <SubmitButton>Change password</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
