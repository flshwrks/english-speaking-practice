"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addExpression,
  applyExpressionAction,
  EXPRESSION_ACTIONS,
  inferKind,
  type ExpressionAction,
} from "@/lib/expressions";
import { nextCard } from "@/lib/cards";
import { updateProfileQuery } from "@/lib/lesson";
import { getScenario } from "@/lib/scenarios";
import { requestAnalysis } from "@/lib/session";

/** 表現の手動操作（フォームの name="action" に adopt / master / delete） */
export async function expressionAction(formData: FormData) {
  const action = String(formData.get("action")) as ExpressionAction;
  if (!EXPRESSION_ACTIONS.includes(action)) return;
  await applyExpressionAction(Number(formData.get("id")), action);
  revalidateExpressions();
}

function revalidateExpressions() {
  revalidatePath("/expressions");
  revalidatePath("/session/[id]", "page");
}

/** FB の「覚える表現」を追加する（画面で bind した表現データをそのまま受け取る） */
export async function addFeedbackExpression(expression: unknown) {
  await addExpression(expression, "feedback");
  revalidateExpressions();
}

/** 表現リストの手入力フォームから追加する。種類の指定がなければ語数で判定する */
export async function addManualExpression(formData: FormData) {
  const text = String(formData.get("text") ?? "");
  const kind = String(formData.get("kind") ?? "");
  await addExpression(
    {
      text,
      meaning: formData.get("meaning"),
      example: formData.get("example") ?? undefined,
      kind: kind || inferKind(text),
    },
    "manual",
  );
  revalidateExpressions();
}

export async function retryAnalysis(formData: FormData) {
  const id = Number(formData.get("id"));
  await requestAnalysis(id);
  revalidatePath(`/session/${id}`);
}

export async function saveProfile(formData: FormData) {
  await updateProfileQuery({
    about: String(formData.get("about") ?? ""),
    goals: String(formData.get("goals") ?? ""),
    interests: String(formData.get("interests") ?? ""),
    level: Number(formData.get("level")),
  });
  revalidatePath("/profile");
  // 保存できたことを画面に出すため、印を付けて同じ画面に戻す
  redirect("/profile?saved=1");
}

/** 準備画面の「別のお題にする」: 用意したカードの次のものに切り替えて、準備画面を開き直す */
export async function newCardAction(scenarioId: string, currentCardId: number) {
  const scenario = getScenario(scenarioId);
  if (!scenario || scenario.noCard) return;
  const card = await nextCard(scenario.id, currentCardId);
  if (card) redirect(`/session/new?scenario=${scenario.id}&card=${card.id}`);
}
