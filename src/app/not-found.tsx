import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Page } from "@/components/ui";

export default function NotFound() {
  return (
    <Page>
      <div className="py-16">
        <p className="eyebrow">Error 404</p>
        <p className="numeral mt-3 text-[120px] leading-none text-accent">404</p>
        <h1 className="mt-4 text-2xl font-bold">ページが見つかりませんでした</h1>
        <p className="mt-2 text-sm text-muted">URL が変わったか、削除された可能性があります。</p>
        <Link href="/" className="btn mt-8">
          <ArrowLeft size={16} />
          ホームへ戻る
        </Link>
      </div>
    </Page>
  );
}
