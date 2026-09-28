import assert from "node:assert/strict";
import { test } from "node:test";
import { isoDateJst } from "./format";
import {
  elapsedDays,
  fuzz,
  isLeech,
  jstMidnight,
  lessonSlots,
  retrievability,
  reviewPriority,
  schedule,
  type Grade,
  type SrsState,
} from "./srs";

const fresh: SrsState = {
  id: 7,
  status: "new",
  intervalDays: 0,
  ease: 2.5,
  reps: 0,
  lapses: 0,
  misses: 0,
  lastPracticedAt: null,
  nextReviewAt: null,
};
const due = (u: { nextReviewAt: Date | null }) => (u.nextReviewAt ? isoDateJst(u.nextReviewAt) : null);

/** 予定日ちょうどに結果を積み重ねる */
function run(grades: Grade[], start = "2026-10-01") {
  let s = fresh;
  let day = start;
  for (const g of grades) {
    s = { ...s, ...schedule(s, g, day) };
    if (s.nextReviewAt) day = isoDateJst(s.nextReviewAt);
  }
  return s;
}

test("初めて正しく使えたら2日後、自発的なら4日後", () => {
  assert.equal(due(schedule(fresh, "correct", "2026-10-01")), "2026-10-03");
  assert.equal(due(schedule(fresh, "spontaneous", "2026-10-01")), "2026-10-05");
  const u = schedule(fresh, "correct", "2026-10-01");
  assert.equal(u.status, "correct");
  assert.equal(u.reps, 1);
});

test("期限は日本時間の 0:00（同じ日の中で出題が変わらない）", () => {
  const u = schedule(fresh, "correct", "2026-10-01");
  assert.equal(u.nextReviewAt!.toISOString(), "2026-10-02T15:00:00.000Z");
  assert.equal(u.lastPracticedAt!.getTime(), jstMidnight("2026-10-01").getTime());
});

test("予定どおり成功を重ねると ease 倍に伸び、4回目で習得（S≥21日・3回以上）", () => {
  const s3 = run(["correct", "correct", "correct"]);
  assert.equal(s3.status, "correct");
  assert.equal(s3.intervalDays, 12.5);
  const s4 = run(["correct", "correct", "correct", "correct"]);
  assert.equal(s4.status, "mastered");
  assert.equal(s4.nextReviewAt, null);
});

test("使わなかった: S は変えず 1→2→4日で出し直し、3回で苦手（2週間休ませる）", () => {
  const u1 = schedule(fresh, "unused", "2026-10-01");
  assert.equal(due(u1), "2026-10-02");
  assert.equal(u1.intervalDays, 0);
  assert.equal(u1.status, "new");
  const u2 = schedule({ ...fresh, ...u1 }, "unused", "2026-10-02");
  assert.equal(due(u2), "2026-10-04");
  const u3 = schedule({ ...fresh, ...u2 }, "unused", "2026-10-04");
  assert.ok(isLeech(u3));
  assert.equal(due(u3), "2026-10-18");
  // 一度でも使えた表現は苦手扱いにしない（出し直しは最大4日）
  const learned = { ...fresh, reps: 1, intervalDays: 5, misses: 2 };
  const u = schedule(learned, "unused", "2026-10-01");
  assert.equal(u.intervalDays, 5);
  assert.equal(due(u), "2026-10-05");
});

test("休み明けの苦手: 優先度を上げた普通の復習に戻り、使わなかった回数は数え直す", () => {
  const rested = {
    ...fresh,
    misses: 3,
    lastPracticedAt: jstMidnight("2026-10-01"),
    nextReviewAt: jstMidnight("2026-10-15"),
  };
  const plain = { ...rested, misses: 0 };
  assert.ok(reviewPriority(rested, "2026-10-15", false) > reviewPriority(plain, "2026-10-15", false));
  const u = schedule(rested, "unused", "2026-10-15");
  assert.equal(u.misses, 1);
  assert.ok(!isLeech(u));
  assert.equal(due(u), "2026-10-16");
  // また3回続けて使わなければ再び休ませる
  const u2 = schedule({ ...rested, ...u }, "unused", "2026-10-16");
  const u3 = schedule({ ...rested, ...u2 }, "unused", "2026-10-18");
  assert.ok(isLeech(u3));
  assert.equal(due(u3), "2026-11-01");
});

