import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE, cookieOptions, createToken } from "@/lib/auth";

async function login(formData: FormData) {
  "use server";
  if (formData.get("password") !== process.env.APP_PASSWORD) redirect("/login?error=1");
  (await cookies()).set(AUTH_COOKIE, await createToken(), cookieOptions);
  redirect("/");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-2xl font-semibold">Speaking Practice</h1>
      <form action={login} className="flex flex-col gap-3">
        <input
          name="password"
          type="password"
          placeholder="パスワード"
          autoFocus
          className="rounded-lg border border-line bg-surface px-3 py-2"
        />
        {error && <p className="text-sm text-bad">パスワードが違います</p>}
        <button className="btn-primary">ログイン</button>
      </form>
    </main>
  );
}
