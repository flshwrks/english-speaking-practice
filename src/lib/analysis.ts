import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { BatchItem } from "drizzle-orm/batch";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, t } from "@/db";
import type { LearnerModel, SessionMetrics } from "@/db/schema";
import { ERROR_MIN_SEVERITY, FEEDBACK_CATEGORIES } from "./categories";
import { PRICING, sessionCostUsd } from "./config";
import { KeyExpression, markMasteredQuery, practicedExpressions, recordUseQueries, sessionTargets } from "./expressions";
import { formatPhoneme, isWeakWord } from "./format";
import { getProfile, topErrorPatterns, updateProfileQuery } from "./lesson";
import { getScenario } from "./scenarios";

const LearnerModelSchema = z.object({
  portrait: z.string().describe("学習者像（日本語, 150字〜300字）: どんな話し手か、話し方の傾向・癖、伸びてきている点"),
  strengths: z.array(z.string()).describe("安定して見られる強み。最大6つ。短い日本語"),
  weaknesses: z.array(z.string()).describe("繰り返し見られる弱点（文法・語彙・構成・流暢さなど）。最大6つ。短い日本語"),
  sounds: z.array(z.string()).describe("苦手な音・語・リズム（例: /r/→/l/（problem, really）, 語末子音の脱落）。最大6つ"),
});

const AnalysisSchema = z.object({
  summary: z.string().describe("セッション全体の講評（日本語, 2〜3文）"),
  topPoints: z
    .array(z.object({ title: z.string(), detail: z.string() }))
    .describe("今回最も重要な改善点。最大3つ。日本語"),
  items: z.array(
    z.object({
      seq: z.number().int().describe("該当する学習者発話の番号 U<n> の n"),
      // 構造化出力でも enum・数値範囲は強制されないため、想定外の値は既定値に置き換える
      category: z.enum(FEEDBACK_CATEGORIES).catch("naturalness"),
      original: z.string().describe("学習者の実際の発話（該当部分）"),
      improved: z.string().describe("ネイティブが自然に言う形"),
      explanation: z.string().describe("なぜそう言うのかの解説（日本語）"),
      severity: z
        .number()
        .int()
        .min(1)
        .max(3)
        .catch(2)
        .describe("3=意味が通じない/誤解を招く, 2=明確な誤り, 1=誤りではないが、より的確・自然な言い方がある（言い換えの提案）"),
      patternKey: z.string().describe("ミスの型の snake_case キー。既存キーに当てはまるなら必ずそれを使う"),
      patternLabel: z.string().describe("ミスの型の短い日本語ラベル"),
      keyExpression: KeyExpression.nullable().describe(
        "improved から取り出した、覚える価値のある表現。発音・抑揚の指摘や、覚える価値のないものは null",
      ),
    }),
  ),
  targetExpressions: z.array(
    z.object({
      id: z.number().int(),
      used: z.boolean(),
      correct: z.boolean().describe("意味・文法・場面が適切だったか。未使用なら false"),
      comment: z.string().describe("使い方への短いコメント（日本語）"),
    }),
  ),
  spontaneousExpressionIds: z
    .array(z.number().int())
    .describe("復習リストの表現のうち、学習者が自発的に正しく使ったものの id"),
  suggestedExpressions: z
    .array(
      KeyExpression.extend({
        example: z.string(),
        scene: z.string().describe("使う場面（日本語）"),
      }),
    )
    .describe("この会話の流れで使えると良かった、覚える価値の高い表現（items の keyExpression と重複しないもの）。フレーズと単語・熟語を合わせて最大6つ"),
  estimatedCefr: z.enum(["A2", "B1", "B2", "C1", "C2"]).catch("B1"),
  levelAdjustment: z
    .enum(["up", "keep", "down"])
    .catch("keep")
    .describe("AI の会話難易度を次回どうするか。余裕があれば up、苦戦していれば down"),
  // 形が崩れていても分析全体は捨てず、学習者モデルの更新だけ見送る
  learnerModel: LearnerModelSchema.nullable()
    .catch(null)
    .describe("今回の会話を踏まえて更新した学習者モデル（全体を書き直して返す）"),
});

