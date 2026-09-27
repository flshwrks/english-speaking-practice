import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-[360px]">
        <p className="meta">404</p>
        <h1 className="mt-1 text-2xl font-bold">ページが見つかりませんでした</h1>
        <p className="mt-2 text-fg-2">URL が変わったか、削除された可能性があります。</p>
        <Link href="/" className="btn-primary mt-6">
          ホームへ
        </Link>
      </div>
    </main>
  );
}
