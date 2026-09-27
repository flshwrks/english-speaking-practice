import { Home } from "lucide-react";
import Link from "next/link";
import { Mascot } from "@/components/illustrations";
import { Page } from "@/components/ui";

export default function NotFound() {
  return (
    <Page>
      <div className="flex flex-col items-center py-16 text-center">
        <Mascot mood="think" size={140} className="animate-float" />
        <div className="mt-4 text-5xl font-extrabold text-accent">404</div>
        <h1 className="mt-2 text-xl font-extrabold">ページが見つかりませんでした</h1>
        <p className="mt-1 text-sm text-muted">URL が変わったか、削除された可能性があります。</p>
        <Link href="/" className="btn-primary mt-6">
          <Home size={17} strokeWidth={2.5} />
          ホームへ戻る
        </Link>
      </div>
    </Page>
  );
}
