/**
 * 表現の間隔反復（SM-2 を話す練習向けに直したもの）。DB を読まない純粋関数だけを置く。
 *
 * - 安定度 S（intervalDays, 日）: 次に出題するまでの間隔。正しく使えるたびに ease 倍に伸び、誤用で半分に縮む
 * - ease（1.3〜3.0）: 表現ごとの覚えやすさ。自発的に使えたら上げ、誤用で下げる
 * - 使わなかった（出題されたが口から出なかった）は「忘れた」証拠にならない（話の流れで使う場面がないことも多い）。
 *   S は変えず、1→2→4日と間を空けて出し直す。一度も使えないまま3回続いたら「苦手（leech）」として
 *   2週間休ませる（枠を詰まらせない）。休みが明けたら優先度を上げた普通の復習として戻し、
 *   使わなかった回数も数え直す（また3回続けば再び休ませる）
 * - 言い直し練習（FB の指摘に紐づく表現）で言えたら S を 1.5 倍・苦手も解除。会話で使えたわけではないので習得の回数には数えない
 * - 習得: 3回以上間隔をあけて正しく使え、S が21日以上（Anki の「成熟」と同じ基準）。
 *   または、一度正しく使えた表現を、日をおいて促されずに使えたとき（別の場面で自分から出せた＝使える語彙になった）
 * - 日付はすべて日本時間の日単位で扱う（同じ日の中で出題が変わらないように）
 */
import type { ExpressionStatus } from "@/db/schema";
import { DAY_MS, isoDateJst } from "./format";

export type Grade = "unused" | "incorrect" | "correct" | "spontaneous" | "drill";

export type SrsState = {
  id: number;
  status: ExpressionStatus;
  /** 安定度 S（日）。0 はまだ一度も正しく使えていない */
  intervalDays: number;
  ease: number;
  /** 会話で正しく使えた回数 */
  reps: number;
  lapses: number;
  /** 続けて使わなかった回数 */
  misses: number;
  lastPracticedAt: Date | null;
  nextReviewAt: Date | null;
};

export type SrsUpdate = Omit<SrsState, "id">;

const EASE = { min: 1.3, max: 3.0, spontaneous: 0.15, incorrect: -0.2 } as const;
/** 初めて正しく使えたときの S（促されて / 自発的に） */
const FIRST_INTERVAL = { correct: 2, spontaneous: 4 } as const;
const SPONTANEOUS_BONUS = 1.3;
const LAPSE_FACTOR = 0.5;
const DRILL_FACTOR = 1.5;
/** 使わなかったときの出し直しまでの日数の上限 */
const MISS_MAX_DAYS = 4;
/** 一度も使えないまま続けて使わなかった回数がこれに達したら苦手（leech）。LEECH_REST_DAYS 日休ませる */
export const LEECH_MISSES = 3;
const LEECH_REST_DAYS = 14;
const LEECH_BOOST = 2;
export const MASTERY = { reps: 3, intervalDays: 21 } as const;

/** 日付（YYYY-MM-DD）の差（日） */
export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
}

/** 日本時間のその日の 0:00 */
export function jstMidnight(date: string) {
  return new Date(`${date}T00:00:00+09:00`);
}

/** today の days 日後の 0:00（日本時間に夏時間はないので日数分足すだけでよい） */
const dueOn = (today: string, days: number) => new Date(jstMidnight(today).getTime() + days * DAY_MS);

/** 以前の方式で作られた行も扱えるように: 「correct」なら1回は正しく使えている */
const effectiveReps = (s: SrsState) => Math.max(s.reps, s.status === "correct" ? 1 : 0);

export const isLeech = (s: Pick<SrsState, "reps" | "misses">) => s.reps === 0 && s.misses >= LEECH_MISSES;

/** 前回練習してからの日数。記録がない古い行は「期限の S 日前（最短1日前）に練習した」とみなす */
export function elapsedDays(s: SrsState, today: string) {
  if (s.lastPracticedAt) return Math.max(0, daysBetween(isoDateJst(s.lastPracticedAt), today));
  if (s.nextReviewAt)
    return Math.max(0, daysBetween(isoDateJst(s.nextReviewAt), today) + Math.max(1, Math.round(s.intervalDays)));
  return Math.round(s.intervalDays);
}

/**
 * 想起確率の目安（FSRS の忘却曲線 R = (1 + t / 9S)^-1。t = S のとき 0.9）。
 * まだ正しく使えていない表現は S = 1 とみなす
 */
export function retrievability(s: SrsState, today: string) {
  return 1 / (1 + elapsedDays(s, today) / (9 * Math.max(1, s.intervalDays)));
}

/**
 * 同じ日に予定が集中しないよう、3日以上の間隔を ±15% ずらす。
 * 乱数ではなく id と回数から決めるので、同じ入力なら同じ結果になる
 */
