"use server";

import { revalidatePath } from "next/cache";
import { applyExpressionAction, EXPRESSION_ACTIONS, type ExpressionAction } from "@/lib/expressions";
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
