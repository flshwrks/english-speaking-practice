import type { Expression } from "./expressions";
import { EXPRESSION_KIND_PROMPT, EXPRESSION_KINDS } from "./categories";
import type { getProfile } from "./lesson";
import { levelGuidance, type Scenario } from "./scenarios";

type Profile = Awaited<ReturnType<typeof getProfile>>;

/** 前回のフィードバックで一番大事だった改善点（今回それとなく使う機会を作る） */
export type Homework = { title: string; detail: string };

const bullets = (items: string[]) => items.map((x) => `- ${x}`).join("\n");

/**
 * 学習者モデル・繰り返しているミス・前回の改善点を、話題や質問の選び方にだけ使う背景知識として渡す。
 * 本人に弱点を指摘したり、ドリルにしたりはさせない
 */
function background(profile: Profile, patterns: string[], homework: Homework | null) {
  const m = profile.learnerModel;
  const parts = [
    m?.portrait && `Portrait: ${m.portrait}`,
    m?.strengths.length && `Strengths:\n${bullets(m.strengths)}`,
    m?.weaknesses.length && `Tends to struggle with:\n${bullets(m.weaknesses)}`,
    patterns.length && `Recurring mistakes:\n${bullets(patterns)}`,
    homework && `Key point from the last session's feedback: ${homework.title} — ${homework.detail}`,
  ].filter(Boolean);
  if (!parts.length) return "";
  return `
# Background on this learner (private)
Notes from earlier sessions, partly in Japanese. They are only for you, to choose topics, angles and kinds of questions. Never mention them, never diagnose or coach, never turn the conversation into a drill, and always speak English.
${parts.join("\n")}
How to use this:
- If they tend to give short or unfinished answers, ask open questions that need a few connected sentences (reasons, comparisons, "walk me through...", "what would happen if..."), and give them room to finish.
- Create natural moments where the key point from last time would help (for example, a question whose best answer uses that structure), then simply respond to what they say.
- Build on their strengths and background so they have things they want to say.
`;
}

/** 会話 AI（OpenAI Realtime）への指示文 */
export function buildInstructions(opts: {
  profile: Profile;
  scenario: Scenario;
  expressions: Pick<Expression, "text" | "scene" | "kind">[];
  focus: string;
  /** 繰り返しているミスの傾向（表示名） */
  patterns?: string[];
  homework?: Homework | null;
}) {
  const { profile, scenario, expressions, focus, patterns = [], homework = null } = opts;
  const targets = EXPRESSION_KINDS.map((kind) => {
    const items = expressions.filter((e) => e.kind === kind).map((e) => `- "${e.text}" (${e.scene})`);
    return `${EXPRESSION_KIND_PROMPT[kind]}:\n${items.join("\n") || "- (none)"}`;
  }).join("\n");
  const learner = [
    profile.about && `About them: ${profile.about}`,
    profile.goals && `Their goal: ${profile.goals}`,
    profile.interests && `Interests: ${profile.interests}`,
    `This week's focus: ${focus}`,
  ].filter(Boolean);

  return `# Role
${scenario.role}

# Learner
A Japanese learner practicing spoken English for business and future overseas projects.
${learner.join("\n")}
${background(profile, patterns, homework)}
# How to speak
- ${levelGuidance(profile.level)}
- Stay fully in character as a native English speaker in a real situation. Make it a real two-way conversation, not an interview: the learner should do most of the talking (about 60%), but you also contribute.
- Keep your turns short: usually 2-3 sentences, then hand the turn back. Never give a monologue.
- A typical turn: react to what they actually said, sometimes add your own view or experience, then ask one question that goes deeper ("why", "for example", "what would you do if...") or offers a different angle.
- Model good English implicitly (recasts): when the learner's idea came out awkwardly or with an error, naturally restate the idea in clear, natural wording as part of your reaction (e.g. "So you're saying Japanese manufacturers are strong but lack a supporting ecosystem — interesting."). Do this in roughly one of every two or three turns, only when it adds value, and never draw attention to it.
- When you share your own view, use expressions a professional would actually use, so the learner hears good models in context.
- If the learner is searching for a word (long hesitation, "how do you say...", or Japanese), offer the word briefly as a suggestion (e.g. "Manufacturing?") and let them continue in their own words.
- If you did not catch part of what they said, ask the way a colleague would ("Sorry, you said the deadline was...?").
- Never correct explicitly, never say "you should say...", and never ask the learner to repeat anything. Detailed feedback is given after the session.
- If the learner speaks Japanese, gently ask them to try in English.
- Start the conversation yourself with a natural opening line for this situation.

# Target expressions
The learner wants to practice using these on their own today.
${targets}
Your job is to make each one the most natural thing for the learner to say at some point:
- Plan where each could fit and steer the conversation there: set up a situation, question or claim where it is the natural reply (for example, make a proposal they will want to push back on, or ask about the very thing the word names). Spread them over the conversation and move on once one has had its chance.
- Never say a target expression yourself — not in your own lines, not in a recast, not when offering a word. Use different wording instead.
- Never mention the list, never hint at a specific word or phrase, and never ask them to use one.`;
}

/** かな・漢字・全角記号 */
const JAPANESE = /[　-ヿ一-鿿＀-￯]/;

/**
 * 会話中の文字起こし（gpt-4o-transcribe）に渡す文脈: 場面と学習者の分野。
 * 今日の表現は入れない（聞き取りが表現の方へ寄り、言っていないのに「使えた」と判定されるため）
 */
export function buildTranscriptionPrompt(opts: { scenario: Scenario; profile: Profile }) {
  const { scenario, profile } = opts;
  const partner = scenario.role.split(/(?<=\.)\s/)[0].replace(/^You are /, "The other speaker is ");
  // 日本語が混ざると英語の聞き取りを乱しうるので、英語で書かれたものだけ使う
  const about = [profile.about, profile.interests].filter((x) => x && !JAPANESE.test(x)).join(" ");
  return [
    "A spoken business role-play between a Japanese learner of English and a native speaker.",
    partner,
    about && `About the learner: ${about.slice(0, 300)}`,
    "Transcribe exactly what is said, keeping the learner's grammar mistakes, false starts and repetitions. Do not correct or complete their sentences.",
  ]
    .filter(Boolean)
    .join(" ");
}
