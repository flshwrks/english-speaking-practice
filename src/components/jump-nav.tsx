"use client";

import { useEffect, useState } from "react";

/**
 * 長いページの目次（スマホで上に貼りつく）。いま読んでいる区切りを藍で示す。
 * items の id はページ内の要素の id。
 */
export function JumpNav({ items }: { items: { id: string; label: string }[] }) {
  const [current, setCurrent] = useState(items[0]?.id);

  useEffect(() => {
    const els = items.map((x) => document.getElementById(x.id)).filter((el) => el !== null);
    // 画面の上から 1/3 あたりを横切っている区切りを「いま読んでいるところ」とする
    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries.find((e) => e.isIntersecting);
        if (hit) setCurrent(hit.target.id);
      },
      { rootMargin: "-30% 0px -65% 0px" },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav
      aria-label="このページの中を移動"
      className="sticky top-[env(safe-area-inset-top)] z-10 -mx-4 mb-8 flex [scrollbar-width:none] gap-1 overflow-x-auto border-b border-line bg-bg/95 px-4 py-2 backdrop-blur sm:-mx-8 sm:px-8 lg:hidden"
    >
      {items.map((x) => (
        <a
          key={x.id}
          href={`#${x.id}`}
          aria-current={x.id === current ? "location" : undefined}
          onClick={() => {
            setCurrent(x.id);
            // 飛び先が折りたたみ（会話の全文など）なら開いておく
            const el = document.getElementById(x.id);
            if (el instanceof HTMLDetailsElement) el.open = true;
          }}
          className={`shrink-0 rounded-full px-3 py-1 text-[13px] font-medium whitespace-nowrap transition-colors ${
            x.id === current ? "bg-primary-soft text-primary" : "text-fg-2 hover:bg-surface"
          }`}
        >
          {x.label}
        </a>
      ))}
    </nav>
  );
}
