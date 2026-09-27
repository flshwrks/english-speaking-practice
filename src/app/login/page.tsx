import { ArrowRight, LockKeyhole } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Blobs, Mascot, SparkleIcon } from "@/components/illustrations";
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
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm animate-rise">
        <div className="relative mb-6 overflow-hidden rounded-[28px] hero-gradient px-6 pt-8 pb-6 text-center text-white shadow-[var(--shadow-lift)]">
          <Blobs className="pointer-events-none absolute inset-0 h-full w-full" />
          <SparkleIcon size={18} color="#ffcf55" className="absolute top-6 left-8 animate-float" />
          <SparkleIcon size={12} color="#ffffff" className="absolute top-14 right-10 animate-float [animation-delay:1s]" />
          <Mascot mood="cheer" size={120} className="relative mx-auto animate-float drop-shadow-xl" />
          <h1 className="relative mt-3 text-2xl font-extrabold tracking-tight">Speaking Practice</h1>
          <p className="relative mt-1 text-sm text-white/85">毎日すこしずつ、ビジネス英語で話す力を。</p>
        </div>

        <form action={login} className="card flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="flex items-center gap-1.5 text-sm font-extrabold">
              <LockKeyhole size={15} className="text-accent" />
              パスワード
            </span>
            <input name="password" type="password" autoFocus autoComplete="current-password" className="field" />
          </label>
          {error && <p className="rounded-xl bg-bad-soft px-3 py-2 text-sm font-bold text-bad">パスワードが違います</p>}
          <button className="btn-primary mt-1 py-3">
            はじめる
            <ArrowRight size={18} strokeWidth={2.6} />
          </button>
        </form>
      </div>
    </main>
  );
}
