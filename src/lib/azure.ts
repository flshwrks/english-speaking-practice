import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import type { utterances, WordAssessment } from "@/db/schema";

export type Assessment = Required<
  Pick<typeof utterances.$inferInsert, "heard" | "accuracy" | "fluency" | "prosody" | "pron" | "words">
>;

export const EMPTY_ASSESSMENT: Assessment = {
  heard: "",
  accuracy: null,
  fluency: null,
  prosody: null,
  pron: null,
  words: [],
};

type PaScores = {
  AccuracyScore?: number;
  FluencyScore?: number;
  ProsodyScore?: number;
  PronScore?: number;
  ErrorType?: string;
  NBestPhonemes?: { Phoneme: string; Score: number }[];
  Feedback?: {
    Prosody?: { Break?: { ErrorTypes?: string[] }; Intonation?: { ErrorTypes?: string[] } };
  };
};
type Scored = PaScores & { PronunciationAssessment?: PaScores };
type AzureWord = Scored & { Word: string; Phonemes?: (Scored & { Phoneme: string })[] };
type AzureResult = { NBest?: (Scored & { Lexical?: string; Words?: AzureWord[] })[] };

/** SDK の JSON はスコアを PronunciationAssessment 配下に、REST はフラットに持つので両対応 */
const pa = (x: Scored): PaScores => x.PronunciationAssessment ?? x;

const WEAK_PHONEME = 60;

export function azureConfigured() {
  return Boolean(process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION);
}

/**
 * 16kHz mono PCM の WAV を評価する。referenceText を省略すると台本なし（unscripted）評価。
 * 韻律（prosody）評価は en-US のみ対応。
 */
export async function assessPronunciation(wav: Buffer, referenceText = ""): Promise<Assessment> {
  const speechConfig = sdk.SpeechConfig.fromSubscription(
    process.env.AZURE_SPEECH_KEY!,
    process.env.AZURE_SPEECH_REGION!,
  );
  speechConfig.speechRecognitionLanguage = "en-US";
  speechConfig.outputFormat = sdk.OutputFormat.Detailed;

  const config = new sdk.PronunciationAssessmentConfig(
    referenceText,
    sdk.PronunciationAssessmentGradingSystem.HundredMark,
    sdk.PronunciationAssessmentGranularity.Phoneme,
    Boolean(referenceText),
  );
  config.enableProsodyAssessment = true;
  config.phonemeAlphabet = "IPA";
  config.nbestPhonemeCount = 3;

  const recognizer = new sdk.SpeechRecognizer(speechConfig, sdk.AudioConfig.fromWavFileInput(wav));
  config.applyTo(recognizer);

  const results = await new Promise<AzureResult[]>((resolve, reject) => {
    const out: AzureResult[] = [];
    const finish = (err?: string) =>
      recognizer.stopContinuousRecognitionAsync(() => {
        recognizer.close();
        if (err) reject(new Error(err));
        else resolve(out);
      });
    recognizer.recognized = (_s, e) => {
      if (e.result.reason !== sdk.ResultReason.RecognizedSpeech) return;
      out.push(JSON.parse(e.result.properties.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult)));
    };
    recognizer.canceled = (_s, e) =>
      finish(e.reason === sdk.CancellationReason.Error ? e.errorDetails : undefined);
    recognizer.sessionStopped = () => finish();
    recognizer.startContinuousRecognitionAsync(undefined, (err) => reject(new Error(err)));
  });

  return aggregate(results);
}

function aggregate(results: AzureResult[]): Assessment {
  const best = results.map((r) => r.NBest?.[0]).filter((b) => b !== undefined);
  const words: WordAssessment[] = best.flatMap((b) =>
    (b.Words ?? []).map((w) => {
      const s = pa(w);
      return {
        word: w.Word,
        accuracy: s.AccuracyScore ?? 0,
        errorType: s.ErrorType ?? "None",
        weakPhonemes: (w.Phonemes ?? [])
          .filter((p) => (pa(p).AccuracyScore ?? 100) < WEAK_PHONEME)
          .map((p) => {
            const heard = pa(p).NBestPhonemes?.[0]?.Phoneme;
            return {
              phoneme: p.Phoneme,
              score: pa(p).AccuracyScore ?? 0,
              ...(heard && heard !== p.Phoneme ? { heardAs: heard } : {}),
            };
          }),
        prosodyErrors: [
          ...(s.Feedback?.Prosody?.Break?.ErrorTypes ?? []),
          ...(s.Feedback?.Prosody?.Intonation?.ErrorTypes ?? []),
        ].filter((e) => e !== "None"),
      };
    }),
  );

  // 文ごとのスコアを語数で重み付け平均する
  const weighted = (key: keyof PaScores) => {
    let sum = 0;
    let n = 0;
    for (const b of best) {
      const v = pa(b)[key];
      const count = b.Words?.length ?? 1;
      if (typeof v === "number") {
        sum += v * count;
        n += count;
      }
    }
    return n ? Math.round((sum / n) * 10) / 10 : null;
  };

  return {
    heard: best.map((b) => b.Lexical ?? "").join(" ").trim(),
    accuracy: weighted("AccuracyScore"),
    fluency: weighted("FluencyScore"),
    prosody: weighted("ProsodyScore"),
    pron: weighted("PronScore"),
    words,
  };
}
