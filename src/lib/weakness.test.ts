import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalPatternKey, ERROR_PATTERNS } from "./error-patterns";
import { weaknessPriorities, type PatternOccurrence } from "./weakness";

const occ = (key: string, sessionIndex: number, severity = 2, daysAgo = sessionIndex): PatternOccurrence => ({
  key,
  sessionIndex,
  severity,
  daysAgo,
});

test("カタログの key は重複しない。旧 key はカタログに寄せ、知らない key は other", () => {
  assert.equal(new Set(ERROR_PATTERNS.map((p) => p.key)).size, ERROR_PATTERNS.length);
  assert.equal(canonicalPatternKey("vague_verb_choice"), "vague_word_choice");
  assert.equal(canonicalPatternKey("article"), "article");
  assert.equal(canonicalPatternKey("something_new"), "other");
});

test("最近・重いミスほど優先度が高い", () => {
  const w = weaknessPriorities([occ("article", 0, 2, 0), occ("r_l", 0, 3, 0), occ("plural_s", 5, 2, 20)]);
  assert.deepEqual(
    w.map((x) => x.key),
    ["r_l", "article", "plural_s"],
  );
  assert.equal(w[0].priority, 2);
});

test("同じ回の件数は 3件で頭打ち。旧 key は合算される", () => {
  const w = weaknessPriorities([
    occ("article", 0, 2, 0),
    occ("article", 0, 2, 0),
    occ("article", 0, 2, 0),
    occ("article", 0, 2, 0),
    occ("vague_verb_choice", 0, 2, 0),
    occ("vague_word_choice", 0, 2, 0),
  ]);
  assert.equal(w.find((x) => x.key === "article")!.priority, 2);
  assert.equal(w.find((x) => x.key === "vague_word_choice")!.count, 2);
  assert.equal(
    w.find((x) => x.key === "other"),
    undefined,
  );
});

test("状態: 3セッション出なければ improving、6で resolved、空白のあと再発すれば reopened", () => {
  const w = weaknessPriorities([
    occ("article", 0),
    occ("plural_s", 3),
    occ("r_l", 6),
    occ("th_sound", 0),
    occ("th_sound", 8),
  ]);
  const state = (k: string) => w.find((x) => x.key === k)!.state;
  assert.equal(state("article"), "active");
  assert.equal(state("plural_s"), "improving");
  assert.equal(state("r_l"), "resolved");
  assert.equal(state("th_sound"), "reopened");
  assert.equal(w[w.length - 1].key, "r_l");
});

test("週次レビューで克服済みにした型は resolved。再発率は初出以降のセッションに対する割合", () => {
  const w = weaknessPriorities([occ("article", 0), occ("article", 3)], new Set(["article"]));
  assert.equal(w[0].state, "resolved");
  assert.equal(w[0].recurrenceRate, 0.5);
});
