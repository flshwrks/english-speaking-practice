import type { DrillScores, DrillWord, WordAssessment } from "@/db/schema";
import { assessPronunciation } from "@/lib/azure";

/** 照合用に語を正規化する。ハイフン語は分けて照合する（Azure が face-to-face を分けて返すことがあるため） */
const keys = (word: string) =>
  word
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9'-]/g, "")
    .split("-")
    .filter(Boolean);

/**
 * お手本の文（referenceText）に対する台本あり評価。
 * 連続認識では区間ごとにお手本全体と照合されて脱落語（Omission）が重複しうるため、
 * Azure の脱落判定は使わず、聞き取れた語とお手本の語を最長共通部分列で突き合わせて脱落・言い足しを決める。
 */
export async function assessScripted(wav: Buffer, referenceText: string) {
  const a = await assessPronunciation(wav, referenceText);
  const heard = a.words
    .filter((w) => w.errorType !== "Omission")
    .flatMap((w) => keys(w.word).map((key) => ({ key, w })));
  const tokens = referenceText.split(/\s+/).filter((s) => keys(s).length);
  const ref = tokens.flatMap((text, token) => keys(text).map((key) => ({ key, token })));

  // 最長共通部分列の表を後ろから作り、前から辿って対応を決める
  const lcs = Array.from({ length: ref.length + 1 }, () => new Array<number>(heard.length + 1).fill(0));
  for (let i = ref.length - 1; i >= 0; i--)
    for (let j = heard.length - 1; j >= 0; j--)
      lcs[i][j] = ref[i].key === heard[j].key ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);

  const matched = new Map<number, WordAssessment>();
  const inserted = new Map<number, string[]>(); // お手本の何語目の前に言い足したか
  const insertBefore = (token: number, word: string) => inserted.set(token, [...(inserted.get(token) ?? []), word]);
  let i = 0;
  let j = 0;
  while (j < heard.length) {
    if (i < ref.length && ref[i].key === heard[j].key) {
      matched.set(i++, heard[j++].w);
    } else if (i < ref.length && lcs[i + 1][j] >= lcs[i][j + 1]) {
      i++;
    } else {
      insertBefore(i < ref.length ? ref[i].token : tokens.length, heard[j++].key);
    }
  }

  const words: DrillWord[] = [];
  tokens.forEach((text, token) => {
    for (const w of inserted.get(token) ?? []) words.push(insertion(w));
    const got = ref.flatMap((r, k) => (r.token === token && matched.has(k) ? [matched.get(k)!] : []));
    const accuracy = got.length ? Math.min(...got.map((w) => w.accuracy)) : null;
    words.push({
      word: text,
      accuracy,
      errorType:
        accuracy == null
          ? "Omission"
          : got.some((w) => w.errorType === "Mispronunciation")
            ? "Mispronunciation"
            : "None",
      weakPhonemes: got.flatMap((w) => w.weakPhonemes),
    });
  });
  for (const w of inserted.get(tokens.length) ?? []) words.push(insertion(w));

  const said = [...matched.values()].map((w) => w.accuracy);
  const sum = said.reduce((s, v) => s + v, 0);
  const round1 = (v: number) => Math.round(v * 10) / 10;
  const scores: DrillScores = {
    score: ref.length ? round1(sum / ref.length) : 0,
    accuracy: said.length ? round1(sum / said.length) : null,
    fluency: a.fluency,
    prosody: a.prosody,
    completeness: ref.length ? Math.round((said.length / ref.length) * 100) : 0,
  };
  return { heard: a.heard, scores, words };
}

const insertion = (word: string): DrillWord => ({ word, accuracy: null, errorType: "Insertion", weakPhonemes: [] });