export type Analysis = z.infer<typeof AnalysisSchema>;

const SYSTEM = `You are an expert English speaking coach for Japanese business professionals, with the ear of an educated native speaker (General American).
You review a transcript of a spoken role-play between the learner and an AI partner, plus automatic pronunciation assessment data, and give feedback.

Principles:
- Judge the learner's lines as spoken business English, not written English. Don't nitpick things natives say in speech.
- Cover grammar, collocation, vocabulary choice, naturalness (how a native would phrase it), and register (politeness/tone for the situation).
- For pronunciation and prosody, rely on the assessment data (low-scoring words, weak phonemes with what they sounded like, prosody errors). Explain the likely cause for a Japanese speaker (e.g. vowel insertion, /r/-/l/, /θ/→/s/, flat intonation, syllable-timed rhythm) and a concrete tip. Don't invent pronunciation errors not supported by the data.
- The "Azure heard" text reflects what was actually pronounced more faithfully than the realtime transcript; use it to catch dropped articles, plurals, or endings.
- When a transcribed word does not fit the context (e.g. "I want to rice my hand"), the learner most likely said a different word that was misheard. Infer the intended word from context and give a pronunciation item: which word was intended, what it sounded like, and why (e.g. /r/ vs /l/, missing final consonant, vowel insertion), with a concrete tip. Do not give grammar or vocabulary feedback on words that were merely misheard.
- Prioritize: pick at most 3 top points that would most improve the learner's communication.
- Beyond errors, actively suggest upgrades (severity 1): where the learner's sentence was understandable but an educated native speaker would use a more precise word, a stronger collocation, or a more natural business phrase, show that version (e.g. "strong manufacturing" → "strong manufacturing capabilities", "do business in overseas" → "expand overseas"). Aim for at least one upgrade per substantive learner turn, and more for longer turns; skip filler turns and do not nitpick style.
- keyExpression is what the learner should add to their vocabulary list, so it must be reusable in other conversations:
  - Good: collocations and phrasal verbs ("manufacturing capabilities", "expand overseas", "be vulnerable to", "iron out"), and sentence frames ("What I'm getting at is...", "The main reason is that...").
  - For grammar fixes, give the reusable pattern only if there is one ("be interested in ~ing"); for trivial fixes such as a missing article or subject-verb agreement, set keyExpression to null.
  - kind: "word" for single words, phrasal verbs, idioms and collocations (usually 1-4 words); "phrase" for sentence-level frames.
  - category: pick the business situation where it is most useful; use "general" only when none fits.
- Reuse existing pattern keys when the same kind of mistake recurs, so progress can be tracked.
- All explanations must be in natural Japanese. English examples stay in English.

Learner model:
- You may be given a learner model built from earlier sessions (portrait, strengths, weaknesses, weak sounds). Treat it as background knowledge about this person, like a coach who remembers them: when choosing top points and writing explanations, weigh habits that keep recurring, connect a mistake to their known tendency when that helps them understand it, and notice genuine improvement. Do not mention the model or say things like "your profile says"; just let it shape the feedback naturally.
- Then return an updated learnerModel that merges this session's evidence into it: keep traits that still hold, revise or drop ones this session clearly contradicts, add new ones only when well supported (a single slip is not a weakness). Base sounds only on the pronunciation data. If there is no model yet, build the first one from this session.`;

type Utterance = typeof t.utterances.$inferSelect;

function describeUtterance(u: Utterance | undefined) {
  if (!u || u.accuracy === null) return "";
  const weak = u.words
    .filter(isWeakWord)
    .slice(0, 8)
    .map((w) => {
      const ph = w.weakPhonemes.map((p) => `${formatPhoneme(p)}(${Math.round(p.score)})`).join(" ");
      return `${w.word}[${Math.round(w.accuracy)}${ph ? ` ${ph}` : ""}${
        w.prosodyErrors.length ? ` prosody:${w.prosodyErrors.join("/")}` : ""
      }]`;
    });
  return `\n   Azure heard: "${u.heard}"\n   Scores: accuracy ${u.accuracy}, fluency ${u.fluency}, prosody ${u.prosody}${
    weak.length ? `\n   Weak words: ${weak.join(", ")}` : ""
  }`;
}

