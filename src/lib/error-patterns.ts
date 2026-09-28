/**
 * ミスの型の固定カタログ。分析 AI はこの key から選び、当てはまらないときだけ "other" にする。
 * 型が固定されていると、同じミスの再発を数えられ、「何回連続で出ていないか」で克服を判定できる。
 */
import type { FeedbackCategory } from "./categories";

export type ErrorPatternDef = { key: string; label: string; category: FeedbackCategory };

export const ERROR_PATTERNS: readonly ErrorPatternDef[] = [
  // --- 文法 ---
  { key: "article", label: "冠詞（a/the）の脱落・誤用", category: "grammar" },
  { key: "plural_s", label: "複数形の -s の脱落", category: "grammar" },
  { key: "third_person_s", label: "三単現の -s の脱落", category: "grammar" },
  { key: "tense_consistency", label: "時制のずれ・不一致", category: "grammar" },
  { key: "present_perfect", label: "現在完了と過去形の使い分け", category: "grammar" },
  { key: "preposition", label: "前置詞の誤り", category: "grammar" },
  { key: "question_word_order", label: "疑問文・間接疑問の語順", category: "grammar" },
  { key: "subject_omission", label: "主語の省略", category: "grammar" },
  { key: "verb_pattern", label: "動詞の型（to 不定詞 / -ing / that 節）", category: "grammar" },
  { key: "countable_uncountable", label: "可算・不可算名詞の扱い", category: "grammar" },
  { key: "word_form", label: "品詞の取り違え（different/difference など）", category: "grammar" },
  { key: "agreement", label: "主語と動詞の数の一致", category: "grammar" },
  // --- 語彙・コロケーション ---
  { key: "collocation", label: "語の組み合わせ（コロケーション）", category: "collocation" },
  { key: "vague_word_choice", label: "あいまいな・弱い語の選択（do, make, thing など）", category: "vocabulary" },
  { key: "false_friend", label: "和製英語・日本語からの直訳語", category: "vocabulary" },
  { key: "wrong_word", label: "意味の違う語の選択", category: "vocabulary" },
  // --- 自然さ・構成 ---
  { key: "run_on_sentence", label: "文がつながり続ける・区切れない", category: "naturalness" },
  { key: "unfinished_sentence", label: "文の尻切れ・言いさし", category: "naturalness" },
  { key: "literal_translation", label: "日本語の直訳調の構文", category: "naturalness" },
  { key: "unclear_structure", label: "結論が後回し・話の構成が見えない", category: "naturalness" },
  { key: "filler_overuse", label: "つなぎ言葉（um, like, so）の多用", category: "naturalness" },
  { key: "repetition", label: "同じ語・言い回しの繰り返し", category: "naturalness" },
  // --- 丁寧さ・トーン ---
  { key: "too_direct", label: "直接的すぎる（依頼・反論がきつい）", category: "register" },
  { key: "too_casual", label: "場面に対してくだけすぎ", category: "register" },
  { key: "over_apologizing", label: "謝りすぎ・へりくだりすぎ", category: "register" },
  // --- 発音 ---
  { key: "r_l", label: "/r/ と /l/ の混同", category: "pronunciation" },
  { key: "th_sound", label: "/θ/ /ð/ が /s/ /z/ などになる", category: "pronunciation" },
  { key: "vowel_epenthesis", label: "子音の後に母音が入る（カタカナ発音）", category: "pronunciation" },
  { key: "final_consonant", label: "語末子音の脱落", category: "pronunciation" },
  { key: "vowel_quality", label: "母音の区別（/æ/ /ʌ/ /ɑ/、長短）", category: "pronunciation" },
  { key: "v_b_f_h", label: "/v/-/b/・/f/-/h/ の混同", category: "pronunciation" },
  { key: "multisyllabic_word", label: "長い語の発音が崩れる・聞き取れない", category: "pronunciation" },
  // --- 抑揚・リズム ---
  { key: "word_stress", label: "語の強勢の位置", category: "prosody" },
  { key: "flat_intonation", label: "平板な抑揚", category: "prosody" },
  { key: "syllable_timed_rhythm", label: "音節ごとに同じ長さで話す（強弱のリズムがない）", category: "prosody" },
  { key: "unnatural_pause", label: "不自然な区切り・間", category: "prosody" },
  { key: "other", label: "その他", category: "naturalness" },
];

export const ERROR_PATTERN_KEYS = ERROR_PATTERNS.map((p) => p.key) as [string, ...string[]];

const BY_KEY = new Map(ERROR_PATTERNS.map((p) => [p.key, p]));
export const errorPattern = (key: string) => BY_KEY.get(key);

/** カタログ導入前に分析 AI が自由に付けていた key → カタログの key（本番 DB に残っている11件） */
export const LEGACY_PATTERN_KEYS: Record<string, string> = {
  missing_noun_after_adjective: "collocation",
  adjective_noun_confusion: "word_form",
  low_intelligibility_speech: "multisyllabic_word",
  incomplete_sentence: "unfinished_sentence",
  major_measure_confusion: "vowel_quality",
  awkward_wh_object_clause: "question_word_order",
  scene_topic_confusion: "wrong_word",
  missing_gerund_subject: "verb_pattern",
  vague_verb_choice: "vague_word_choice",
  multisyllabic_word_breakdown: "multisyllabic_word",
  flat_intonation: "flat_intonation",
};

/** 保存済みの key をカタログの key に寄せる（カタログにない自由な key は other） */
export const canonicalPatternKey = (key: string) => (BY_KEY.has(key) ? key : (LEGACY_PATTERN_KEYS[key] ?? "other"));