test("誤用: S を半分・ease を下げ、翌日に出し直す。使えていた表現なら lapse", () => {
  const learned = {
    ...fresh,
    status: "correct" as const,
    reps: 2,
    intervalDays: 10,
    lastPracticedAt: jstMidnight("2026-09-21"),
  };
  const u = schedule(learned, "incorrect", "2026-10-01");
  assert.equal(u.status, "attempted");
  assert.equal(u.intervalDays, 5);
  assert.equal(u.ease, 2.3);
  assert.equal(u.lapses, 1);
  assert.equal(due(u), "2026-10-02");
  assert.equal(schedule(fresh, "incorrect", "2026-10-01").lapses, 0);
});

test("自発的な使用: 一度正しく使えた表現を日をおいて使えたら習得。同じ日なら習得にしない", () => {
  const once = {
    ...fresh,
    status: "correct" as const,
    reps: 1,
    intervalDays: 2,
    lastPracticedAt: jstMidnight("2026-10-01"),
  };
  assert.equal(schedule(once, "spontaneous", "2026-10-04").status, "mastered");
  const sameDay = schedule(once, "spontaneous", "2026-10-01");
  assert.equal(sameDay.status, "correct");
  // 早すぎる成功は伸びを割り引く
  assert.ok(schedule(once, "correct", "2026-10-01").intervalDays < 3);
  assert.equal(schedule(once, "correct", "2026-10-03").intervalDays, 5);
});

test("ドリル: S を 1.5 倍・苦手を解除。習得の回数には数えない", () => {
  const leech = { ...fresh, misses: 3 };
  const u = schedule(leech, "drill", "2026-10-01");
  assert.equal(u.misses, 0);
  assert.equal(u.reps, 0);
  assert.equal(u.intervalDays, 1);
  assert.equal(due(u), "2026-10-02");
  assert.equal(schedule({ ...fresh, reps: 1, intervalDays: 4 }, "drill", "2026-10-01").intervalDays, 6);
});

test("以前の方式の行（reps 0 の correct・記録日なし）も扱える", () => {
  const legacy = { ...fresh, status: "correct" as const, intervalDays: 5, nextReviewAt: jstMidnight("2026-10-01") };
  assert.equal(elapsedDays(legacy, "2026-10-01"), 5);
  const u = schedule(legacy, "correct", "2026-10-01");
  assert.equal(u.reps, 2);
  assert.equal(u.intervalDays, 12.5);
});

test("fuzz は ±15% に収まり、決定的", () => {
  for (let id = 1; id < 300; id++) {
    const d = fuzz(20, id, 3);
    assert.ok(d >= 17 && d <= 23, `${d}`);
    assert.equal(d, fuzz(20, id, 3));
  }
  assert.equal(fuzz(2, 5, 1), 2);
  assert.equal(new Set(Array.from({ length: 50 }, (_, id) => fuzz(20, id, 1))).size, 7);
});

test("想起確率: S 日たつと 0.9、期限を過ぎた比率が大きいほど優先", () => {
  const s = { ...fresh, intervalDays: 10, lastPracticedAt: jstMidnight("2026-10-01") };
  assert.ok(Math.abs(retrievability(s, "2026-10-11") - 0.9) < 1e-9);
  const onTime = { ...fresh, intervalDays: 10, lastPracticedAt: jstMidnight("2026-09-21") };
  const late = { ...fresh, intervalDays: 2, lastPracticedAt: jstMidnight("2026-09-26") };
  assert.ok(reviewPriority(late, "2026-10-01", false) > reviewPriority(onTime, "2026-10-01", false));
  assert.ok(reviewPriority(onTime, "2026-10-01", true) > reviewPriority(onTime, "2026-10-01", false));
  assert.ok(reviewPriority({ ...late, misses: 2 }, "2026-10-01", false) < reviewPriority(late, "2026-10-01", false));
});

test("出題枠: 合計5つまで、復習が多いほど新規を減らす", () => {
  assert.deepEqual(lessonSlots(0), { reviews: 0, fresh: 4 });
  assert.deepEqual(lessonSlots(1), { reviews: 1, fresh: 4 });
  assert.deepEqual(lessonSlots(3), { reviews: 2, fresh: 3 });
  assert.deepEqual(lessonSlots(5), { reviews: 3, fresh: 2 });
  assert.deepEqual(lessonSlots(9), { reviews: 4, fresh: 1 });
  assert.deepEqual(lessonSlots(30), { reviews: 5, fresh: 0 });
});
