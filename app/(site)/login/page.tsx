import Link from "next/link";
import { ActionForm, Submit } from "@/ui/Forms";
import { login } from "@/app/actions/auth";

export const metadata = { title: "Sign in" };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; denied?: string }> }) {
  const { next, denied } = await searchParams;
  return (
    <div className="auth stack">
      <div className="hero" style={{ paddingBottom: 0 }}>
        <p className="eyebrow">Nepthic account</p>
        <h1 className="page">Sign in</h1>
        <p className="dim">Your Nepthic Events account holds your tickets and orders.</p>
      </div>
      {denied && <p className="note warn">Door staff now sign in on the Nepthic Door app.</p>}
      <ActionForm action={login} className="panel prox">
        <input type="hidden" name="next" value={next ?? "/tickets"} />
        <label className="f">Email<input type="email" name="email" autoComplete="email" required /></label>
        <label className="f">Password<input type="password" name="password" autoComplete="current-password" required /></label>
        <Submit pendingText="Signing in…">Sign in</Submit>
      </ActionForm>
      <p className="dim small">New here? <Link href={`/register${next ? `?next=${encodeURIComponent(next)}` : ""}`}>Create an account</Link>.</p>
    </div>
  );
}
