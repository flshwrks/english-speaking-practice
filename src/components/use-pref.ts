"use client";

import { useCallback, useSyncExternalStore } from "react";

// 端末ごとの小さな好み（聞き取りモード・会話の長さなど）を localStorage に保存する。
// サーバー描画では既定値を返すので、読み込み後に表示が食い違うことがない
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => void listeners.delete(cb);
};

export function usePref<T extends string>(key: string, allowed: readonly T[], fallback: T) {
  const read = () => {
    try {
      const v = localStorage.getItem(key);
      return allowed.includes(v as T) ? (v as T) : fallback;
    } catch {
      return fallback;
    }
  };
  const value = useSyncExternalStore(subscribe, read, () => fallback);
  const set = useCallback(
    (v: T) => {
      try {
        localStorage.setItem(key, v);
      } catch {}
      listeners.forEach((l) => l());
    },
    [key],
  );
  return [value, set] as const;
}

/** 読み込み後（クライアント）なら true。サーバー描画と値が変わる表示を読み込み後に出すため */
export const useMounted = () =>
  useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
