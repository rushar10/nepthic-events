import Link from "next/link";
import { ActionForm, Submit } from "@/ui/Forms";
import { register } from "@/app/actions/auth";

export const metadata = { title: "Create an account" };

export default async function Register({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="auth stack">
      <div className="hero" style={{ paddingBottom: 0 }}>
        <p className="eyebrow">Nepthic account</p>
        <h1 className="page">Create an account</h1>
        <p className="dim">Your tickets live here, and the same login works on the Nepthic store.</p>
      </div>
      <ActionForm action={register} className="panel prox">
        <input type="hidden" name="next" value={next ?? "/tickets"} />
        <label className="f">Full name (printed on tickets)<input type="text" name="name" autoComplete="name" required /></label>
        <label className="f">Email<input type="email" name="email" autoComplete="email" required /></label>
        <label className="f">Password<input type="password" name="password" autoComplete="new-password" minLength={10} required /></label>
        <Submit pendingText="Creating…">Create account</Submit>
      </ActionForm>
      <p className="dim small">Already have one? <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`}>Sign in</Link>.</p>
    </div>
  );
}