function describeModel(m: LearnerModel) {
  const list = (items: string[]) => (items.length ? items.map((x) => `- ${x}`).join("\n") : "- (none)");
  return `Portrait: ${m.portrait}
Strengths:
${list(m.strengths)}
Weaknesses:
${list(m.weaknesses)}
Weak sounds:
${list(m.sounds)}`;
}

/** 分析結果の学習者モデルを保存用の形に（各リストは最大6つ） */
function toLearnerModel(m: z.infer<typeof LearnerModelSchema>, sessions: number): LearnerModel {
  return {
    portrait: m.portrait,
    strengths: m.strengths.slice(0, 6),
    weaknesses: m.weaknesses.slice(0, 6),
    sounds: m.sounds.slice(0, 6),
    sessions,
  };
}

export async function analyzeSession(sessionId: number) {
  const d = db();
  const [[session], profile, utterances, targets, patterns, practiced] = await Promise.all([
    d.select().from(t.sessions).where(eq(t.sessions.id, sessionId)),
    getProfile(),
    d.select().from(t.utterances).where(eq(t.utterances.sessionId, sessionId)),
    sessionTargets([sessionId]),
    topErrorPatterns(30),
    practicedExpressions(sessionId),
  ]);
  const model = profile.learnerModel;
  if (!session) throw new Error("session not found");
  const byseq = new Map(utterances.map((u) => [u.seq, u]));
  const scenario = getScenario(session.scenarioId);

  const transcript = session.turns
    .map((turn) =>
      turn.role === "assistant"
        ? `AI: ${turn.text}`
        : `U${turn.seq}: ${turn.text}${describeUtterance(byseq.get(turn.seq!))}`,
    )
    .join("\n");

  const userText = `# Scenario
${scenario?.title ?? session.scenarioId}: ${scenario?.role ?? ""}

# Learner profile
${profile.about || "(none)"}
Current conversation difficulty: ${session.level}/10

# Learner model (built from ${model?.sessions ?? 0} earlier sessions; background knowledge)
${model ? describeModel(model) : "(none yet)"}

# Existing mistake pattern keys
${patterns.map((p) => `- ${p.key}: ${p.label} (${p.count}x)`).join("\n") || "(none yet)"}

# Target expressions for this session (judge whether the learner used them)
${targets.map((x) => `- id ${x.id}: "${x.text}"`).join("\n") || "(none)"}

# Previously practiced expressions (detect spontaneous correct use)
${practiced.map((x) => `- id ${x.id}: "${x.text}"`).join("\n") || "(none)"}

# Transcript
${transcript}`;

  const response = await new Anthropic().messages.parse({
    model: PRICING.claude.model,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: zodOutputFormat(AnalysisSchema) },
    system: SYSTEM,
    messages: [{ role: "user", content: userText }],
  });
  if (response.stop_reason === "refusal") throw new Error("分析が拒否されました");
  const a = response.parsed_output;
  if (!a) throw new Error(`分析結果を解析できませんでした (stop_reason: ${response.stop_reason})`);

  // --- 保存: 1つのトランザクションにまとめ、途中で失敗しても半端に反映されないようにする ---
  const usage = {
    realtimeUsd: session.usage?.realtimeUsd ?? 0,
    azureSeconds: session.usage?.azureSeconds ?? 0,
    claudeInputTokens: response.usage.input_tokens,
    claudeOutputTokens: response.usage.output_tokens,
  };
  const targetById = new Map(targets.map((x) => [x.id, x]));
  const practicedIds = new Set(practiced.map((p) => p.id));
  const spontaneous = a.spontaneousExpressionIds.filter((id) => practicedIds.has(id));
  // ミスの型として数えるのは明確な誤り（重大度2以上）だけ。言い換えの提案は数えない
  const patternsByKey = new Map(a.items.filter((i) => i.severity >= ERROR_MIN_SEVERITY).map((i) => [i.patternKey, i]));
  const levelDelta = { up: 1, keep: 0, down: -1 }[a.levelAdjustment];

  const writes: BatchItem<"pg">[] = [];
  if (a.items.length) {
    writes.push(
      d.insert(t.feedbackItems).values(
        a.items.map((i) => ({
          sessionId,
          seq: i.seq,
          category: i.category,
          original: i.original,
          improved: i.improved,
          explanation: i.explanation,
          severity: i.severity,
          patternKey: i.patternKey,
          keyExpression: i.keyExpression,
        })),
      ),
    );
  }
  if (patternsByKey.size) {
    writes.push(
      d
        .insert(t.errorPatterns)
        .values([...patternsByKey].map(([key, i]) => ({ key, label: i.patternLabel, category: i.category, count: 1 })))
        .onConflictDoUpdate({
          target: t.errorPatterns.key,
          set: { count: sql`${t.errorPatterns.count} + 1`, lastSeenAt: sql`now()`, resolved: false },
        }),
    );
  }
  for (const r of a.targetExpressions) {
    const target = targetById.get(r.id);
    if (target) writes.push(...recordUseQueries(sessionId, target, r));
  }
  if (spontaneous.length) writes.push(markMasteredQuery(spontaneous));
  if (a.suggestedExpressions.length) {
    writes.push(
      d
        .insert(t.expressions)
        .values(a.suggestedExpressions.map((e) => ({ ...e, source: "feedback", status: "suggested" as const })))
        .onConflictDoNothing(),
    );
  }
  if (levelDelta || a.learnerModel) {
    writes.push(
      updateProfileQuery({
        ...(levelDelta ? { level: profile.level + levelDelta } : {}),
        ...(a.learnerModel ? { learnerModel: toLearnerModel(a.learnerModel, (model?.sessions ?? 0) + 1) } : {}),
      }),
    );
  }

  await d.batch([
    d
      .update(t.sessions)
      .set({
        status: "done",
        summary: a.summary,
        topPoints: a.topPoints.slice(0, 3),
        metrics: computeMetrics(utterances, session.turns, a),
        usage,
        costUsd: sessionCostUsd(usage),
        error: null,
      })
      .where(eq(t.sessions.id, sessionId)),
    ...writes,
  ]);
}

