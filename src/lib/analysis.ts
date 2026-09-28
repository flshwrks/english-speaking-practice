/**
 * 会話後の分析。入力の組み立て（buildAnalysisInput）→ 分析 AI の呼び出し（callAnalysisModel）→
 * 決定的な後処理と指標の計算（finalizeAnalysis）→ 保存（persistAnalysis）の4段に分ける。
 * 保存以外は DB に書かないので、scripts/analysis-dryrun.ts で本番データを使って試せる。
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { BatchItem } from "drizzle-orm/batch";
import { and, count, desc, eq, gte, inArray, lt, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db, t } from "@/db";
import type { Homework, LearnerModel, SessionMetrics, Usage } from "@/db/schema";
import { decideLevel } from "./adaptivity";
import { ERROR_MIN_SEVERITY, FEEDBACK_CATEGORIES } from "./categories";
import { PRICING, sessionCostUsd } from "./config";
import { canonicalPatternKey, ERROR_PATTERN_KEYS, ERROR_PATTERNS, errorPattern } from "./error-patterns";
import {
  KeyExpression,
  practicedExpressions,
  recordSpontaneousQueries,
  recordTargetsQueries,
  sessionTargets,
} from "./expressions";
import { formatPhoneme, isWeakWord } from "./format";
import { getProfile, updateProfileQuery } from "./lesson";
import { computeMetrics, delivery, isEcho, tokenize, weakSounds, type ErrorCount, type WeakSound } from "./metrics";
import { getScenario } from "./scenarios";

const LearnerModelSchema = z.object({
  portrait: z.string().describe("学習者像（日本語, 150字〜300字）: どんな話し手か、話し方の傾向・癖、伸びてきている点"),
  strengths: z.array(z.string()).describe("安定して見られる強み。最大6つ。短い日本語"),
  weaknesses: z.array(z.string()).describe("繰り返し見られる弱点（文法・語彙・構成・流暢さなど）。最大6つ。短い日本語"),
  sounds: z
    .array(z.string())
    .describe("苦手な音・語・リズム（例: /r/→/l/（problem, really）, 語末子音の脱落）。最大6つ"),
});

// 構造化出力でも enum・数値範囲は強制されないため、想定外の値は .catch() で既定値に置き換える
const countField = z.number().int().catch(0);

const AnalysisSchema = z.object({
  summary: z.string().describe("セッション全体の講評（日本語, 2〜3文）"),
  topPoints: z
    .array(z.object({ title: z.string(), detail: z.string() }))
    .describe(
      "今回最も重要な改善点。最大3つ。日本語。1つ目は次回の会話で意識する「宿題」になるので、次の1回で試せる具体的なものにする",
    ),
  items: z.array(
    z.object({
      seq: z.number().int().describe("該当する学習者発話の番号 U<n> の n"),
      category: z.enum(FEEDBACK_CATEGORIES).catch("naturalness"),
      original: z.string().describe("学習者の実際の発話（該当部分）"),
      improved: z.string().describe("ネイティブが自然に言う形"),
      explanation: z.string().describe("なぜそう言うのかの解説（日本語）"),
      severity: z.number().int().min(1).max(3).catch(2).describe("重大度（system の基準に従う）"),
      patternKey: z
        .enum(ERROR_PATTERN_KEYS)
        .catch("other")
        .describe("ミスの型。カタログの key から選ぶ。当てはまらなければ other"),
      keyExpression: KeyExpression.nullable().describe(
        "improved から取り出した、覚える価値のある表現。発音・抑揚の指摘や、覚える価値のないものは null",
      ),
    }),
  ),
  utteranceErrors: z
    .array(
      z.object({
        seq: z.number().int(),
        clauses: countField.describe("節（述語を持つまとまり）の数。言いさしの断片も1と数える"),
        errorFreeClauses: countField.describe("文法・語彙・コロケーションの誤りを含まない節の数"),
        errors: countField.describe(
          "文法・語彙・コロケーションの誤りの総数（items に選ばなかったものも含めて漏れなく）",
        ),
      }),
    )
    .describe(
      "話した内容のある学習者発話すべてについての誤りの集計。発音・抑揚、つなぎ語、言い直して自分で直せたものは数えない",
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
    .describe(
      "この会話の流れで使えると良かった、覚える価値の高い表現（items の keyExpression と重複しないもの）。フレーズと単語・熟語を合わせて最大6つ",
    ),
  homework: z
    .object({
      applied: z.boolean(),
      comment: z.string().describe("判定の根拠。どの発話で生かせた/生かせなかったか（日本語, 1〜2文）"),
    })
    .nullable()
    .catch(null)
    .describe("前回の宿題を生かせたか。宿題がなければ null"),
  estimatedCefr: z.enum(["A2", "B1", "B2", "C1", "C2"]).catch("B1"),
  levelAdjustment: z
    .enum(["up", "keep", "down"])
    .catch("keep")
    .describe("AI の会話難易度を次回どうするか（system の基準に従う）"),
  // 形が崩れていても分析全体は捨てず、学習者モデルの更新だけ見送る
  learnerModel: LearnerModelSchema.nullable()
    .catch(null)
    .describe("今回の会話を踏まえて更新した学習者モデル（全体を書き直して返す）"),
});

export type Analysis = z.infer<typeof AnalysisSchema>;

const SYSTEM = `You are an expert English speaking coach for Japanese business professionals, with the ear of an educated native speaker (General American).
You review a transcript of a spoken role-play between the learner and an AI partner, plus automatic pronunciation assessment data (Azure) and measured delivery statistics, and give feedback.

Reading the data:
- Each learner turn U<n> is the realtime transcript. It tends to clean up speech, and it sometimes drops the end of a long turn or turns background noise into non-English text (e.g. "아", "啊"). Ignore empty or non-English noise turns.
- "Azure heard" (shown only when it differs) is a second recognizer that keeps what was actually pronounced: repetitions, "uh", dropped articles, plurals and endings. Use it to catch real grammar slips and to see what the learner said when the transcript is cut short. Words at the very start or end of Azure heard that are not in the transcript may be noise or the AI's voice; do not treat them as the learner's errors. If a learner turn repeats the AI's previous line almost word for word, the microphone probably picked up the AI; skip that turn entirely (no items, no error counts).
- When a transcribed word does not fit the context (e.g. "I want to rice my hand"), the learner most likely said another word that was misheard. Infer the intended word and, if it matters, give a pronunciation item (which word was intended, what it sounded like and why). Never give grammar or vocabulary feedback on words that were merely misheard.

Severity (be consistent across sessions):
- 3: a listener would likely misunderstand or fail to understand (wrong word that changes the meaning, an unintelligible key word, a sentence whose point is lost).
- 2: a clear error an educated listener notices, though the meaning gets through (tense, agreement, article or plural that matters, verb pattern, preposition, wrong collocation or word, a register slip that sounds rude or odd).
- 1: not an error, but an educated native speaker would use a more precise word, a stronger collocation or a more natural business phrase (an upgrade).

What not to flag: fillers, repetitions and restarts (they are measured separately), mid-sentence self-corrections the learner fixed, fragments that are natural answers in conversation ("Two or three times a week."), contractions, starting with "And/So", casual wording that fits the scene, and anything that is fine in educated spoken English even if a style guide would object. Do not mark a sentence as unfinished when Azure heard shows the learner went on.

Choosing items:
- Cover grammar, collocation, vocabulary, naturalness and register. One item per stretch of speech: if one sentence has several problems, give a single item with the fully corrected version and explain each fix briefly. Items must not overlap or repeat each other.
- If the same kind of mistake recurs, give it at most twice and say in the explanation that it recurred; the full count goes in utteranceErrors.
- Actively suggest upgrades (severity 1) where they teach something reusable, e.g. "strong manufacturing" → "strong manufacturing capabilities", "do business in overseas" → "expand overseas". Skip turns that are already natural.
- Keep the list focused: about 8-14 items in total for a 15-minute session, chosen by how much each would improve the learner's communication. Everything you leave out is still counted in utteranceErrors.
- Order items by U<n>.

Pronunciation and prosody:
- Base them only on the Azure data: weak words (score, error type, phonemes scoring under 60 with what they sounded like, e.g. /ɹ/→/l/(38)) and the weak-sound summaries. Explain the likely cause for a Japanese speaker (vowel insertion, /r/-/l/, /θ/→/s/, dropped final consonant, syllable-timed rhythm) and give one concrete tip. Cite the phoneme data in the explanation when it exists.
- Pick content words that matter or that recur across the session; ignore reduced function words ("and" as /n/, "to" as /tə/ is natural). At most 3 pronunciation items.
- Azure marks "monotone" on nearly every word of a flat utterance, so treat intonation at the utterance level: at most 1 prosody item, on the utterance where it hurt the message most, saying which words to stress and where the pitch should rise or fall. Do not make intonation a top point in every session; choose it only when it is clearly the learner's biggest barrier this time.

Counting errors (utteranceErrors): for every learner turn with real content, count clauses, error-free clauses and all grammar/vocabulary/collocation errors, including ones you did not choose as items. Do not count pronunciation, prosody, fillers, repetitions or self-corrected slips. Be exhaustive and consistent; this is how the learner's accuracy is tracked over time.

Top points: at most 3, the changes that would most improve the learner's communication. The first becomes next session's "homework", so make it concrete enough to try in one conversation (e.g. "結論から話す: まず 'The main point is...' と言ってから理由を足す").

Homework: if last session's homework is given, judge whether the learner applied it in this conversation, citing the turn(s). Applied means it was used correctly at least once where it was relevant; if it never had a chance to come up, say so and set applied to false. If no homework is given, return null.

Target expressions: mark used only with clear evidence in the learner's own words (consistent with Azure heard when available). A near miss that changes the expression counts as used but not correct. The AI partner saying it does not count.

keyExpression is what the learner should add to their vocabulary list, so it must be reusable in other conversations:
- Good: collocations and phrasal verbs ("manufacturing capabilities", "expand overseas", "be vulnerable to", "iron out"), and sentence frames ("What I'm getting at is...", "The main reason is that...").
- For grammar fixes, give the reusable pattern only if there is one ("be interested in ~ing"); for trivial fixes such as a missing article or subject-verb agreement, set keyExpression to null.
- kind: "word" for single words, phrasal verbs, idioms and collocations (usually 1-4 words); "phrase" for sentence-level frames.
- category: pick the business situation where it is most useful; use "general" only when none fits.
suggestedExpressions must not repeat any keyExpression.

patternKey: choose from the mistake-pattern catalogue; use "other" only when nothing fits. Upgrades (severity 1) also get the closest key.

estimatedCefr: judge the learner's spoken performance in this conversation against CEFR descriptors for range, accuracy, fluency, coherence and interaction. Do not let misrecognized words lower the grammar judgment. The app combines your label with measured statistics and earlier sessions.

levelAdjustment (difficulty of the AI partner next time): "up" if the learner handled the AI's questions easily, with long, coherent turns and few severity 2-3 errors; "down" if they often could not answer, gave very short turns, or had frequent severity 3 errors; otherwise "keep".

Learner model:
- You may be given a learner model built from earlier sessions (portrait, strengths, weaknesses, weak sounds). Treat it as quiet background knowledge, like a coach who remembers this person: weigh habits that keep recurring when choosing top points, connect a mistake to their known tendency when that helps, and notice genuine improvement. Never mention the model or say things like "your profile says".
- Then return an updated learnerModel that merges this session's evidence: keep traits that still hold, revise or drop ones this session contradicts, add new ones only when well supported (a single slip is not a weakness). Base sounds on the weak-sound summaries (counts across sessions) and clear misrecognitions, not on single low scores. If there is no model yet, build the first one from this session.

All explanations must be in natural Japanese. English examples stay in English.`;

type Utterance = typeof t.utterances.$inferSelect;
type TopPoint = { title: string; detail: string };

const pct = (x: number) => `${Math.round(x * 100)}%`;

function describeUtterance(u: Utterance | undefined, transcript: string) {
  if (!u || u.accuracy === null) return "";
  const heard = tokenize(u.heard).join(" ");
  const monotone = u.words.filter((w) => w.prosodyErrors.includes("Monotone")).length;
  const weak = u.words
    .filter(isWeakWord)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 5)
    .map((w) => {
      const ph = [...w.weakPhonemes]
        .sort((a, b) => a.score - b.score)
        .slice(0, 4)
        .map((p) => `${formatPhoneme(p)}(${Math.round(p.score)})`);
      const tags = [
        ...(w.errorType !== "None" ? [w.errorType] : []),
        ...w.prosodyErrors.filter((e) => e !== "Monotone"),
      ];
      return `${w.word}[${Math.round(w.accuracy)}${ph.length ? ` ${ph.join(" ")}` : ""}${tags.length ? ` ${tags.join("/")}` : ""}]`;
    });
  return `${heard && heard !== tokenize(transcript).join(" ") ? `\n   Azure heard: "${u.heard}"` : ""}
   Azure: accuracy ${u.accuracy}, fluency ${u.fluency}, prosody ${u.prosody}${
     monotone && u.words.length ? `, monotone on ${pct(monotone / u.words.length)} of words` : ""
   }${weak.length ? `\n   Weak words: ${weak.join(", ")}` : ""}`;
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

function describeSounds(sounds: WeakSound[]) {
  return sounds.length
    ? sounds
        .map(
          (s) =>
            `- /${s.phoneme}/: clearly off ${s.clear}x (weak ${s.count}x)${s.heardAs.length ? `, heard as ${s.heardAs.map((h) => `/${h}/`).join(" ")}` : ""}; e.g. ${s.examples.join(", ")}`,
        )
        .join("\n")
    : "- (none)";
}

/** 分析 AI に渡す実測値。数値の意味を添えて、講評の根拠に使えるようにする */
function describeDelivery(d: ReturnType<typeof delivery>, utterances: Utterance[]) {
  const lines = [
    d.wpm > 0
      ? `- Speech rate: ${d.wpm} words/min (fillers and repetitions removed; natives in conversation ~150)`
      : "- Speech rate: not measured",
    d.articulationWpm !== undefined &&
      `- Articulation rate (pauses removed): ${d.articulationWpm} words/min; pauses of 250ms+: ${d.pausesPerMin}/min; mean words between pauses: ${d.meanLengthOfRun}`,
    `- Mean words per turn: ${d.meanUtteranceWords}; fillers (uh/um): ${d.fillersPer100Words}/100 words; repetitions/restarts: ${d.repetitionsPer100Words}/100 words`,
    d.medianLatencyMs !== undefined &&
      `- Time to start answering after the AI stops: median ${(d.medianLatencyMs / 1000).toFixed(1)}s; 3s or longer in ${pct(d.longLatencyRate!)} of turns`,
  ];
  const words = utterances.flatMap((u) => u.words);
  const monotone = words.filter((w) => w.prosodyErrors.includes("Monotone")).length;
  if (words.length) lines.push(`- Words Azure marked monotone: ${pct(monotone / words.length)}`);
  return lines.filter(Boolean).join("\n");
}

