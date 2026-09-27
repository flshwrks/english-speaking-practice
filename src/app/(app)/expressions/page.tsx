import { asc, count, desc, inArray } from "drizzle-orm";
import { Check, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { db, t } from "@/db";
import { LEARNING_STATUSES, type ExpressionStatus } from "@/db/schema";
import { ExpressionEntry } from "@/components/expression-card";
import { EmptyState, Page, PageTitle } from "@/components/ui";
import { formatDateJst } from "@/lib/format";
import { addManualExpression, expressionAction } from "../actions";

const TABS: { key: string; label: string; statuses: readonly ExpressionStatus[]; empty: string }[] = [
  { key: "learning", label: "練習中", statuses: LEARNING_STATUSES, empty: "レッスンで出題された表現がここに並びます" },
  { key: "suggested", label: "提案", statuses: ["suggested"], empty: "フィードバックで提案された表現がここに届きます" },
  { key: "queued", label: "出題待ち", statuses: ["queued"], empty: "次に出題される表現はありません" },
  { key: "mastered", label: "習得", statuses: ["mastered"], empty: "自然に使えた表現がここに集まります" },
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
      <PageTitle sub="覚えたい言い回しと単語・熟語">表現</PageTitle>

      <div className="relative mb-2 flex items-end justify-between gap-3 border-b border-line">
        <nav className="-mb-px flex overflow-x-auto [scrollbar-width:none]" aria-label="状態で絞り込む">
          {TABS.map((x) => {
            const active = x.key === tab.key;
            return (
              <Link
                key={x.key}
                href={`/expressions?tab=${x.key}`}
                aria-current={active ? "page" : undefined}
                className={`flex items-baseline gap-1.5 border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors first:pl-0 ${
                  active ? "border-fg font-bold text-fg" : "border-transparent text-fg-2 hover:text-fg"
                }`}
              >
                {x.label}
                <span className="text-xs text-muted tabular-nums">{tabCount(x.statuses)}</span>
              </Link>
            );
          })}
        </nav>
        <details className="group mb-1.5 shrink-0">
          <summary className="btn px-3 py-1.5">
            <Plus size={16} strokeWidth={2} className="transition-transform group-open:rotate-45" />
            <span>
              <span className="max-sm:hidden">表現を</span>追加
            </span>
          </summary>
          <form
            action={addManualExpression}
            className="absolute inset-x-0 top-full z-20 mt-2 grid gap-2.5 rounded-[14px] border border-line bg-surface p-4 shadow-float sm:grid-cols-2 sm:p-5"
          >
            <p className="meta sm:col-span-2">次のレッスンから優先して出題します</p>
            <input name="text" required placeholder="英語（例: iron out the details）" className="field" />
            <input name="meaning" required placeholder="意味（例: 細部を詰める）" className="field" />
            <input name="example" placeholder="例文（任意）" className="field sm:col-span-2" />
            <div className="flex items-center gap-2 sm:col-span-2">
              <select name="kind" defaultValue="" className="field w-auto">
                <option value="">種類: 自動判定</option>
                <option value="phrase">フレーズ</option>
                <option value="word">単語・熟語</option>
              </select>
              <button className="btn-primary ml-auto">追加する</button>
            </div>
          </form>
        </details>
      </div>

      {list.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="まだありません">{tab.empty}</EmptyState>
        </div>
      ) : (
        <div className="divide-y divide-line">
          {list.map((e) => (
            <ExpressionEntry
              key={e.id}
              e={e}
              layout="row"
              status={tab.statuses.length > 1 ? STATUS_LABEL[e.status] : undefined}
            >
              <form action={expressionAction} className="flex items-center gap-1">
                <input type="hidden" name="id" value={e.id} />
                {e.nextReviewAt && e.status !== "mastered" && (
                  <span className="meta mr-2 tabular-nums" title="次に出題される日">
                    次回 {formatDateJst(e.nextReviewAt)}
                  </span>
                )}
                {e.status === "suggested" && (
                  <button name="action" value="adopt" className="btn px-2.5 text-[13px]">
                    <Plus size={14} strokeWidth={2} />
                    出題リストへ
                  </button>
                )}
                {e.status !== "mastered" && e.status !== "suggested" && (
                  <button
                    name="action"
                    value="master"
                    className="btn-ghost px-2"
                    title="習得済みにする"
                    aria-label="習得済みにする"
                  >
                    <Check size={17} strokeWidth={1.75} />
                  </button>
                )}
                <button name="action" value="delete" className="btn-ghost px-2" title="削除" aria-label="削除">
                  <Trash2 size={16} strokeWidth={1.75} />
                </button>
              </form>
            </ExpressionEntry>
          ))}
        </div>
      )}
    </Page>
  );
}