/** 分析を実行し、失敗したらセッションをエラー状態にする（after() から呼ぶ） */
export async function runAnalysis(sessionId: number) {
  try {
    await analyzeSession(sessionId);
  } catch (e) {
    console.error("analysis failed", e);
    await db()
      .update(t.sessions)
      .set({ status: "error", error: e instanceof Error ? e.message : String(e) })
      .where(eq(t.sessions.id, sessionId));
  }
}

function computeMetrics(
  utterances: Utterance[],
  turns: { role: string; text: string }[],
  a: Analysis,
): SessionMetrics {
  const words = turns
    .filter((x) => x.role === "user")
    .flatMap((x) => x.text.toLowerCase().match(/[a-z']+/g) ?? []);
  const speakingSec = utterances.reduce((s, u) => s + u.durationMs, 0) / 1000;
  const scored = utterances.filter((u) => u.accuracy !== null);
  const avg = (key: "accuracy" | "fluency" | "prosody" | "pron") => {
    const vals = scored.map((u) => u[key]).filter((v): v is number => v !== null);
    return vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10 : null;
  };
  return {
    userWords: words.length,
    speakingSec: Math.round(speakingSec),
    wpm: speakingSec > 0 ? Math.round(words.length / (speakingSec / 60)) : 0,
    lexicalDiversity: words.length ? Math.round((new Set(words).size / words.length) * 100) / 100 : 0,
    errorsPer100Words: words.length
      ? Math.round((a.items.filter((i) => i.severity >= ERROR_MIN_SEVERITY).length / words.length) * 1000) / 10
      : 0,
    accuracy: avg("accuracy"),
    fluency: avg("fluency"),
    prosody: avg("prosody"),
    pron: avg("pron"),
    estimatedCefr: a.estimatedCefr,
  };
}
