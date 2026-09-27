import { asc, count, desc, inArray } from "drizzle-orm";
import { CheckCheck, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { db, t } from "@/db";
import { LEARNING_STATUSES, type ExpressionStatus } from "@/db/schema";
import { ExpressionCard } from "@/components/expression-card";
import type { Tone } from "@/components/illustrations";
import { EmptyState, Header, Page } from "@/components/ui";
import { formatDateJst } from "@/lib/format";
import { addManualExpression, expressionAction } from "../actions";

const TABS: { key: string; label: string; statuses: readonly ExpressionStatus[]; empty: string }[] = [
  { key: "learning", label: "練習中", statuses: LEARNING_STATUSES, empty: "レッスンで出題された表現がここに並びます" },
  { key: "suggested", label: "提案", statuses: ["suggested"], empty: "フィードバックで提案された表現がここに届きます" },
  { key: "queued", label: "出題待ち", statuses: ["queued"], empty: "次に出題される表現はありません" },
  { key: "mastered", label: "習得", statuses: ["mastered"], empty: "自然に使えた表現がここに集まります" },
];

const STATUS: Record<ExpressionStatus, { label: string; tone: Tone }> = {
  suggested: { label: "提案", tone: "sun" },
  queued: { label: "出題待ち", tone: "sky" },
  new: { label: "未使用", tone: "sky" },
  attempted: { label: "使おうとした", tone: "sun" },
  correct: { label: "使えた", tone: "mint" },
  mastered: { label: "習得", tone: "accent" },
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
    <Page wide>
      <Header back={null} eyebrow="Expressions" title="表現リスト" subtitle="覚えたい言い回しと単語・熟語" />

      <nav className="mb-6 flex overflow-x-auto border-b border-line [scrollbar-width:none]" aria-label="状態で絞り込む">
        {TABS.map((x) => {
          const active = x.key === tab.key;
          return (
            <Link
              key={x.key}
              href={`/expressions?tab=${x.key}`}
              aria-current={active ? "page" : undefined}
              className={`relative -mb-px flex items-baseline gap-1.5 border-b-2 px-4 py-2.5 text-sm whitespace-nowrap transition-colors first:pl-0 ${
                active ? "border-accent font-bold text-fg" : "border-transparent text-muted hover:text-fg"
              }`}
            >
              {x.label}
              <span className="font-mono text-[11px] text-muted tabular-nums">{tabCount(x.statuses)}</span>
            </Link>
          );
        })}
      </nav>

      <details className="group mb-8 border-b border-line">
        <summary className="flex cursor-pointer list-none items-center gap-3 pb-4 text-sm font-bold [&::-webkit-details-marker]:hidden">
          <Plus size={16} className="text-accent transition-transform group-open:rotate-45" />
          表現を自分で追加する
          <span className="ml-auto text-xs font-normal text-muted">次のレッスンから優先して出題</span>
        </summary>
        <form action={addManualExpression} className="grid gap-2.5 pb-6 sm:grid-cols-2">
          <input name="text" required placeholder="英語（例: iron out the details）" className="field" />
          <input name="meaning" required placeholder="意味（例: 細部を詰める）" className="field" />
          <input name="example" placeholder="例文（任意）" className="field sm:col-span-2" />
          <div className="flex items-center gap-2 sm:col-span-2">
            <select name="kind" defaultValue="" className="field w-auto">
              <option value="">種類: 自動判定</option>
              <option value="phrase">フレーズ</option>
              <option value="word">単語・熟語</option>
            </select>
            <button className="btn-ink ml-auto">
              <Plus size={16} />
              追加
            </button>
          </div>
        </form>
      </details>

      {list.length === 0 ? (
        <EmptyState title="まだありません">{tab.empty}</EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((e) => (
            <ExpressionCard key={e.id} e={e} badge={STATUS[e.status].label} badgeTone={STATUS[e.status].tone}>
              <form action={expressionAction} className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                <input type="hidden" name="id" value={e.id} />
                {e.status === "suggested" && (
                  <button name="action" value="adopt" className="btn-ink">
                    <Plus size={14} />
                    出題リストへ
                  </button>
                )}
                {e.status !== "mastered" && e.status !== "suggested" && (
                  <button name="action" value="master" className="btn">
                    <CheckCheck size={14} />
                    習得済みにする
                  </button>
                )}
                {e.nextReviewAt && e.status !== "mastered" && (
                  <span className="font-mono text-[11px] text-muted">
                    NEXT {formatDateJst(e.nextReviewAt)}
                  </span>
                )}
                <button name="action" value="delete" className="btn-ghost ml-auto px-2" aria-label="削除">
                  <Trash2 size={15} />
                </button>
              </form>
            </ExpressionCard>
          ))}
        </div>
      )}
    </Page>
  );
}