/** 分析に必要なデータを読み、分析 AI への入力文を組み立てる（DB には書かない） */
export async function buildAnalysisInput(sessionId: number) {
  const d = db();
  const earlier = and(eq(t.sessions.status, "done"), lt(t.sessions.id, sessionId));
  const [[session], profile, allUtterances, targets, patterns, practiced, recent, pastWords] = await Promise.all([
    d
      .select({
        id: t.sessions.id,
        scenarioId: t.sessions.scenarioId,
        level: t.sessions.level,
        turns: t.sessions.turns,
        usage: t.sessions.usage,
        status: t.sessions.status,
        analysisStartedAt: t.sessions.analysisStartedAt,
        homeworkGiven: t.sessions.homeworkGiven,
        card: t.scenarioCards.card,
      })
      .from(t.sessions)
      .leftJoin(t.scenarioCards, eq(t.scenarioCards.id, t.sessions.cardId))
      .where(eq(t.sessions.id, sessionId)),
    getProfile(),
    d.select().from(t.utterances).where(eq(t.utterances.sessionId, sessionId)),
    sessionTargets([sessionId]),
    // ミスの型ごとの過去の回数（明確な誤りのみ。この会話の分は再分析で二重に数えないよう除く）
    d
      .select({ key: t.feedbackItems.patternKey, n: count() })
      .from(t.feedbackItems)
      .where(and(gte(t.feedbackItems.severity, ERROR_MIN_SEVERITY), ne(t.feedbackItems.sessionId, sessionId)))
      .groupBy(t.feedbackItems.patternKey),
    practicedExpressions(sessionId),
    // 前回までの会話（新しい順）: CEFR の中央値・難易度の判定・宿題に使う
    d
      .select({
        id: t.sessions.id,
        level: t.sessions.level,
        metrics: t.sessions.metrics,
        topPoints: t.sessions.topPoints,
      })
      .from(t.sessions)
      .where(earlier)
      .orderBy(desc(t.sessions.startedAt))
      .limit(6),
    // 直近5回の発音データ: 苦手な音の集計に使う
    d
      .select({ words: t.utterances.words })
      .from(t.utterances)
      .where(
        inArray(
          t.utterances.sessionId,
          d.select({ id: t.sessions.id }).from(t.sessions).where(earlier).orderBy(desc(t.sessions.startedAt)).limit(5),
        ),
      ),
  ]);
  if (!session) throw new Error("session not found");
  const model = profile.learnerModel;
  const scenario = getScenario(session.scenarioId);
  // 宿題は会話の開始時に実際に渡したもの。記録のない古い会話は前回の最重要ポイント
  const homework: TopPoint | null = session.homeworkGiven ?? recent[0]?.topPoints?.[0] ?? null;
  // AI の声を拾っただけの発話は、添削にも指標にも使わない
  const heardBySeq = new Map(allUtterances.map((u) => [u.seq, u.heard]));
  const echoes = new Set<number>();
  session.turns.forEach((turn, i) => {
    const prev = session.turns[i - 1];
    if (
      turn.role === "user" &&
      prev?.role === "assistant" &&
      isEcho({ ...turn, heard: heardBySeq.get(turn.seq!) }, prev.text)
    )
      echoes.add(turn.seq!);
  });
  const userTurns = session.turns.filter((x) => x.role === "user" && !echoes.has(x.seq!));
  const utterances = allUtterances.filter((u) => !echoes.has(u.seq));
  const byseq = new Map(utterances.map((u) => [u.seq, u]));
  const thisWords = utterances.flatMap((u) => u.words);

  // ミスの型のカタログ。過去の回数（カタログ導入前の key も寄せて数える）を添える
  const counts = new Map<string, number>();
  for (const p of patterns) {
    const key = canonicalPatternKey(p.key);
    counts.set(key, (counts.get(key) ?? 0) + p.n);
  }
  const catalogue = ERROR_PATTERNS.map(
    (p) => `- ${p.key} (${p.category}): ${p.label}${counts.get(p.key) ? ` — seen ${counts.get(p.key)}x before` : ""}`,
  ).join("\n");

  const transcript = session.turns
    .filter((turn) => turn.role === "assistant" || turn.text.trim() || byseq.get(turn.seq!)?.heard)
    .map((turn) =>
      turn.role === "assistant"
        ? `AI: ${turn.text}`
        : echoes.has(turn.seq!)
          ? `U${turn.seq} (probably the AI's voice picked up by the microphone; ignore): ${turn.text}`
          : `U${turn.seq}: ${turn.text}${describeUtterance(byseq.get(turn.seq!), turn.text)}`,
    )
    .join("\n");

  const card = session.card;
  const userText = `# Scenario
${scenario?.title ?? session.scenarioId}: ${scenario?.role ?? ""}
${
  card
    ? `
# Task card for this session (the learner saw it in Japanese; judge how well they achieved the goal and used the facts, and mention it briefly in the summary)
Title: ${card.title}
Situation: ${card.situation}
Learner's role: ${card.role ?? "themselves (a university student)"}
Facts / material: ${card.facts.join(" / ")}
Goal: ${card.goal}
`
    : ""
}
# Learner profile
${profile.about || "(none)"}
Current conversation difficulty: ${session.level}/10

# Learner model (built from ${model?.sessions ?? 0} earlier sessions; quiet background knowledge)
${model ? describeModel(model) : "(none yet)"}

# Last session's homework (judge whether it was applied)
${homework ? `${homework.title}: ${homework.detail}` : "(none)"}

# Measured delivery (this session)
${describeDelivery(delivery(utterances, userTurns), utterances)}

# Weak sounds in content words (phoneme score under 50 at least twice)
This session:
${describeSounds(weakSounds(thisWords))}
Previous ${Math.min(recent.length, 5)} sessions:
${describeSounds(weakSounds(pastWords.flatMap((u) => u.words)))}

# Mistake-pattern catalogue (patternKey)
${catalogue}

# Target expressions for this session (judge whether the learner used them)
${targets.map((x) => `- id ${x.id}: "${x.text}"`).join("\n") || "(none)"}

# Previously practiced expressions (detect spontaneous correct use)
${practiced.map((x) => `- id ${x.id}: "${x.text}"`).join("\n") || "(none)"}

# Transcript
${transcript}`;

  return { session, profile, utterances, userTurns, targets, practiced, recent, homework, userText };
}

