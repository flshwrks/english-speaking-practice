/**
 * 会話1回分の指標の計算（DB を読まない純粋関数）。
 *
 * 語数と時間の取り方（会話モードによらず同じ定義にする）:
 * - 話した語は Azure が聞き取った語（heard）で数える。Realtime の文字起こしは言いよどみを消すうえ、
 *   長い発話の後半を落とすことがある（実データで約3割欠けた回があった）。評価できなかった発話だけ文字起こしで補う
 * - 話速・発話の長さは、つなぎ語（uh, um）と直後の繰り返し（"I I", "talk with talk with"）を除いた語数（pruned）で数える
 * - 時間は Azure の語の時刻から取る（最初の語の始まり〜最後の語の終わり）。手動モードの durationMs は有声部分だけ、
 *   自動モードは VAD の区間で定義が違うため、語の時刻がない古い発話でだけ使う
 * - 語彙の多様性とミス率の分母は文字起こし（分析 AI が添削するのと同じ本文）で数える
 */
import type { SessionMetrics, utterances, WordAssessment } from "@/db/schema";

export type UtteranceData = Pick<
  typeof utterances.$inferSelect,
  "transcript" | "heard" | "durationMs" | "accuracy" | "fluency" | "prosody" | "pron" | "words"
>;

export const CEFR_LEVELS = ["A2", "B1", "B2", "C1", "C2"] as const;
export type Cefr = (typeof CEFR_LEVELS)[number];

const FILLERS = new Set(["uh", "um", "uhm", "umm", "er", "erm", "ah", "hmm", "mm"]);
/** これ以上の語間の無音を「ポーズ」とみなす（流暢さ研究で一般的な 250ms） */
const PAUSE_MS = 250;
/** AI が話し終えてから話し始めるまでがこれ以上なら「長い間」 */
const LONG_LATENCY_MS = 3000;
/** MATTR の窓の語数 */
const MATTR_WINDOW = 50;
/** CEFR の表示は直近この回数の中央値 */
const CEFR_WINDOW = 5;

/**
 * 弱い音素の集計から外す機能語。つながった発話では and→/n/、that→/ðə/ のように弱く発音するのが自然で、
 * Azure はそれを誤りとして拾いがち（実データで and・that・the の弱い音素が上位を占めた）
 */
const FUNCTION_WORDS = new Set(
  "a an the and or but so if of to in on at by for with from as that this these those it its is am are was were be been i i'm you we they he she my your our their me us them him her not do does did have has had will would can could just".split(
    " ",
  ),
);

export const isFunctionWord = (word: string) => FUNCTION_WORDS.has(word.toLowerCase());

const round1 = (x: number) => Math.round(x * 10) / 10;
const round2 = (x: number) => Math.round(x * 100) / 100;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
};

