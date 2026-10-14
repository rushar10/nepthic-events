import { ActionForm, Submit } from "@/ui/Forms";
import { login } from "@/lib/admin/actions/auth";

export const metadata = { title: "Sign in" };

export default async function Login({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const { denied } = await searchParams;
  return (
    <div className="auth stack">
      <div className="hero" style={{ paddingBottom: 0 }}>
        <p className="eyebrow">Staff only</p>
        <h1 className="page">Sign in to Admin</h1>
      </div>
      {denied && <p className="note warn">Your account can&apos;t open that page.</p>}
      <ActionForm action={login} className="panel prox">
        <label className="f">Email<input type="email" name="email" autoComplete="username" required /></label>
        <label className="f">Password<input type="password" name="password" autoComplete="current-password" required /></label>
        <Submit pendingText="Signing in…">Sign in</Submit>
      </ActionForm>
    </div>
  );
}
