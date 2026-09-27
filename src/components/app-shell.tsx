"use client";

import { BookOpenText, Home, LineChart, Map, UserRound, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./illustrations";

const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "ホーム", icon: Home },
  { href: "/curriculum", label: "カリキュラム", icon: Map },
  { href: "/expressions", label: "表現", icon: BookOpenText },
  { href: "/progress", label: "記録", icon: LineChart },
  { href: "/profile", label: "設定", icon: UserRound },
];

const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

/** 上部ナビ（PC）と下部タブバー（スマホ）。ログイン画面と会話画面では出さない */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname.startsWith("/login")) return <>{children}</>;
  const focusMode = pathname.startsWith("/session/new");

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5" aria-label="ホームへ">
            <Logo size={22} />
            <span className="text-[15px] font-bold tracking-tight">Speaking Practice</span>
          </Link>
          <nav className="hidden h-full items-stretch gap-6 md:flex" aria-label="メイン">
            {NAV.map(({ href, label }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex items-center text-sm transition-colors ${
                    active ? "font-bold text-fg" : "text-muted hover:text-fg"
                  }`}
                >
                  {label}
                  {active && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-accent" />}
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
          className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        >
          <ul className="grid grid-cols-5">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={`relative flex flex-col items-center gap-1 pt-2.5 pb-2 text-[10px] ${
                      active ? "font-bold text-fg" : "text-muted"
                    }`}
                  >
                    {active && <span className="absolute inset-x-6 top-0 h-0.5 bg-accent" />}
                    <Icon size={20} strokeWidth={active ? 2 : 1.6} />
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
