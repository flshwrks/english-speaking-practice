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
  /** 会話中の文字起こし（gpt-4o-transcribe）: 1分あたり。Realtime の usage には含まれない */
  transcribePerMin: 0.006,
  /** Azure 発音評価（STT＋評価の追加料金）の概算: 1時間あたり */
  azurePerHour: 1.6,
  claude: {
    model: "claude-sonnet-5",
    input: 2,
    output: 10,
  },
} as const;

/** 非ネイティブの発音でも取り違えにくい上位モデル（mini の約2倍だが1分 $0.006） */
export const TRANSCRIBE_MODEL = "gpt-4o-transcribe";
export const VOICE = "marin";

export function settings() {
  return {
    monthlyBudgetJpy: Number(process.env.MONTHLY_BUDGET_JPY ?? 3000),
    usdJpy: Number(process.env.USD_JPY ?? 150),
    sessionMaxMinutes: Number(process.env.SESSION_MAX_MINUTES ?? 15),
  };
}

export const usdToJpy = (usd: number) => usd * settings().usdJpy;

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

/** Azure に送った秒数の見積もり: 発話長＋切り出しの前後余白（約1.5秒） */
export function azureBilledSeconds(assessedDurationsMs: number[]) {
  return assessedDurationsMs.reduce((s, ms) => s + ms / 1000 + 1.5, 0);
}

/** 文字起こしの費用: 自分が話した時間ぶん */
export function transcribeCostUsd(speakingMs: number) {
  return (speakingMs / 60000) * PRICING.transcribePerMin;
}

export function sessionCostUsd(u: Usage) {
  return (
    u.realtimeUsd +
    (u.azureSeconds / 3600) * PRICING.azurePerHour +
    (u.claudeInputTokens * PRICING.claude.input + u.claudeOutputTokens * PRICING.claude.output) / 1_000_000
  );
}
