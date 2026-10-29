"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";
import { PageTransition } from "./ui/PageTransition";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthScreen = pathname === "/login";

  if (isAuthScreen) {
    return <PageTransition>{children}</PageTransition>;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 w-full min-w-0">
        <div className="max-w-5xl mx-auto w-full px-4 pt-[calc(1.25rem+var(--safe-top))] pb-28 md:pb-10 md:px-8 md:pt-8">
          <PageTransition>{children}</PageTransition>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
