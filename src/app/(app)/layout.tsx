import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { ShellStatus } from "@/components/shell-status";

/** ログイン後の画面の枠（PC は左のサイドバー、スマホは下のタブ） */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <AppShell
      status={
        <Suspense>
          <ShellStatus />
        </Suspense>
      }
    >
      {children}
    </AppShell>
  );
}
