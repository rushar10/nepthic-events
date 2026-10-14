"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, eq, users } from "@/db";
import { createSession, destroySession, hashPassword, loginWithPassword } from "@/core/auth";
import { str, zodMessage, type FormState } from "@/core/forms";

const safeNext = (n: string) => (n.startsWith("/") && !n.startsWith("//") ? n : "/tickets");

export async function login(_: FormState, fd: FormData): Promise<FormState> {
  const user = await loginWithPassword(str(fd, "email"), String(fd.get("password") ?? ""));
  if (!user) return { error: "That email and password don't match an account." };
  redirect(safeNext(str(fd, "next")));
}

export async function logout() {
  await destroySession();
  redirect("/");
}

const Register = z.object({
  name: z.string().min(2, "Enter your full name. It's printed on your tickets."),
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(10, "Use at least 10 characters for your password."),
});

export async function register(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = Register.safeParse({ name: str(fd, "name"), email: str(fd, "email"), password: String(fd.get("password") ?? "") });
  if (!parsed.success) return { error: zodMessage(parsed.error) };
  const email = parsed.data.email.toLowerCase();
  if (await db.query.users.findFirst({ where: eq(users.email, email) })) return { error: "An account with this email already exists. Sign in instead." };
  const [u] = await db.insert(users).values({ email, name: parsed.data.name, passwordHash: await hashPassword(parsed.data.password) }).returning();
  await createSession(u.id);
  redirect(safeNext(str(fd, "next")));
}
