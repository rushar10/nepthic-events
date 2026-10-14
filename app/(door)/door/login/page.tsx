import { ActionForm, Submit } from "@/ui/Forms";
import { login } from "@/app/(door)/door/actions";

export const metadata = { title: "Staff sign-in" };

export default async function Login({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const { denied } = await searchParams;
  return (
    <div className="auth stack">
      <div className="hero" style={{ paddingBottom: 0 }}>
        <p className="eyebrow">Nepthic Door · staff only</p>
        <h1 className="page">Sign in to scan</h1>
        <p className="dim">Use your Nepthic Events staff login.</p>
      </div>
      {denied && <p className="note warn">That account doesn&apos;t have door access. Ask an admin to add it.</p>}
      <ActionForm action={login} className="panel prox">
        <label className="f">Email<input type="email" name="email" autoComplete="username" inputMode="email" required /></label>
        <label className="f">Password<input type="password" name="password" autoComplete="current-password" required /></label>
        <Submit pendingText="Signing in…">Sign in</Submit>
      </ActionForm>
    </div>
  );
}
