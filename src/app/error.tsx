"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-[360px]">
        <h1 className="text-2xl font-bold">うまく表示できませんでした</h1>
        <p className="mt-2 text-fg-2">通信が不安定だったかもしれません。もう一度試してみてください。</p>
        <div className="mt-6 flex gap-2">
          <button className="btn-primary" onClick={reset}>
            もう一度
          </button>
          <Link href="/" className="btn">
            ホームへ
          </Link>
        </div>
      </div>
    </main>
  );
}
