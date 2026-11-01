"use client";

import { useEffect, useState } from "react";
import dayjs from "dayjs";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { api } from "@/lib/api";
import { onDataChanged } from "@/lib/events";
import { currency, greeting, categoryIcon, shortDate } from "@/lib/format";
import { AnimatedCurrency, AnimatedPercent } from "@/components/ui/AnimatedNumber";
import { Progress } from "@/components/ui/Progress";
import { StaggerList, StaggerItem } from "@/components/ui/PageTransition";

interface Summary {
  period: string;
  totalIncome: number;
  totalExpense: number;
  balance: number;
  reservedInGoals: number;
  availableBalance: number;
  healthScore: number | null;
  budgetUsagePercent: number | null;
  hasProjectedRecurring: boolean;
  upcomingBills: { id: string; description: string; amount: number; dueDate: string }[];
  expensesByCategory: { category: string; total: number; percent: number }[];
  cashFlow: { date: string; income: number; expense: number; balance: number }[];
  monthItems: { id: string; description: string; amount: number; type: "INCOME" | "EXPENSE"; date: string; projected: boolean }[];
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="skeleton h-32 rounded-3xl" />
      <div className="grid grid-cols-2 gap-3">
        <div className="skeleton h-24 rounded-2xl" />
        <div className="skeleton h-24 rounded-2xl" />
      </div>
      <div className="skeleton h-56 rounded-2xl" />
    </div>
  );
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [month, setMonth] = useState(() => dayjs().format("YYYY-MM"));
  const [userName, setUserName] = useState<string | null>(null);

  function load() {
    api<Summary>(`/dashboard/summary?month=${month}-01`).then(setSummary).catch(() => {});
  }

  useEffect(() => {
    load();
    return onDataChanged(load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  useEffect(() => {
    api<{ name: string }>("/auth/me")
      .then((u) => setUserName(u.name?.split(" ")[0] ?? null))
      .catch(() => {});
  }, []);

  const maxMonth = dayjs().add(12, "month").format("YYYY-MM");
  const isMaxMonth = month === maxMonth;

  if (!summary) return <DashboardSkeleton />;

  const health =
    summary.healthScore === null
      ? { label: "Sem dados ainda", color: "text-gray-400", bar: "brand" as const }
      : summary.healthScore >= 70
      ? { label: "Saudável", color: "text-income-600 dark:text-income-400", bar: "income" as const }
      : summary.healthScore >= 40
      ? { label: "Atenção", color: "text-amber-500", bar: "amber" as const }
      : { label: "Crítico", color: "text-expense-600 dark:text-expense-400", bar: "expense" as const };

  return (
    <div className="space-y-5 animate-fade-up">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-400">
            {greeting()}
            {userName ? `, ${userName}` : ""} 👋
          </p>
          <h1 className="text-xl lg:text-2xl font-extrabold tracking-tight">Visão geral</h1>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-white/5 rounded-full px-1">
          <button
            onClick={() => setMonth(dayjs(month + "-01").subtract(1, "month").format("YYYY-MM"))}
            className="w-7 h-7 rounded-full flex items-center justify-center text-gray-500 hover:bg-white dark:hover:bg-white/10"
            aria-label="Mês anterior"
          >
            ‹
          </button>
          <span className="pill bg-transparent text-gray-600 dark:text-gray-300 capitalize !px-1.5">
            {dayjs(month + "-01").format("MMM/YYYY")}
          </span>
          <button
            onClick={() => setMonth(dayjs(month + "-01").add(1, "month").format("YYYY-MM"))}
            disabled={isMaxMonth}
            className="w-7 h-7 rounded-full flex items-center justify-center text-gray-500 hover:bg-white dark:hover:bg-white/10 disabled:opacity-30"
            aria-label="Próximo mês"
          >
            ›
          </button>
        </div>
      </header>

      {/* Duas colunas no desktop: coluna principal (saldo + lançamentos do
          mês) à esquerda, resumo (saúde/orçamento/vencimentos) numa barra
          lateral à direita — no mobile colapsa pra uma coluna só, na mesma
          ordem de leitura. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        <div className="lg:col-span-2 space-y-5">
          {/* Cartão de saldo estilo cartão bancário */}
          <div className="card-gradient animate-pop">
            <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
            <p className="text-sm text-white/70">Saldo disponível</p>
            <AnimatedCurrency
              value={summary.availableBalance}
              className="text-4xl lg:text-5xl font-extrabold tracking-tight tabular-nums block mt-1"
            />
            {summary.hasProjectedRecurring && (
              <p className="text-[11px] text-white/60 mt-1">
                Receitas/despesas abaixo incluem recorrências deste mês ainda não lançadas (projetado) — o saldo acima
                conta só o que já é real
              </p>
            )}
            {summary.reservedInGoals > 0 && (
              <p className="text-xs text-white/60 mt-1">
                + {currency(summary.reservedInGoals)} guardados em cofrinhos 🐷
              </p>
            )}
            <div className="flex gap-5 mt-5 relative z-10">
              <div>
                <p className="text-[11px] text-white/60 flex items-center gap-1">↑ Receitas</p>
                <p className="text-sm font-semibold tabular-nums">{currency(summary.totalIncome)}</p>
              </div>
              <div>
                <p className="text-[11px] text-white/60 flex items-center gap-1">↓ Despesas</p>
                <p className="text-sm font-semibold tabular-nums">{currency(summary.totalExpense)}</p>
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="font-semibold mb-3 text-sm">
              Receitas e despesas de {dayjs(month + "-01").format("MMMM/YYYY")}
            </h2>
            {summary.monthItems.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">Nada previsto pra esse mês.</p>
            ) : (
              <StaggerList>
                <ul className="divide-y divide-gray-100 dark:divide-white/5 max-h-80 overflow-y-auto">
                  {summary.monthItems.map((item) => (
                    <StaggerItem key={item.id}>
                      <li className="py-2.5 flex items-center gap-3">
                        <span className="w-9 h-9 rounded-full bg-gray-100 dark:bg-white/5 flex items-center justify-center text-base shrink-0">
                          {categoryIcon(item.description)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate flex items-center gap-1.5">
                            {item.description}
                            {item.projected && (
                              <span className="pill bg-gray-100 dark:bg-white/5 text-gray-400 !px-1.5 !py-0.5 text-[10px]">
                                projetado
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-gray-400">{shortDate(item.date)}</p>
                        </div>
                        <span
                          className={`text-sm font-semibold tabular-nums shrink-0 ${
                            item.type === "INCOME" ? "text-income-600 dark:text-income-400" : "text-expense-600 dark:text-expense-400"
                          }`}
                        >
                          {item.type === "INCOME" ? "+" : "-"}
                          {currency(item.amount)}
                        </span>
                      </li>
                    </StaggerItem>
                  ))}
                </ul>
              </StaggerList>
            )}
          </div>
        </div>

        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
            <div className="card">
              <p className="text-xs text-gray-400 mb-1">Saúde financeira</p>
              <p className={`text-2xl font-extrabold tabular-nums ${health.color}`}>
                {summary.healthScore === null ? "—" : <AnimatedPercent value={summary.healthScore} />}
                {summary.healthScore !== null && <span className="text-sm font-medium text-gray-400">/100</span>}
              </p>
              <Progress percent={summary.healthScore ?? 0} color={health.bar} className="mt-2" />
              <p className={`text-[11px] mt-1 font-medium ${health.color}`}>{health.label}</p>
            </div>
            <div className="card">
              <p className="text-xs text-gray-400 mb-1">Orçamento usado</p>
              <p className="text-2xl font-extrabold tabular-nums">
                {summary.budgetUsagePercent === null ? "—" : <AnimatedPercent value={summary.budgetUsagePercent} />}
                {summary.budgetUsagePercent !== null && <span className="text-sm font-medium text-gray-400">%</span>}
              </p>
              {summary.budgetUsagePercent !== null ? (
                <Progress
                  percent={summary.budgetUsagePercent}
                  color={summary.budgetUsagePercent >= 100 ? "expense" : summary.budgetUsagePercent >= 80 ? "amber" : "brand"}
                  className="mt-2"
                />
              ) : (
                <p className="text-[11px] mt-2 text-gray-400">Nenhum orçamento definido</p>
              )}
            </div>
          </div>

          <div className="card">
            <h2 className="font-semibold mb-3 text-sm">Próximos vencimentos</h2>
            {summary.upcomingBills.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">Nenhuma conta pendente. 🎉</p>
            ) : (
              <StaggerList>
                <ul className="divide-y divide-gray-100 dark:divide-white/5">
                  {summary.upcomingBills.map((b) => (
                    <StaggerItem key={b.id}>
                      <li className="py-3 flex items-center gap-3">
                        <span className="w-9 h-9 rounded-full bg-gray-100 dark:bg-white/5 flex items-center justify-center text-base">
                          {categoryIcon(b.description)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{b.description}</p>
                          <p className="text-xs text-gray-400">{shortDate(b.dueDate)}</p>
                        </div>
                        <span className="text-sm font-semibold tabular-nums">{currency(b.amount)}</span>
                      </li>
                    </StaggerItem>
                  ))}
                </ul>
              </StaggerList>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <h2 className="font-semibold mb-3 text-sm">Fluxo de caixa do mês</h2>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={summary.cashFlow}>
              <defs>
                <linearGradient id="inc" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0fd890" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#0fd890" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="exp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ff4066" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#ff4066" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => shortDate(d)} axisLine={false} tickLine={false} />
              {/* Dois eixos Y: o saldo acumulado (linha) cresce/diminui em
                  escala bem diferente dos valores diários de receita/despesa
                  (áreas) — no mesmo eixo, o saldo "esmagava" as áreas lá
                  embaixo perto de zero, dando a impressão de que o gráfico
                  não tinha dado nenhum mesmo quando tinha. */}
              <YAxis yAxisId="flow" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={34} />
              <YAxis yAxisId="balance" orientation="right" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={34} />
              <Tooltip formatter={(v: number) => currency(v)} labelFormatter={(d) => shortDate(d as string)} />
              <Area yAxisId="flow" type="monotone" dataKey="income" stroke="#0fd890" strokeWidth={2} fill="url(#inc)" name="Receita" />
              <Area yAxisId="flow" type="monotone" dataKey="expense" stroke="#ff4066" strokeWidth={2} fill="url(#exp)" name="Despesa" />
              <Line yAxisId="balance" type="monotone" dataKey="balance" stroke="#8405e0" strokeWidth={2} dot={false} name="Saldo acumulado" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h2 className="font-semibold mb-3 text-sm">Despesas por categoria</h2>
          <ResponsiveContainer width="100%" height={200}>
            {/* interval={0} força o Recharts a desenhar TODOS os rótulos do
                eixo — por padrão ele pula ticks que "não cabem" (nome de
                categoria + 5 barras num card estreito), o que parecia nome
                de categoria sumindo/trocando de posição entre uma carga e
                outra. angle+textAnchor evita sobreposição entre nomes. */}
            <BarChart data={summary.expensesByCategory} margin={{ bottom: 16 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
              <XAxis
                dataKey="category"
                tick={{ fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                interval={0}
                angle={-25}
                textAnchor="end"
                height={40}
              />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={34} />
              <Tooltip formatter={(v: number) => currency(v)} />
              <Bar dataKey="total" fill="#8405e0" radius={[8, 8, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {summary.expensesByCategory.length > 0 && (
        <div className="card">
          <h2 className="font-semibold mb-3 text-sm">Perfil de consumo</h2>
          <div className="space-y-3">
            {summary.expensesByCategory
              .sort((a, b) => b.total - a.total)
              .map((c) => (
                <div key={c.category}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="flex items-center gap-2">
                      <span>{categoryIcon(c.category)}</span> {c.category}
                    </span>
                    <span className="text-gray-400">
                      {currency(c.total)} · <span className="font-semibold text-gray-600 dark:text-gray-300">{c.percent}%</span>
                    </span>
                  </div>
                  <Progress percent={c.percent} color="brand" />
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
