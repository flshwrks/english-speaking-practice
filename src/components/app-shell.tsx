"use client";

import { BookOpen, Home, LineChart, Route, Settings, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./illustrations";

type NavItem = { href: string; label: string; icon: LucideIcon };

const MAIN: NavItem[] = [
  { href: "/", label: "ホーム", icon: Home },
  { href: "/expressions", label: "表現", icon: BookOpen },
  { href: "/progress", label: "記録", icon: LineChart },
  { href: "/curriculum", label: "カリキュラム", icon: Route },
];
const SETTINGS: NavItem = { href: "/profile", label: "設定", icon: Settings };
// スマホのタブは4つ（カリキュラムはホームの「第n週」から入る）
const TABS: NavItem[] = [MAIN[0], MAIN[1], MAIN[2], SETTINGS];

const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" || pathname.startsWith("/session") : pathname.startsWith(href);

/**
 * PC: 左のサイドバー（ナビ・今週の位置・費用）。スマホ: 下のタブだけ（上部バーは置かない）。
 * 会話の準備・会話中は集中のためナビを出さない。
 */
export function AppShell({ children, status }: { children: React.ReactNode; status: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname.startsWith("/session/new")) return <>{children}</>;

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[232px] flex-col border-r border-line bg-sunken px-4 py-6 lg:flex">
        <Link href="/" className="mb-7 flex items-center gap-2 px-2" aria-label="ホームへ">
          <Logo size={20} />
          <span className="text-[15px] font-bold">Speaking Practice</span>
        </Link>
        <nav className="flex flex-col gap-0.5" aria-label="メイン">
          {MAIN.map((item) => (
            <SideLink key={item.href} item={item} active={isActive(pathname, item.href)} />
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-5">
          <div className="px-2">{status}</div>
          <SideLink item={SETTINGS} active={isActive(pathname, SETTINGS.href)} />
        </div>
      </aside>

      <div className="lg:pl-[232px]">{children}</div>

      <nav
        aria-label="メイン"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <ul className="grid grid-cols-4">
          {TABS.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-col items-center gap-0.5 pt-1.5 pb-1 text-[11px] transition-colors ${
                    active ? "font-bold text-primary" : "text-muted active:text-fg"
                  }`}
                >
                  <span
                    className={`flex h-7 w-14 items-center justify-center rounded-full transition-colors ${
                      active ? "bg-primary-soft" : ""
                    }`}
                  >
                    <Icon size={20} strokeWidth={active ? 2.25 : 1.75} />
                  </span>
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

function SideLink({ item: { href, label, icon: Icon }, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex h-9 items-center gap-2.5 rounded-lg px-2 text-sm transition-colors ${
        active ? "bg-primary-soft font-bold text-primary" : "text-fg-2 hover:bg-surface hover:text-fg active:bg-sunken"
      }`}
    >
      <Icon size={18} strokeWidth={active ? 2.25 : 1.75} />
      {label}
    </Link>
  );
}
