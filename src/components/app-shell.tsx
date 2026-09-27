"use client";

import { BookOpenText, Home, Map, Sprout, UserRound, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mascot } from "./illustrations";

const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "ホーム", icon: Home },
  { href: "/curriculum", label: "カリキュラム", icon: Map },
  { href: "/expressions", label: "表現", icon: BookOpenText },
  { href: "/progress", label: "成長記録", icon: Sprout },
  { href: "/profile", label: "プロフィール", icon: UserRound },
];

const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

/** 上部ナビ（PC）と下部タブバー（スマホ）。ログイン画面と会話画面では出さない */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname.startsWith("/login")) return <>{children}</>;
  const focusMode = pathname.startsWith("/session/new");

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-extrabold tracking-tight" aria-label="ホームへ">
            <Mascot size={32} />
            <span className="text-[15px]">
              Speaking<span className="text-accent"> Practice</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label="メイン">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-bold transition ${
                    active ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-fg"
                  }`}
                >
                  <Icon size={16} strokeWidth={2.4} />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {children}

      {!focusMode && (
        <nav
          aria-label="メイン"
          className="fixed inset-x-3 bottom-3 z-30 rounded-3xl border border-line bg-surface/90 px-1 pb-[max(env(safe-area-inset-bottom),0.25rem)] shadow-[var(--shadow-lift)] backdrop-blur-xl md:hidden"
        >
          <ul className="grid grid-cols-5">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-bold transition active:scale-95 ${
                      active ? "text-accent" : "text-muted"
                    }`}
                  >
                    <span
                      className={`inline-flex h-7 w-12 items-center justify-center rounded-full transition ${
                        active ? "bg-accent-soft" : ""
                      }`}
                    >
                      <Icon size={20} strokeWidth={active ? 2.6 : 2.1} />
                    </span>
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </>
  );
}
