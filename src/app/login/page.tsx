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
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-[360px]">
        <div className="mb-8 flex items-center gap-2">
          <Logo size={22} />
          <span className="text-[17px] font-bold">Speaking Practice</span>
        </div>
        <h1 className="text-2xl leading-snug font-bold">毎日すこしずつ、話す力を。</h1>
        <p className="meta mt-1">ビジネス英語スピーキングの自分専用トレーニング</p>

        <form action={login} className="mt-8 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-bold">パスワード</span>
            <input name="password" type="password" autoFocus autoComplete="current-password" className="field" />
          </label>
          {error && <p className="text-sm text-accent">パスワードが違います</p>}
          <button className="btn-primary mt-2 py-3">ログイン</button>
        </form>
      </div>
    </main>
  );
}