const FUZZ = 0.15;
export function fuzz(days: number, id: number, salt: number) {
  if (days < 3) return Math.max(1, Math.round(days));
  const u = (((id * 2654435761 + salt * 40503) >>> 0) % 1000) / 1000;
  return Math.max(1, Math.round(days * (1 - FUZZ + 2 * FUZZ * u)));
}

const clampEase = (e: number) => Math.min(EASE.max, Math.max(EASE.min, e));

/** 1回の結果を反映した次の状態 */
export function schedule(s: SrsState, grade: Grade, today: string): SrsUpdate {
  const reps = effectiveReps(s);
  const base = { status: s.status, ease: s.ease, reps, lapses: s.lapses, lastPracticedAt: jstMidnight(today) };

  if (grade === "unused") {
    // 休み明けの苦手は数え直す（数えたままだと、戻るたびに1回で休みに入り、二度と普通の復習に戻らない）
    const misses = (isLeech(s) ? 0 : s.misses) + 1;
    const days = isLeech({ reps, misses }) ? LEECH_REST_DAYS : Math.min(MISS_MAX_DAYS, 2 ** (misses - 1));
    return { ...base, intervalDays: s.intervalDays, misses, nextReviewAt: dueOn(today, days) };
  }

  if (grade === "drill") {
    const interval = s.intervalDays > 0 ? s.intervalDays * DRILL_FACTOR : 1;
    return {
      ...base,
      intervalDays: Math.round(interval * 10) / 10,
      misses: 0,
      nextReviewAt: dueOn(today, fuzz(interval, s.id, s.lapses + reps)),
    };
  }

  if (grade === "incorrect") {
    return {
      ...base,
      status: "attempted",
      ease: clampEase(s.ease + EASE.incorrect),
      intervalDays: s.intervalDays > 0 ? Math.max(1, s.intervalDays * LAPSE_FACTOR) : 0,
      lapses: s.lapses + (reps > 0 ? 1 : 0),
      misses: 0,
      nextReviewAt: dueOn(today, 1),
    };
  }

  const spontaneous = grade === "spontaneous";
  const ease = clampEase(s.ease + (spontaneous ? EASE.spontaneous : 0));
  const elapsed = elapsedDays(s, today);
  let interval: number;
  if (s.intervalDays <= 0) interval = FIRST_INTERVAL[grade];
  else {
    // 予定より早く使えた場合は伸びを割り引く（間をあけて思い出せたほど記憶は強くなる）。
    // fuzz と日単位の丸めで早まった分（15% と半日）は割り引かない
    const onTime = Math.min(1, (elapsed + 0.5) / (s.intervalDays * (1 - FUZZ)));
    interval = s.intervalDays * (1 + (ease - 1) * onTime) * (spontaneous ? SPONTANEOUS_BONUS : 1);
  }
  const nextReps = reps + 1;
  const mastered =
    (nextReps >= MASTERY.reps && interval >= MASTERY.intervalDays) || (spontaneous && reps >= 1 && elapsed >= 2);
  return {
    ...base,
    status: mastered ? "mastered" : "correct",
    ease,
    intervalDays: Math.round(interval * 10) / 10,
    reps: nextReps,
    misses: 0,
    nextReviewAt: mastered ? null : dueOn(today, fuzz(interval, s.id, nextReps)),
  };
}

/** 1回の出題数。復習が多い日は新規を減らして合計を保つ */
export const LESSON_LOAD = 5;
const MAX_NEW = 4;

/**
 * 今日の復習と新規の枠。1つの表現を習得するには会話で4回前後の成功が要るので、新規を毎回4つ入れて
 * 復習を1枠に固定すると積み残しが増え続ける（旧方式のシミュレーションでは期限切れが1日4件ずつ増えた）。
 * 期限の来た表現（苦手を除く）の数に応じて復習を増やし、その分だけ新規の流入を絞る
 *   期限0: 新規4 / 1: 復習1+新規4 / 2〜3: 復習2+新規3 / 4〜7: 復習3+新規2 / 8〜11: 復習4+新規1 / 12〜: 復習5
 */
export function lessonSlots(dueCount: number) {
  const cap = dueCount >= 12 ? 5 : dueCount >= 8 ? 4 : dueCount >= 4 ? 3 : dueCount >= 2 ? 2 : 1;
  const reviews = Math.min(dueCount, cap);
  return { reviews, fresh: reviews ? Math.min(MAX_NEW, LESSON_LOAD - reviews) : MAX_NEW };
}

/**
 * 復習の優先度: 忘れかけている（想起確率が低い）ほど高い。今日のシナリオ・今週のカテゴリに合う表現は使う場面が
 * 作られやすいので 1.5 倍。使わずに終わることが続く表現は、枠を詰まらせないよう下げる。
 * ただし休み明けの苦手は、今度こそ使う場面を作るため 2 倍にする
 */
export function reviewPriority(s: SrsState, today: string, relevant: boolean) {
  const base = (1 - retrievability(s, today)) * (relevant ? 1.5 : 1);
  return isLeech(s) ? base * LEECH_BOOST : base / (1 + s.misses);
}