export type AnalysisInput = Awaited<ReturnType<typeof buildAnalysisInput>>;

type Tokens = { inputTokens: number; outputTokens: number };

/** 応答は受け取れたが使えなかった失敗。費用は発生しているので使ったトークン数を持たせる */
export class AnalysisError extends Error {
  constructor(
    message: string,
    readonly tokens: Tokens,
  ) {
    super(message);
  }
}

/** Claude のトークン数を費用の記録に足す（やり直しや失敗した回の分も積み上げる） */
function addClaudeTokens(u: Usage | null, tokens: Tokens): Usage {
  return {
    realtimeUsd: u?.realtimeUsd ?? 0,
    azureSeconds: u?.azureSeconds ?? 0,
    claudeInputTokens: (u?.claudeInputTokens ?? 0) + tokens.inputTokens,
    claudeOutputTokens: (u?.claudeOutputTokens ?? 0) + tokens.outputTokens,
  };
}

/**
 * 分析 AI を呼ぶ（通信エラー・429・5xx は SDK が2回まで再試行する）。
 * 考える量が多いと 16000 トークンでは切れる（実測）ので、上限を上げてストリーミングで受ける（非ストリーミングは SDK が拒否する）
 */
export async function callAnalysisModel(userText: string): Promise<{ analysis: Analysis } & Tokens> {
  const response = await new Anthropic().messages
    .stream({
      model: PRICING.claude.model,
      max_tokens: 32000,
      thinking: { type: "adaptive" },
      output_config: { effort: "low", format: zodOutputFormat(AnalysisSchema) },
      system: SYSTEM,
      messages: [{ role: "user", content: userText }],
    })
    .finalMessage();
  const tokens = { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
  const fail = (message: string) => new AnalysisError(message, tokens);
  if (response.stop_reason === "refusal") throw fail("分析が拒否されました");
  if (response.stop_reason === "max_tokens") throw fail("分析結果が長すぎて途中で切れました");
  const analysis = response.parsed_output;
  if (!analysis) throw fail(`分析結果を解析できませんでした (stop_reason: ${response.stop_reason})`);
  return { analysis, ...tokens };
}

const normText = (s: string) => tokenize(s).join(" ");

/**
 * 分析結果の決定的な後処理と、指標・次回の難易度の計算（DB には書かない）。
 * - 存在しない（または AI の声を拾っただけの）発話への指摘、同じ箇所への重複指摘、直していない「言い換え」は除く
 * - 誤りの集計は発話ごとに1つ（なければ誤り率は null。指導項目の数で代用すると定義が混ざる）
 */
export function finalizeAnalysis(input: AnalysisInput, a: Analysis) {
  const { session, profile, utterances, userTurns, recent, homework } = input;
  const seqs = new Set(userTurns.map((x) => x.seq));
  const seen = new Set<string>();
  const items = a.items.filter((i) => {
    if (!seqs.has(i.seq)) return false;
    const key = `${i.seq}|${normText(i.original)}`;
    const noop =
      normText(i.original) === normText(i.improved) && i.category !== "pronunciation" && i.category !== "prosody";
    if (noop || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const keyTexts = new Set(items.flatMap((i) => (i.keyExpression ? [normText(i.keyExpression.text)] : [])));
  const suggestedExpressions = a.suggestedExpressions.filter((e) => !keyTexts.has(normText(e.text))).slice(0, 6);

  const bySeq = new Map<number, ErrorCount>();
  for (const e of a.utteranceErrors) {
    if (!seqs.has(e.seq) || bySeq.has(e.seq)) continue;
    const clauses = Math.max(0, e.clauses);
    bySeq.set(e.seq, {
      clauses,
      errorFreeClauses: Math.min(clauses, Math.max(0, e.errorFreeClauses)),
      errors: Math.max(0, e.errors),
    });
  }
  const errorCounts: ErrorCount[] = [...bySeq.values()];

  const previous = recent.flatMap((r) => (r.metrics ? [r.metrics] : []));
  const metrics = computeMetrics({ utterances, userTurns, errorCounts, llmCefr: a.estimatedCefr, previous });

  // 難易度: 今の難易度で続けて行った会話だけを根拠にする（変えた直後に続けて動きすぎないように）。
  // 完了した会話が今回より前に1つもなければレベル診断
  const sameLevel: SessionMetrics[] = [];
  for (const r of recent) {
    if (r.level !== session.level || !r.metrics) break;
    sameLevel.push(r.metrics);
  }
  const level = decideLevel({
    current: profile.level,
    suggestion: a.levelAdjustment,
    recent: [metrics, ...sameLevel],
    isFirstEver: recent.length === 0,
  });

  return {
    ...a,
    items,
    suggestedExpressions,
    topPoints: a.topPoints.slice(0, 3),
    homework: homework && a.homework ? ({ title: homework.title, ...a.homework } satisfies Homework) : null,
    metrics,
    level,
    learnerModel: a.learnerModel && {
      portrait: a.learnerModel.portrait,
      strengths: a.learnerModel.strengths.slice(0, 6),
      weaknesses: a.learnerModel.weaknesses.slice(0, 6),
      sounds: a.learnerModel.sounds.slice(0, 6),
      sessions: (profile.learnerModel?.sessions ?? 0) + 1,
    },
  };
}

export type FinalAnalysis = ReturnType<typeof finalizeAnalysis>;

/**
 * 保存: 1つのトランザクションにまとめ、途中で失敗しても半端に反映されないようにする。
 * - 通常（分析中の会話）: 開始時の印（analysisStartedAt）が変わっていないことを条件に保存の権利を取る。
 *   止まったとみなされて別の分析に引き継がれていたら何も書かない（難易度・表現の間隔反復・学習者モデルの二重反映を防ぐ）
 * - 再分析（完了済みの会話。スクリプトから）: 講評・指標・指摘だけ入れ替え、難易度・間隔反復・学習者モデル・ミスの型は進めない。
 *   言い直し練習の記録が付いた指摘があれば、指摘は入れ替えない（id が変わると記録が宙に浮く）
 * 保存したら true
 */
export async function persistAnalysis(input: AnalysisInput, r: FinalAnalysis, tokens: Tokens) {
  const d = db();
  const { session, profile, targets, practiced } = input;
  const sessionId = session.id;
  const rerun = session.status === "done";
  let guard = eq(t.sessions.id, sessionId);
  let replaceItems = true;
  if (rerun) {
    const [{ n }] = await d
      .select({ n: count() })
      .from(t.drillAttempts)
      .innerJoin(t.feedbackItems, eq(t.feedbackItems.id, t.drillAttempts.feedbackItemId))
      .where(eq(t.feedbackItems.sessionId, sessionId));
    replaceItems = n === 0;
    if (!replaceItems) console.warn(`session ${sessionId}: 言い直し練習の記録があるため、指摘は入れ替えずに残します`);
  } else {
    if (session.status !== "analyzing" || !session.analysisStartedAt)
      throw new Error(`分析中の会話ではないため保存しません (status: ${session.status})`);
    // 印を今の時刻に付け替えられたら保存の権利を取れた（付け替えたので、保存中に止まったとみなされることもない）
    const token = new Date();
    const [claimed] = await d
      .update(t.sessions)
      .set({ analysisStartedAt: token })
      .where(
        and(
          eq(t.sessions.id, sessionId),
          eq(t.sessions.status, "analyzing"),
          eq(t.sessions.analysisStartedAt, session.analysisStartedAt),
        ),
      )
      .returning({ id: t.sessions.id });
    if (!claimed) {
      console.warn(`session ${sessionId}: 別の分析が引き継いだため、この結果は保存しません`);
      return false;
    }
    guard = and(
      eq(t.sessions.id, sessionId),
      eq(t.sessions.status, "analyzing"),
      eq(t.sessions.analysisStartedAt, token),
    )!;
  }

  const usage = addClaudeTokens(session.usage, tokens);
  const spontaneousIds = new Set(r.spontaneousExpressionIds);
  // ミスの型の一覧に載せるのは明確な誤り（重大度2以上）で、カタログの型に当てはまるものだけ。回数は feedback_items から数える
  const patternKeys = new Set(
    r.items.filter((i) => i.severity >= ERROR_MIN_SEVERITY && i.patternKey !== "other").map((i) => i.patternKey),
  );

  const writes: BatchItem<"pg">[] = [];
  if (replaceItems) {
    writes.push(d.delete(t.feedbackItems).where(eq(t.feedbackItems.sessionId, sessionId)));
    if (r.items.length) {
      writes.push(
        d.insert(t.feedbackItems).values(
          r.items.map((i) => ({
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
  }
  if (!rerun) {
    if (patternKeys.size) {
      writes.push(
        d
          .insert(t.errorPatterns)
          .values(
            [...patternKeys].map((key) => {
              const p = errorPattern(key)!;
              return { key, label: p.label, category: p.category };
            }),
          )
          .onConflictDoUpdate({ target: t.errorPatterns.key, set: { lastSeenAt: sql`now()`, resolved: false } }),
      );
    }
    writes.push(
      ...recordTargetsQueries(sessionId, targets, r.targetExpressions),
      ...recordSpontaneousQueries(practiced.filter((p) => spontaneousIds.has(p.id))),
    );
    if (r.level !== profile.level || r.learnerModel) {
      writes.push(
        updateProfileQuery({
          ...(r.level !== profile.level ? { level: r.level } : {}),
          ...(r.learnerModel ? { learnerModel: r.learnerModel } : {}),
        }),
      );
    }
  }
  if (r.suggestedExpressions.length) {
    writes.push(
      d
        .insert(t.expressions)
        .values(r.suggestedExpressions.map((e) => ({ ...e, source: "feedback", status: "suggested" as const })))
        .onConflictDoNothing(),
    );
  }

  await d.batch([
    d
      .update(t.sessions)
      .set({
        status: "done",
        summary: r.summary,
        topPoints: r.topPoints,
        metrics: r.metrics,
        homework: r.homework,
        usage,
        costUsd: sessionCostUsd(usage),
        error: null,
      })
      .where(guard),
    ...writes,
  ]);
  return true;
}

export async function analyzeSession(sessionId: number) {
  const input = await buildAnalysisInput(sessionId);
  const { analysis, ...tokens } = await callAnalysisModel(input.userText);
  await persistAnalysis(input, finalizeAnalysis(input, analysis), tokens);
}

/**
 * 分析を実行し、失敗したらセッションをエラー状態にする（after() から呼ぶ）。
 * 応答を受け取ってから失敗した回の Claude の費用も記録する。完了済みの会話はエラーに戻さない
 */
export async function runAnalysis(sessionId: number) {
  try {
    await analyzeSession(sessionId);
  } catch (e) {
    console.error("analysis failed", e);
    const d = db();
    let cost = {};
    if (e instanceof AnalysisError) {
      const [s] = await d.select({ usage: t.sessions.usage }).from(t.sessions).where(eq(t.sessions.id, sessionId));
      const usage = addClaudeTokens(s?.usage ?? null, e.tokens);
      cost = { usage, costUsd: sessionCostUsd(usage) };
    }
    await d
      .update(t.sessions)
      .set({ status: "error", error: e instanceof Error ? e.message : String(e), ...cost })
      .where(and(eq(t.sessions.id, sessionId), ne(t.sessions.status, "done")));
  }
}
