import { asc, count, desc, inArray } from "drizzle-orm";
import Link from "next/link";
import { db, t } from "@/db";
import { LEARNING_STATUSES, type ExpressionStatus } from "@/db/schema";
import { ExpressionCard } from "@/components/expression-card";
import { fieldClass as field, Header, Page } from "@/components/ui";
import { formatDateJst } from "@/lib/format";
import { addManualExpression, expressionAction } from "../actions";

const TABS: { key: string; label: string; statuses: readonly ExpressionStatus[] }[] = [
  { key: "learning", label: "練習中", statuses: LEARNING_STATUSES },
  { key: "suggested", label: "提案", statuses: ["suggested"] },
  { key: "queued", label: "出題待ち", statuses: ["queued"] },
  { key: "mastered", label: "習得", statuses: ["mastered"] },
];

const STATUS_LABEL: Record<ExpressionStatus, string> = {
  suggested: "提案",
  queued: "出題待ち",
  new: "未使用",
  attempted: "使おうとした",
  correct: "使えた",
  mastered: "習得",
};

export default async function ExpressionsPage({ searchParams }: PageProps<"/expressions">) {
  const tabKey = String((await searchParams).tab ?? "learning");
  const tab = TABS.find((x) => x.key === tabKey) ?? TABS[0];
  const [statusCounts, list] = await Promise.all([
    db().select({ status: t.expressions.status, n: count() }).from(t.expressions).groupBy(t.expressions.status),
    db()
      .select()
      .from(t.expressions)
      .where(inArray(t.expressions.status, tab.statuses))
      .orderBy(asc(t.expressions.nextReviewAt), desc(t.expressions.createdAt))
      .limit(100),
  ]);
  const tabCount = (statuses: readonly ExpressionStatus[]) =>
    statusCounts.filter((c) => statuses.includes(c.status)).reduce((s, c) => s + c.n, 0);

  return (
    <Page>
      <Header title="表現リスト" />
      <details className="card mb-4">
        <summary className="cursor-pointer text-sm font-medium">＋ 表現を自分で追加する</summary>
        <form action={addManualExpression} className="mt-3 flex flex-col gap-2 text-sm">
          <input name="text" required placeholder="英語（例: iron out the details）" className={field} />
          <input name="meaning" required placeholder="意味（例: 細部を詰める）" className={field} />
          <input name="example" placeholder="例文（任意）" className={field} />
          <div className="flex items-center gap-2">
            <select name="kind" defaultValue="" className={`${field} w-auto`}>
              <option value="">種類: 自動判定</option>
              <option value="phrase">フレーズ</option>
              <option value="word">単語・熟語</option>
            </select>
            <button className="btn-primary">追加</button>
          </div>
          <p className="text-xs text-muted">追加した表現は、次のレッスンから優先して出題されます。</p>
        </form>
      </details>
      <nav className="mb-4 flex gap-2 overflow-x-auto">
        {TABS.map((x) => (
          <Link
            key={x.key}
            href={`/expressions?tab=${x.key}`}
            className={`btn whitespace-nowrap ${x.key === tab.key ? "border-accent text-accent" : ""}`}
          >
            {x.label} <span className="text-muted">{tabCount(x.statuses)}</span>
          </Link>
        ))}
      </nav>
      {list.length === 0 && <p className="text-muted">まだありません。</p>}
      <div className="grid gap-3">
        {list.map((e) => (
          <ExpressionCard key={e.id} e={e} badge={STATUS_LABEL[e.status]}>
            <form action={expressionAction} className="flex flex-wrap gap-2 text-xs">
              <input type="hidden" name="id" value={e.id} />
              {e.status === "suggested" && (
                <button name="action" value="adopt" className="btn">＋出題リストへ</button>
              )}
              {e.status !== "mastered" && e.status !== "suggested" && (
                <button name="action" value="master" className="btn">習得済みにする</button>
              )}
              <button name="action" value="delete" className="btn">削除</button>
              {e.nextReviewAt && e.status !== "mastered" && (
                <span className="self-center text-muted">次回: {formatDateJst(e.nextReviewAt, "full")}</span>
              )}
            </form>
          </ExpressionCard>
        ))}
      </div>
    </Page>
  );
}
