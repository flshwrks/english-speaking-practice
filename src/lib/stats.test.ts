import assert from "node:assert/strict";
import { test } from "node:test";
import { rankScenarios, scenarioMenu, speechSpeed, levelGuidance } from "./scenarios";
import { calendarWeeks, countByDay, summarizePractice } from "./stats";
import { mondayOf, syllabusPosition } from "./syllabus";

// 2026-10-01（木）23:30 JST = 14:30 UTC
const now = new Date("2026-10-01T14:30:00Z");

test("日付は日本時間で区切る（UTC では前日の朝7時台の練習も JST の当日）", () => {
  const byDay = countByDay([new Date("2026-09-30T22:30:00Z"), new Date("2026-09-30T14:59:00Z")]);
  assert.deepEqual(
    [...byDay],
    [
      ["2026-10-01", 1],
      ["2026-09-30", 1],
    ],
  );
});

test("連続日数: 今日まだ練習していなくても切れない。昨日も休めば 0", () => {
  const days = (ds: string[]) => new Map(ds.map((d) => [d, 1]));
  assert.equal(summarizePractice(days(["2026-09-29", "2026-09-30"]), now).streak, 2);
  assert.equal(summarizePractice(days(["2026-09-29", "2026-09-30", "2026-10-01"]), now).streak, 3);
  assert.equal(summarizePractice(days(["2026-09-28", "2026-09-29"]), now).streak, 0);
  assert.equal(summarizePractice(days(["2026-09-30"]), now).practicedToday, false);
});

test("今週は日本時間の月曜始まり", () => {
  const byDay = new Map([
    ["2026-09-27", 2], // 日曜 = 先週
    ["2026-09-28", 1], // 月曜
    ["2026-10-01", 2],
  ]);
  assert.equal(summarizePractice(byDay, now).thisWeek, 3);
  assert.equal(mondayOf("2026-09-27"), "2026-09-21");
  assert.equal(mondayOf("2026-09-28"), "2026-09-28");
  const cal = calendarWeeks(byDay, "2026-10-01", 2);
  assert.equal(cal[1][0]!.date, "2026-09-28");
  assert.equal(cal[1][4], null); // 金曜 = 未来
});

test("全体カリキュラムの週: 開始前は Week 1、繰り返しの分だけ遅れ、13週目で2周目", () => {
  const sch = { programStart: "2026-09-28", weekOffset: 0 };
  assert.equal(syllabusPosition(sch, "2026-09-20").week, 1);
  assert.equal(syllabusPosition(sch, "2026-10-05").week, 2);
  assert.equal(syllabusPosition({ ...sch, weekOffset: 1 }, "2026-10-05").week, 1);
  const w13 = syllabusPosition(sch, "2026-12-21");
  assert.deepEqual([w13.cycle, w13.week], [2, 1]);
});

test("おすすめのシナリオ: 直前と同じものを避け、苦手なカテゴリを含むものを優先。同じ日は同じ順", () => {
  const ids = ["status-report", "pushback", "negotiate"];
  assert.notEqual(
    rankScenarios(ids, { recentScenarioIds: ["status-report"], today: "2026-10-01" })[0],
    "status-report",
  );
  assert.equal(rankScenarios(ids, { weakCategories: ["negotiating"], today: "2026-10-01" })[0], "negotiate");
  assert.deepEqual(rankScenarios(ids, { today: "2026-10-01" }), rankScenarios(ids, { today: "2026-10-01" }));
  // 履歴がなければ日替わり
  const firsts = new Set(["2026-10-01", "2026-10-02", "2026-10-03"].map((d) => rankScenarios(ids, { today: d })[0]));
  assert.equal(firsts.size, 3);
  // 並べ替えたシナリオが画面の先頭（今日のおすすめ）になる
  const menu = scenarioMenu(3, ids, { recentScenarioIds: ["status-report"], today: "2026-10-01" });
  assert.ok(menu.recommended.has(menu.scenarios[0].id) && menu.scenarios[0].id !== "status-report");
  assert.equal(scenarioMenu(0, ids).scenarios[0].id, "diagnostic");
});

test("難易度は1段ごとに話し方か速さが変わる", () => {
  for (let l = 1; l < 10; l++) {
    assert.notEqual(levelGuidance(l), levelGuidance(l + 1));
    assert.ok(speechSpeed(l + 1) > speechSpeed(l));
  }
  assert.equal(speechSpeed(1), 0.8);
  assert.equal(speechSpeed(10), 1.115);
});
