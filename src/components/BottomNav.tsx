"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import { clearToken } from "@/lib/api";
import { BottomSheet } from "./ui/BottomSheet";
import { QuickAddSheet } from "./QuickAddSheet";

const primary = [
  { href: "/", label: "Início", icon: "🏠" },
  { href: "/transactions", label: "Extrato", icon: "🧾" },
];
const secondaryRight = [{ href: "/bills", label: "Contas", icon: "📅" }];

const moreLinks = [
  { href: "/budgets", label: "Orçamentos", icon: "🎯" },
  { href: "/goals", label: "Cofrinhos", icon: "🐷" },
  { href: "/cards", label: "Cartões", icon: "💳" },
  { href: "/recurring", label: "Recorrências", icon: "🔁" },
  { href: "/reports", label: "Relatórios", icon: "📁" },
  { href: "/settings", label: "Configurações", icon: "⚙️" },
];

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, [moreOpen]);

  function toggleDark() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("myfinance_theme", next ? "dark" : "light");
  }

  function logout() {
    clearToken();
    router.push("/login");
  }

  const moreActive = moreLinks.some((l) => l.href === pathname);

  function NavItem({ href, label, icon }: { href: string; label: string; icon: string }) {
    const active = pathname === href;
    return (
      <Link href={href} className="relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2">
        {active && (
          <motion.div
            layoutId="bottomnav-active"
            className="absolute top-0 w-10 h-1 rounded-full bg-brand-500"
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          />
        )}
        <span className={clsx("text-lg transition-transform", active && "scale-110")}>{icon}</span>
        <span className={clsx("text-[10px] font-medium", active ? "text-brand-600 dark:text-brand-400" : "text-gray-400")}>
          {label}
        </span>
      </Link>
    );
  }

  return (
    <>
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/90 dark:bg-surface-darkcard/90 backdrop-blur-xl border-t border-gray-100 dark:border-surface-darkborder shadow-nav flex items-stretch px-1"
        style={{ paddingBottom: "var(--safe-bottom)" }}
      >
        {primary.map((l) => (
          <NavItem key={l.href} {...l} />
        ))}

        <div className="flex-1 flex items-center justify-center">
          <button onClick={() => setAddOpen(true)} className="fab -translate-y-4" aria-label="Novo lançamento">
            +
          </button>
        </div>

        {secondaryRight.map((l) => (
          <NavItem key={l.href} {...l} />
        ))}

        <button
          onClick={() => setMoreOpen(true)}
          className="relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2"
        >
          {moreActive && (
            <motion.div
              layoutId="bottomnav-active"
              className="absolute top-0 w-10 h-1 rounded-full bg-brand-500"
            />
          )}
          <span className={clsx("text-lg", moreActive && "scale-110")}>⋯</span>
          <span className={clsx("text-[10px] font-medium", moreActive ? "text-brand-600 dark:text-brand-400" : "text-gray-400")}>
            Mais
          </span>
        </button>
      </nav>

      <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Mais opções">
        <div className="grid grid-cols-2 gap-3 mb-4">
          {moreLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setMoreOpen(false)}
              className="card-interactive flex flex-col items-center gap-2 py-5"
            >
              <span className="text-2xl">{l.icon}</span>
              <span className="text-sm font-medium">{l.label}</span>
            </Link>
          ))}
        </div>
        <div className="space-y-1 pt-2 border-t border-gray-100 dark:border-surface-darkborder">
          <button onClick={toggleDark} className="btn-ghost w-full justify-start">
            {dark ? "☀️ Modo claro" : "🌙 Modo escuro"}
          </button>
          <button onClick={logout} className="btn-ghost w-full justify-start text-expense-600">
            🚪 Sair da conta
          </button>
        </div>
      </BottomSheet>

      <QuickAddSheet open={addOpen} onClose={() => setAddOpen(false)} />
    </>
  );
}