export function tokenize(text: string) {
  return text.toLowerCase().match(/[a-z]+(?:['’][a-z]+)*/g) ?? [];
}

/** つなぎ語と、直後に繰り返した 1〜3 語（言い直し）を除く。除いた数も返す */
export function prune(tokens: string[]) {
  const words = tokens.filter((w) => !FILLERS.has(w));
  const kept: string[] = [];
  let repetitions = 0;
  for (let i = 0; i < words.length;) {
    const same = (n: number) =>
      i + 2 * n <= words.length && words.slice(i, i + n).join(" ") === words.slice(i + n, i + 2 * n).join(" ");
    const n = [3, 2, 1].find(same);
    if (n) {
      repetitions++;
      i += n; // 1回目を捨てて続ける（"need need need" は2回と数える）
    } else kept.push(words[i++]);
  }
  return { words: kept, fillers: tokens.length - words.length, repetitions };
}

/**
 * 学習者の発話が直前の AI の発言の拾い込み（スピーカーの音をマイクが拾った）らしいか。
 * 学習者の語の2語連続のうち半分以上が AI の発言にもあれば拾い込みとみなす（実データで AI の質問をほぼそのまま拾った回があった）
 */
export function isEcho(userText: string, aiText: string) {
  const bigrams = (text: string) => {
    const w = tokenize(text);
    return w.slice(1).map((x, i) => `${w[i]} ${x}`);
  };
  const user = bigrams(userText);
  if (user.length < 4) return false;
  const ai = new Set(bigrams(aiText));
  return user.filter((b) => ai.has(b)).length / user.length >= 0.5;
}

/** 移動平均型の語彙の多様性（MATTR）。素の TTR と違って語数に左右されない。窓より短ければ素の TTR */
export function mattr(tokens: string[], window = MATTR_WINDOW) {
  if (tokens.length <= window) return tokens.length ? new Set(tokens).size / tokens.length : 0;
  const counts = new Map<string, number>();
  let distinct = 0;
  const add = (w: string, d: 1 | -1) => {
    const c = (counts.get(w) ?? 0) + d;
    counts.set(w, c);
    if (d > 0 && c === 1) distinct++;
    if (d < 0 && c === 0) distinct--;
  };
  tokens.slice(0, window).forEach((w) => add(w, 1));
  let sum = distinct;
  for (let i = window; i < tokens.length; i++) {
    add(tokens[i], 1);
    add(tokens[i - window], -1);
    sum += distinct;
  }
  return sum / window / (tokens.length - window + 1);
}

/** 語の時刻から、発話の長さ（最初の語の始まり〜最後の語の終わり）と発話内のポーズを取る。時刻がなければ null */
export function timing(words: WordAssessment[]) {
  if (words.length < 2 || words.some((w) => w.offsetMs === undefined || w.durationMs === undefined)) return null;
  const sorted = [...words].sort((a, b) => a.offsetMs! - b.offsetMs!);
  const pauses: number[] = [];
  let end = sorted[0].offsetMs! + sorted[0].durationMs!;
  for (const w of sorted.slice(1)) {
    const gap = w.offsetMs! - end;
    if (gap >= PAUSE_MS) pauses.push(gap);
    end = Math.max(end, w.offsetMs! + w.durationMs!);
  }
  return { spanMs: end - sorted[0].offsetMs!, pauses };
}

/** 語数で重み付けした平均（1語だけの発話で流暢さ 0 や 100 が出ても全体を振り回さないように） */
function weightedMean(pairs: [value: number | null, weight: number][]) {
  let sum = 0;
  let n = 0;
  for (const [v, w] of pairs) {
    if (v === null) continue;
    sum += v * w;
    n += w;
  }
  return n ? round1(sum / n) : null;
}

/** 話し方の実測（分析 AI に渡す分と、指標の両方に使う） */
export function delivery(utterances: UtteranceData[], userTurns: { latencyMs?: number }[] = []) {
  let spoken = 0;
  let fillers = 0;
  let repetitions = 0;
  let speakingMs = 0;
  let timedMs = 0;
  let timedWords = 0;
  let pauseMs = 0;
  let pauses = 0;
  let turns = 0;
  for (const u of utterances) {
    const heard = tokenize(u.heard);
    const said = tokenize(u.transcript);
    if (!heard.length && !said.length) continue; // 無音・雑音だけの切り出し
    const p = prune(heard.length ? heard : said);
    // 文字起こしにだけ残るつなぎ語（"It's um..."）もあるので多いほうを取る
    fillers += Math.max(p.fillers, prune(said).fillers);
    repetitions += p.repetitions;
    spoken += p.words.length;
    turns++;
    const tm = timing(u.words);
    if (tm) {
      speakingMs += tm.spanMs;
      timedMs += tm.spanMs;
      timedWords += p.words.length;
      pauses += tm.pauses.length;
      pauseMs += tm.pauses.reduce((s, x) => s + x, 0);
    } else speakingMs += u.durationMs;
  }
  const perSpoken100 = (n: number) => (spoken ? round1((n / spoken) * 100) : 0);
  const articulationMin = (timedMs - pauseMs) / 60000;
  const latencies = userTurns.flatMap((x) => (x.latencyMs === undefined ? [] : [x.latencyMs]));
  const medianLatency = median(latencies);
  return {
    spokenWords: spoken,
    speakingSec: Math.round(speakingMs / 1000),
    // 話速は語の時刻がある発話だけで測る（手動モードの durationMs は有声部分だけで速く出るため）。測れなければ 0 = 未計測
    wpm: timedMs > 0 ? Math.round(timedWords / (timedMs / 60000)) : 0,
    meanUtteranceWords: turns ? round1(spoken / turns) : 0,
    fillersPer100Words: perSpoken100(fillers),
    repetitionsPer100Words: perSpoken100(repetitions),
    ...(articulationMin > 0 && {
      articulationWpm: Math.round(timedWords / articulationMin),
      pausesPerMin: round1(pauses / (timedMs / 60000)),
      meanLengthOfRun: round1(timedWords / (pauses + turns)),
    }),
    ...(medianLatency !== null && {
      medianLatencyMs: Math.round(medianLatency),
      longLatencyRate: round2(latencies.filter((x) => x >= LONG_LATENCY_MS).length / latencies.length),
    }),
  };
}

/** 分析 AI が発話ごとに数えた文法・語彙の誤り（指導項目とは別に、漏れなく数えたもの） */
export type ErrorCount = { errors: number; clauses: number; errorFreeClauses: number };

/**
 * 1回の会話の CEFR: 分析 AI の判定を、実測の目安から ±1 段階の範囲に収める（1回の印象で大きく外れないように）。
 * 実測の目安は、話速・誤りのない節の割合・発音の総合点をそれぞれ A2〜C1 に当てはめた中央値。
 * 境界は B1〜B2 の学習者の実データと CEFR の話す力の記述から置いた暫定値で、データがたまったら見直す
 */
const CEFR_BANDS: { value: (m: SessionMetrics) => number | null | undefined; cuts: number[] }[] = [
  // 話速（pruned wpm）: A2 | 90 | B1 | 115 | B2 | 140 | C1
  { value: (m) => (m.userWords >= 40 && m.wpm > 0 ? m.wpm : null), cuts: [90, 115, 140] },
  // 誤りのない節の割合: A2 | 0.4 | B1 | 0.6 | B2 | 0.8 | C1
  { value: (m) => m.errorFreeClauseRatio, cuts: [0.4, 0.6, 0.8] },
  // Azure の発音の総合点: A2 | 65 | B1 | 78 | B2 | 88 | C1
  { value: (m) => m.pron, cuts: [65, 78, 88] },
];

export const cefrIndex = (c: string) => Math.max(0, CEFR_LEVELS.indexOf(c as Cefr));

export function measuredCefr(m: SessionMetrics) {
  return median(
    CEFR_BANDS.flatMap(({ value, cuts }) => {
      const v = value(m);
      return v === null || v === undefined ? [] : [cuts.filter((c) => v >= c).length];
    }),
  );
}

export function sessionCefr(llm: string, m: SessionMetrics) {
  const measured = measuredCefr(m);
  const i = cefrIndex(llm);
  // 実測の目安が段階の間（例 1.5）なら、近いほうの2段階と ±1 の範囲が重なる所に収める
  return CEFR_LEVELS[measured === null ? i : Math.min(Math.floor(measured + 1), Math.max(Math.ceil(measured - 1), i))];
}

/** 表示する CEFR: 今回と前回までの1回ごとの推定の中央値（偶数個なら低いほう） */
export function rollingCefr(current: string, previous: string[]) {
  const xs = [current, ...previous.slice(0, CEFR_WINDOW - 1)].map(cefrIndex).sort((a, b) => a - b);
  return CEFR_LEVELS[xs[(xs.length - 1) >> 1]];
}

export function computeMetrics(input: {
  utterances: UtteranceData[];
  /** 会話中の学習者の発言（文字起こし）。latencyMs は AI が話し終えてから話し始めるまで */
  userTurns: { text: string; latencyMs?: number }[];
  errorCounts: ErrorCount[];
  llmCefr: string;
  /** 前回までの会話の指標（新しい順） */
  previous: SessionMetrics[];
}): SessionMetrics {
  const { utterances, errorCounts } = input;
  const transcriptWords = input.userTurns.flatMap((x) => tokenize(x.text));
  const scored = utterances.filter((u) => u.accuracy !== null);
  const avg = (key: "accuracy" | "fluency" | "prosody" | "pron") =>
    weightedMean(scored.map((u) => [u[key], u.words.length || 1]));
  const assessed = scored.flatMap((u) => u.words);
  const share = (n: number, of: number, scale = 1) => (of ? Math.round((n / of) * scale * 100) / 100 : 0);
  const clauses = errorCounts.reduce((s, x) => s + x.clauses, 0);

  const m: SessionMetrics = {
    userWords: transcriptWords.length,
    lexicalDiversity: round2(mattr(transcriptWords)),
    errorsPer100Words: round1(
      share(
        errorCounts.reduce((s, x) => s + x.errors, 0),
        transcriptWords.length,
        100,
      ),
    ),
    ...(clauses > 0 && {
      errorFreeClauseRatio: share(
        errorCounts.reduce((s, x) => s + Math.min(x.errorFreeClauses, x.clauses), 0),
        clauses,
      ),
    }),
    ...delivery(utterances, input.userTurns),
    accuracy: avg("accuracy"),
    fluency: avg("fluency"),
    prosody: avg("prosody"),
    pron: avg("pron"),
    ...(assessed.length > 0 && {
      mispronouncedPer100Words: round1(
        share(assessed.filter((w) => w.errorType === "Mispronunciation").length, assessed.length, 100),
      ),
      monotoneRate: share(assessed.filter((w) => w.prosodyErrors.includes("Monotone")).length, assessed.length),
    }),
    cefrLlm: input.llmCefr,
    estimatedCefr: input.llmCefr,
  };
  m.cefrSession = sessionCefr(input.llmCefr, m);
  m.estimatedCefr = rollingCefr(
    m.cefrSession,
    input.previous.map((p) => p.cefrSession ?? p.estimatedCefr).filter(Boolean),
  );
  return m;
}

export type WeakSound = { phoneme: string; count: number; clear: number; heardAs: string[]; examples: string[] };

/**
 * 苦手な音素の集計（今回分・直近の会話分のどちらにも使う）。機能語は除き、
 * 50点台は発音の揺れ程度で雑音が多いので、50点未満の「はっきり外れた」回数（clear）が2回以上のものだけ返す
 */
export function weakSounds(words: WordAssessment[], limit = 6): WeakSound[] {
  const by = new Map<
    string,
    { count: number; clear: number; heard: Map<string, number>; words: Map<string, number> }
  >();
  const inc = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  for (const w of words) {
    const word = w.word.toLowerCase();
    if (isFunctionWord(word)) continue;
    for (const p of w.weakPhonemes) {
      const e = by.get(p.phoneme) ?? { count: 0, clear: 0, heard: new Map(), words: new Map() };
      e.count++;
      if (p.score < 50) e.clear++;
      if (p.heardAs) inc(e.heard, p.heardAs);
      inc(e.words, word);
      by.set(p.phoneme, e);
    }
  }
  const top = (m: Map<string, number>, n: number) =>
    [...m]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([k]) => k);
  return [...by]
    .map(([phoneme, e]) => ({
      phoneme,
      count: e.count,
      clear: e.clear,
      heardAs: top(e.heard, 2),
      examples: top(e.words, 4),
    }))
    .filter((s) => s.clear >= 2)
    .sort((a, b) => b.clear - a.clear || b.count - a.count)
    .slice(0, limit);
}
