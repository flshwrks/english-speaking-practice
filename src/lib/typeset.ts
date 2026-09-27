/**
 * 表示用の文字組みの下ごしらえ（純粋関数）
 * - 例文の中の見出し語を探す（辞書のように見出し語に下線を引くため）
 * - 元の発話と言い直しの語単位の差分（赤ペン添削のため）
 */

const BE_FORMS = "(?:be|am|is|are|was|were|been|being|'m|'s|'re|’m|’s|’re)";

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 見出し語 1 つ分の正規表現。be は活用形も、3 文字以上の語は語尾変化（-s, -ed, -ing など）も許す */
function headwordPattern(candidate: string) {
  const words = candidate.split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const parts = words.map((w, i) => {
    if (i === 0 && w.toLowerCase() === "be") return BE_FORMS;
    const e = escape(w);
    return w.length >= 3 && /^[a-z]+$/i.test(w) ? `${e}[a-z]*` : e;
  });
  // 先頭の be は「I'm」のように前の語にくっつくことがある
  const sep = (i: number) => (i === 1 && parts[0] === BE_FORMS ? "\\s*" : "\\s+");
  return parts.reduce((acc, p, i) => (i === 0 ? p : `${acc}${sep(i)}${p}`), "");
}

/**
 * 例文を「見出し語に当たる部分」と「それ以外」に分ける。見つからなければ全体を1つで返す。
 * 「out of office / OOO」のような別表記、「(with)」「___」「...」は除いて探す。
 */
export function splitHeadword(example: string, headword: string): { text: string; hit: boolean }[] {
  const candidates = headword
    .split(/\s*\/\s*/)
    .map((c) =>
      c
        .replace(/\(.*?\)|_{2,}|\.{3}|…|~|〜/g, " ")
        .replace(/\bsomething\b|\bsomeone\b|\bsb\b|\bsth\b/gi, " ")
        .replace(/[!?.,]+$/g, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((c) => c.length >= 2)
    .sort((a, b) => b.length - a.length);
  for (const c of candidates) {
    const pattern = headwordPattern(c);
    if (!pattern) continue;
    const m = new RegExp(`(^|[^a-z]|(?=['’]))(${pattern})(?![a-z])`, "i").exec(example);
    if (m) {
      const start = m.index + m[1].length;
      const end = start + m[2].length;
      return [
        { text: example.slice(0, start), hit: false },
        { text: example.slice(start, end), hit: true },
        { text: example.slice(end), hit: false },
      ].filter((p) => p.text);
    }
  }
  return [{ text: example, hit: false }];
}

export type DiffPart = { text: string; op: "same" | "del" | "ins" };

const norm = (w: string) => w.toLowerCase().replace(/[^a-z0-9']/g, "");

/** 語単位の差分（LCS）。同じ語は1つにまとめ、消した語と足した語を並べて返す */
export function diffWords(original: string, improved: string): DiffPart[] {
  const a = original.split(/\s+/).filter(Boolean);
  const b = improved.split(/\s+/).filter(Boolean);
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      dp[i][j] = norm(a[i]) === norm(b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);

  const out: DiffPart[] = [];
  const push = (text: string, op: DiffPart["op"]) => {
    const last = out.at(-1);
    if (last?.op === op) last.text += ` ${text}`;
    else out.push({ text, op });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (norm(a[i]) === norm(b[j])) {
      // 句読点や大文字小文字だけの違いは言い直し側の表記を使う
      push(b[j], "same");
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) push(a[i++], "del");
    else push(b[j++], "ins");
  }
  while (i < a.length) push(a[i++], "del");
  while (j < b.length) push(b[j++], "ins");
  return out;
}

/** 差分がほとんど「全部入れ替え」なら、行を分けて見せたほうが読みやすい */
export function isRewrite(parts: DiffPart[]) {
  const same = parts.filter((p) => p.op === "same").reduce((n, p) => n + p.text.split(" ").length, 0);
  const total = parts.reduce((n, p) => n + p.text.split(" ").length, 0);
  return total > 0 && same / total < 0.35;
}
