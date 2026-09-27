"use client";

import { Home, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Mascot } from "@/components/illustrations";
import { Page } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <Page>
      <div className="flex flex-col items-center py-16 text-center">
        <Mascot mood="sleepy" size={140} className="animate-float" />
        <h1 className="mt-4 text-xl font-extrabold">うまく表示できませんでした</h1>
        <p className="mt-1 max-w-sm text-sm text-muted">通信が不安定だったかもしれません。もう一度試してみてください。</p>
        <div className="mt-6 flex gap-2">
          <button className="btn-primary" onClick={reset}>
            <RotateCcw size={17} strokeWidth={2.5} />
            もう一度
          </button>
          <Link href="/" className="btn">
            <Home size={16} />
            ホームへ
          </Link>
        </div>
      </div>
    </Page>
  );
}
