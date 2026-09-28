import type { Usage } from "@/db/schema";

/** 料金・上限などの設定。単価は2026年9月時点の公開価格に基づく概算（USD） */
export const PRICING = {
  realtime: {
    model: "gpt-realtime-mini",
    /** 100万トークンあたり */
    audioIn: 10,
    audioInCached: 0.3,
    textIn: 0.6,
    textInCached: 0.06,
    audioOut: 20,
    textOut: 2.4,
  },
  /**
   * 会話中の文字起こし（gpt-4o-transcribe）。Realtime の usage には含まれず、発話ごとの完了イベントに usage が付く。
   * トークン単価は100万トークンあたり、perMin は usage が取れなかったときの概算
   */
  transcribe: { audioIn: 6, textIn: 2.5, textOut: 10, perMin: 0.006 },
  /** Azure 発音評価（STT＋評価の追加料金）の概算: 1時間あたり */
  azurePerHour: 1.6,
  claude: {
    model: "claude-sonnet-5",
    input: 2,
    output: 10,
  },
  /** お題カードを作るモデル（速くて安いもの。1枚あたり約 $0.003） */
  cards: {
    model: "claude-haiku-4-5",
    input: 1,
    output: 5,
  },
} as const;

/** 非ネイティブの発音でも取り違えにくい上位モデル（mini の約2倍だが1分 $0.006） */
export const TRANSCRIBE_MODEL = "gpt-4o-transcribe";
export const VOICE = "marin";
/** 1回の応答の出力トークン上限。通常の応答（数十秒）には届かず、止まらない長話だけを打ち切る費用の歯止め */
export const MAX_RESPONSE_TOKENS = 4096;

/** AI に番を渡す方法。manual: 「話し終えた」を押すまで待つ / low・medium: 自動判定（semantic VAD）の待ち方 */
export const TURN_WAITS = ["manual", "low", "medium"] as const;
export type TurnWait = (typeof TURN_WAITS)[number];

/** Realtime API の turn_detection 設定。手動は自動判定なし（null） */
export function turnDetectionFor(wait: TurnWait) {
  return wait === "manual" ? null : { type: "semantic_vad", eagerness: wait };
}

/** 正の数の環境変数。未設定や数値でない値は既定値にする（NaN だと予算判定が常に「超えていない」になるため） */
function positiveEnv(name: string, fallback: number) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export function settings() {
  return {
    monthlyBudgetJpy: positiveEnv("MONTHLY_BUDGET_JPY", 3000),
    usdJpy: positiveEnv("USD_JPY", 150),
    sessionMaxMinutes: positiveEnv("SESSION_MAX_MINUTES", 15),
  };
}

export const usdToJpy = (usd: number) => usd * settings().usdJpy;

/** 「それでも始める」で予算を超えて始められるのは、月の予算のこの倍率まで */
export const BUDGET_HARD_CAP_RATIO = 1.2;

/** 選べる会話の長さ（分）。設定の上限を超えるものは除く */
export function sessionLengths() {
  const max = settings().sessionMaxMinutes;
  return [...new Set([5, 10, 15, max])].filter((m) => m <= max).sort((a, b) => a - b);
}

/** 希望の長さを選べる長さに丸める（指定なし・範囲外は上限） */
export function sessionMinutes(requested?: number) {
  const lengths = sessionLengths();
  return lengths.find((m) => m === requested) ?? lengths[lengths.length - 1];
}

/**
 * サーバー側の時間制限: 会話の長さにこの猶予を足した時刻を過ぎたら、発話の受け付けをやめ、
 * 終了の連絡がないセッションは打ち切って分析する（タブを閉じた・落ちた場合）
 */
export const SESSION_GRACE_MIN = 3;
export const STALE_SESSION_MIN = 10;
/** 分析がこの時間を過ぎても終わらなければ止まったとみなす（関数の最大実行時間 300秒より長く） */
export const ANALYSIS_STALE_MS = 6 * 60 * 1000;

/** Realtime API の response.done.usage のうち、費用計算に使う部分 */
export type RealtimeUsage = {
  input_token_details?: {
    text_tokens?: number;
    audio_tokens?: number;
    cached_tokens_details?: { text_tokens?: number; audio_tokens?: number };
  };
  output_token_details?: { text_tokens?: number; audio_tokens?: number };
};

export function realtimeCostUsd(u: RealtimeUsage): number {
  const p = PRICING.realtime;
  const inD = u.input_token_details ?? {};
  const cachedText = inD.cached_tokens_details?.text_tokens ?? 0;
  const cachedAudio = inD.cached_tokens_details?.audio_tokens ?? 0;
  const text = Math.max(0, (inD.text_tokens ?? 0) - cachedText);
  const audio = Math.max(0, (inD.audio_tokens ?? 0) - cachedAudio);
  const outD = u.output_token_details ?? {};
  return (
    (text * p.textIn +
      cachedText * p.textInCached +
      audio * p.audioIn +
      cachedAudio * p.audioInCached +
      (outD.text_tokens ?? 0) * p.textOut +
      (outD.audio_tokens ?? 0) * p.audioOut) /
    1_000_000
  );
}

/** 文字起こしの完了イベントの usage を足し合わせたもの（トークン課金と秒課金の両方の形がある） */
export type TranscriptionUsage = { audioTokens: number; textTokens: number; outputTokens: number; seconds: number };

/** Azure に送った秒数の見積もり: 発話長＋切り出しの前後余白（約1.5秒） */
export function azureBilledSeconds(assessedDurationsMs: number[]) {
  return assessedDurationsMs.reduce((s, ms) => s + ms / 1000 + 1.5, 0);
}

/**
 * 文字起こしの費用。usage があればそれで計算し、なければ自分が話した時間ぶんで概算する
 * （usage は確定した音声全体＝間や沈黙も含むので、話した時間より多くなる）
 */
export function transcribeCostUsd(speakingMs: number, u?: TranscriptionUsage) {
  const p = PRICING.transcribe;
  if (!u || u.audioTokens + u.textTokens + u.outputTokens + u.seconds === 0) return (speakingMs / 60000) * p.perMin;
  return (
    (u.audioTokens * p.audioIn + u.textTokens * p.textIn + u.outputTokens * p.textOut) / 1_000_000 +
    (u.seconds / 60) * p.perMin
  );
}

export function sessionCostUsd(u: Usage) {
  return (
    u.realtimeUsd +
    (u.azureSeconds / 3600) * PRICING.azurePerHour +
    (u.claudeInputTokens * PRICING.claude.input + u.claudeOutputTokens * PRICING.claude.output) / 1_000_000
  );
}
