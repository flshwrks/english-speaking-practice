import Link from "next/link";
import { connection } from "next/server";
import { budgetStatus, getCurrentCurriculum } from "@/lib/lesson";
import { Meter, WeekTrack } from "./ui";

/** サイドバー下部: 今週の位置と今月の API 費用 */
export async function ShellStatus() {
  await connection();
  const [{ curriculum }, budget] = await Promise.all([getCurrentCurriculum(), budgetStatus()]);
  const ratio = budget.spentJpy / budget.budgetJpy;
  return (
    <div className="flex flex-col gap-5">
      <Link href="/curriculum" className="-mx-2 rounded-lg px-2 py-2 transition-colors hover:bg-bg">
        <div className="meta">第{curriculum.week}週</div>
        <div className="mb-2.5 text-[13px] leading-snug font-medium">{curriculum.theme}</div>
        <WeekTrack current={curriculum.week} />
      </Link>
      <div>
        <div className="meta mb-1.5 flex justify-between tabular-nums">
          <span>今月の API</span>
          <span>
            ¥{Math.round(budget.spentJpy).toLocaleString()} / ¥{budget.budgetJpy.toLocaleString()}
          </span>
        </div>
        <Meter value={ratio} warn={ratio > 0.8} />
      </div>
    </div>
  );
}
