"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { clearToken } from "@/lib/api";

const links = [
  { href: "/", label: "Início", icon: "🏠" },
  { href: "/transactions", label: "Lançamentos", icon: "🧾" },
  { href: "/budgets", label: "Orçamentos", icon: "🎯" },
  { href: "/goals", label: "Cofrinhos", icon: "🐷" },
  { href: "/bills", label: "Contas", icon: "📅" },
  { href: "/cards", label: "Cartões", icon: "💳" },
  { href: "/recurring", label: "Recorrências", icon: "🔁" },
  { href: "/reports", label: "Relatórios", icon: "📁" },
  { href: "/settings", label: "Configurações", icon: "⚙️" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const isDark = localStorage.getItem("myfinance_theme") === "dark";
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

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

  return (
    <aside className="hidden md:flex w-64 shrink-0 border-r border-gray-100 dark:border-surface-darkborder p-5 flex-col sticky top-0 h-screen bg-white/60 dark:bg-surface-dark/60 backdrop-blur-xl">
      <div className="flex items-center gap-2 mb-8 px-2">
        <div className="w-9 h-9 rounded-xl bg-brand-gradient flex items-center justify-center text-white font-bold shadow-glow">
          $
        </div>
        <span className="text-lg font-extrabold tracking-tight">MyFinance</span>
      </div>

      <nav className="flex-1 space-y-1">
        {links.map((l) => {
          const active = pathname === l.href;
          return (
            <Link key={l.href} href={l.href} className="block relative">
              {active && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute inset-0 bg-brand-50 dark:bg-brand-500/15 rounded-xl"
                  transition={{ type: "spring", damping: 25, stiffness: 300 }}
                />
              )}
              <span
                className={`relative z-10 flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  active
                    ? "text-brand-700 dark:text-brand-300"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                }`}
              >
                <span className="text-base">{l.icon}</span>
                {l.label}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="space-y-1 pt-4 border-t border-gray-100 dark:border-surface-darkborder">
        <button
          onClick={toggleDark}
          className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5"
        >
          <span>{dark ? "☀️" : "🌙"}</span> {dark ? "Modo claro" : "Modo escuro"}
        </button>
        <button
          onClick={logout}
          className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-expense-600 hover:bg-expense-50 dark:hover:bg-expense-500/10"
        >
          <span>🚪</span> Sair
        </button>
      </div>
    </aside>
  );
}
