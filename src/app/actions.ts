"use server";

import { revalidatePath } from "next/cache";
import { addExpression, applyExpressionAction, EXPRESSION_ACTIONS, type ExpressionAction } from "@/lib/expressions";
import { updateProfileQuery } from "@/lib/lesson";
import { requestAnalysis } from "@/lib/session";

/** 表現の手動操作（フォームの name="action" に adopt / master / delete） */
export async function expressionAction(formData: FormData) {
  const action = String(formData.get("action")) as ExpressionAction;
  if (!EXPRESSION_ACTIONS.includes(action)) return;
  await applyExpressionAction(Number(formData.get("id")), action);
  revalidatePath("/expressions");
  revalidatePath("/session/[id]", "page");
}

/** 表現を追加する（フィードバックの「＋追加」: 各項目は hidden、表現リストの手入力フォーム: 入力欄） */
export async function addExpressionAction(formData: FormData) {
  const get = (k: string) => String(formData.get(k) ?? "").trim() || undefined;
  const text = get("text");
  const meaning = get("meaning");
  if (!text || !meaning) return;
  await addExpression(
    {
      text,
      meaning,
      example: get("example"),
      scene: get("scene"),
      category: get("category"),
      // 種類の指定がなければ、3語以内を単語・熟語とみなす
      kind: get("kind") ?? (text.split(/\s+/).length <= 3 ? "word" : "phrase"),
    },
    formData.get("source") === "manual" ? "manual" : "feedback",
  );
  revalidatePath("/expressions");
  revalidatePath("/session/[id]", "page");
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
}
