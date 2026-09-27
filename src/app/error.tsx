"use client";

import { ArrowLeft, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Page } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <Page>
      <div className="py-16">
        <p className="eyebrow">Something went wrong</p>
        <p className="mt-3 font-serif text-5xl italic">Hmm.</p>
        <h1 className="mt-4 text-2xl font-bold">うまく表示できませんでした</h1>
        <p className="mt-2 max-w-sm text-sm text-muted">通信が不安定だったかもしれません。もう一度試してみてください。</p>
        <div className="mt-8 flex gap-2">
          <button className="btn-primary" onClick={reset}>
            <RotateCcw size={16} />
            もう一度
          </button>
          <Link href="/" className="btn">
            <ArrowLeft size={16} />
            ホームへ
          </Link>
        </div>
      </div>
    </Page>
  );
}
