"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

/**
 * フォーム送信ボタン。送信中はくるくるを出して押せなくする。
 * 1つのフォームに name/value 違いのボタンが並ぶときは、押されたボタンだけがくるくるになる。
 * confirmText を渡すと2度押し: 1回目はその文言に変わるだけで、3秒以内にもう一度押すと送信する（削除など）。
 */
export function ActionButton({
  children,
  className = "btn",
  name,
  value,
  pendingText,
  confirmText,
  onClick,
  ...rest
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "name" | "value"> & {
  name?: string;
  value?: string;
  /** 送信中に出す文言（なければ中身のまま） */
  pendingText?: string;
  /** 取り消せない操作の確認文言（例: 「削除する」） */
  confirmText?: string;
}) {
  const { pending, data } = useFormStatus();
  const [armed, setArmed] = useState(false);
  const mine = pending && (name ? data?.get(name) === value : true);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(timer);
  }, [armed]);

  return (
    <button
      {...rest}
      name={name}
      value={value}
      className={armed ? `${className} bg-accent-soft! text-accent!` : className}
      disabled={pending}
      aria-busy={mine}
      aria-label={armed ? confirmText : rest["aria-label"]}
      onClick={(e) => {
        onClick?.(e);
        if (confirmText && !armed) {
          e.preventDefault();
          setArmed(true);
        }
      }}
      onBlur={() => setArmed(false)}
    >
      {mine ? (
        <>
          <Loader2 size={15} className="animate-spin" />
          {pendingText ?? children}
        </>
      ) : armed ? (
        <span className="text-[13px] font-bold whitespace-nowrap">{confirmText}</span>
      ) : (
        children
      )}
    </button>
  );
}
