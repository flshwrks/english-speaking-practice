import assert from "node:assert/strict";
import { test } from "node:test";
import { buildInstructions, buildTranscriptionPrompt, withPreviousLine } from "./conversation-prompt";
import { SCENARIOS } from "./scenarios";

const profile = {
  id: 1,
  about: "University student interested in supply chains.",
  goals: "Hold my own in meetings.",
  interests: "",
  level: 5,
  programStart: "2026-09-01",
  weekOffset: 0,
  learnerModel: {
    portrait: "論理的",
    strengths: ["具体例"],
    weaknesses: ["文を言い切れない"],
    sounds: ["/r/"],
    sessions: 2,
  },
  updatedAt: new Date(),
};
const scenario = SCENARIOS.find((s) => s.id === "status-report")!;
const expressions = [{ text: "on track", scene: "進捗", kind: "word" as const }];

test("buildInstructions: 学習者モデル・前回の改善点を背景知識として入れ、表現は言わせない", () => {
  const p = buildInstructions({
    profile,
    scenario,
    expressions,
    focus: "reporting",
    patterns: ["冠詞の抜け"],
    homework: { title: "結論から話す", detail: "最初に結論" },
  });
  assert.match(p, /Background on this learner \(private\)/);
  assert.match(p, /文を言い切れない/);
  assert.match(p, /冠詞の抜け/);
  assert.match(p, /結論から話す/);
  assert.match(p, /Never say a target expression yourself/);
  assert.match(p, /"on track"/);
  assert.doesNotMatch(p, /\/r\//); // 苦手な音は会話には渡さない
});

test("buildInstructions: 学習者モデルがなければ背景の節を出さない", () => {
  const p = buildInstructions({ profile: { ...profile, learnerModel: null }, scenario, expressions, focus: "x" });
  assert.doesNotMatch(p, /Background on this learner/);
});

test("buildTranscriptionPrompt: 今日の表現を含めず、日本語のプロフィールは入れない", () => {
  const p = buildTranscriptionPrompt({ scenario, profile });
  assert.match(p, /The other speaker is Priya/);
  assert.match(p, /supply chains/);
  assert.doesNotMatch(p, /on track/);
  const ja = buildTranscriptionPrompt({ scenario, profile: { ...profile, about: "大学生です" } });
  assert.doesNotMatch(ja, /About the learner/);
  assert.match(withPreviousLine("P.", " How is it going? "), /just said: "How is it going\?"/);
  assert.equal(withPreviousLine("P.", " "), "P.");
});
