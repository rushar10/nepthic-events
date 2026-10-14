import Link from "next/link";
import { Field } from "@/ui/ux/Field";
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
        <Field label="Full name (printed on tickets)" name="name" autoComplete="name" autoCapitalize="words" required />
        <Field label="Email" type="email" name="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} required />
        <Field label="Password" type="password" name="password" autoComplete="new-password" minLength={10} required hint="At least 10 characters" />
        <Submit pendingText="Creating…">Create account</Submit>
      </ActionForm>
      <p className="dim small">Already have one? <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`}>Sign in</Link>.</p>
    </div>
  );
}
