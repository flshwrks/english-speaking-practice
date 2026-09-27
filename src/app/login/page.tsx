import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Logo } from "@/components/illustrations";
import { AUTH_COOKIE, cookieOptions, createToken } from "@/lib/auth";

export const metadata: Metadata = { title: "ログイン" };

async function login(formData: FormData) {
  "use server";
  if (formData.get("password") !== process.env.APP_PASSWORD) redirect("/login?error=1");
  (await cookies()).set(AUTH_COOKIE, await createToken(), cookieOptions);
  redirect("/");
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-dvh flex-col justify-between px-6 py-8 sm:px-12 sm:py-10">
      <div className="flex items-center gap-2.5">
        <Logo size={22} />
        <span className="text-[15px] font-bold tracking-tight">Speaking Practice</span>
      </div>

      <div className="mx-auto w-full max-w-md animate-rise py-12">
        <p className="eyebrow mb-4">Private / Business English</p>
        <h1 className="font-serif text-[56px] leading-[0.95] tracking-tight sm:text-[72px]">
          Speak a little,
          <br />
          <span className="text-accent italic">every day.</span>
        </h1>
        <p className="mt-4 text-sm text-muted">毎日すこしずつ、ビジネス英語で話す力を。</p>

        <form action={login} className="mt-10 flex flex-col gap-3 border-t border-fg pt-4">
          <label className="flex flex-col gap-2">
            <span className="eyebrow">Password</span>
            <input name="password" type="password" autoFocus autoComplete="current-password" className="field" />
          </label>
          {error && <p className="border-l-2 border-bad pl-3 text-sm font-bold text-bad">パスワードが違います</p>}
          <button className="btn-primary mt-2 py-3">
            はじめる
            <ArrowRight size={17} />
          </button>
        </form>
      </div>

      <p className="font-mono text-[11px] text-muted">© Speaking Practice</p>
    </main>
  );
}
