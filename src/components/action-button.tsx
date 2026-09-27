"use client";

import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";

/**
 * フォーム送信ボタン。送信中はくるくるを出して押せなくする。
 * 1つのフォームに name/value 違いのボタンが並ぶときは、押されたボタンだけがくるくるになる。
 */
export function ActionButton({
  children,
  className = "btn",
  name,
  value,
  pendingText,
  ...rest
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "name" | "value"> & {
  name?: string;
  value?: string;
  /** 送信中に出す文言（なければ中身のまま） */
  pendingText?: string;
}) {
  const { pending, data } = useFormStatus();
  const mine = pending && (name ? data?.get(name) === value : true);
  return (
    <button {...rest} name={name} value={value} className={className} disabled={pending} aria-busy={mine}>
      {mine ? (
        <>
          <Loader2 size={15} className="animate-spin" />
          {pendingText ?? children}
        </>
      ) : (
        children
      )}
    </button>
  );
}
