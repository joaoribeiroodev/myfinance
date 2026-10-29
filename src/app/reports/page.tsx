"use client";

import { useState } from "react";
import dayjs from "dayjs";
import { API_URL, getToken } from "@/lib/api";
import { StaggerList, StaggerItem } from "@/components/ui/PageTransition";

function presetRange(preset: string) {
  const now = new Date();
  if (preset === "month") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { from, to };
  }
  if (preset === "semester") {
    const startMonth = now.getMonth() < 6 ? 0 : 6;
    const from = new Date(now.getFullYear(), startMonth, 1);
    const to = new Date(now.getFullYear(), startMonth + 6, 0);
    return { from, to };
  }
  return { from: new Date(now.getFullYear(), 0, 1), to: new Date(now.getFullYear(), 11, 31) };
}

const options = [
  { key: "month", icon: "📅", title: "Orçamento mensal", desc: "Mês corrente, completo" },
  { key: "semester", icon: "🗓️", title: "Orçamento semestral", desc: "Últimos/próximos 6 meses" },
  { key: "year", icon: "📆", title: "Orçamento anual", desc: "Ano corrente completo" },
];

export default function ReportsPage() {
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [summaryMonth, setSummaryMonth] = useState(dayjs().format("YYYY-MM"));
  const [summaryLoading, setSummaryLoading] = useState<"pdf" | "xlsx" | null>(null);

  async function download(preset: string) {
    setLoadingKey(preset);
    try {
      const { from, to } = presetRange(preset);
      const qs = new URLSearchParams({ from: from.toISOString(), to: to.toISOString(), label: preset });
      const res = await fetch(`${API_URL}/reports/export/xlsx?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `myfinance_${preset}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setLoadingKey(null);
    }
  }

  // CSV cru do período — pra importar em outro sistema/planilha, sem o
  // formato visual do XLSX (ver /reports/export/csv no backend)
  async function downloadCsv(preset: string, e: React.MouseEvent) {
    e.stopPropagation();
    setLoadingKey(`${preset}-csv`);
    try {
      const { from, to } = presetRange(preset);
      const qs = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
      const res = await fetch(`${API_URL}/reports/export/csv?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `myfinance_${preset}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setLoadingKey(null);
    }
  }

  async function downloadMonthSummary(format: "pdf" | "xlsx") {
    setSummaryLoading(format);
    try {
      const qs = new URLSearchParams({ month: `${summaryMonth}-01`, format });
      const res = await fetch(`${API_URL}/reports/export/month-summary?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `myfinance_despesas_${summaryMonth}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setSummaryLoading(null);
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-extrabold tracking-tight">Relatórios</h1>
        <p className="text-sm text-gray-400 mt-1">
          Planilhas XLSX com lançamentos, resumo por categoria e totais do período.
        </p>
      </header>

      <StaggerList>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {options.map((o) => (
            <StaggerItem key={o.key}>
              <button
                onClick={() => download(o.key)}
                disabled={loadingKey !== null}
                className="card-interactive text-left w-full disabled:opacity-60"
              >
                <p className="text-2xl mb-2">{o.icon}</p>
                <p className="font-semibold text-sm">{o.title}</p>
                <p className="text-xs text-gray-400 mt-0.5">{o.desc}</p>
                <p className="text-xs font-medium text-brand-600 dark:text-brand-400 mt-3">
                  {loadingKey === o.key ? "Gerando..." : "Baixar XLSX ↓"}
                </p>
                <p
                  onClick={(e) => downloadCsv(o.key, e)}
                  className="text-xs font-medium text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 mt-1"
                >
                  {loadingKey === `${o.key}-csv` ? "Gerando..." : "Baixar CSV ↓"}
                </p>
              </button>
            </StaggerItem>
          ))}
        </div>
      </StaggerList>

      <div className="card space-y-3">
        <div>
          <h2 className="font-semibold text-sm">Despesas do mês</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Lista enxuta de cada despesa do mês (descrição e valor) + totais — inclui recorrências ainda não
            lançadas, pronta pra compartilhar.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label">Mês</label>
            <input
              className="input !w-auto"
              type="month"
              value={summaryMonth}
              onChange={(e) => setSummaryMonth(e.target.value)}
            />
          </div>
          <button
            onClick={() => downloadMonthSummary("pdf")}
            disabled={summaryLoading !== null}
            className="btn-secondary !px-4 !py-3 text-sm disabled:opacity-60"
          >
            {summaryLoading === "pdf" ? "Gerando..." : "📄 Baixar PDF"}
          </button>
          <button
            onClick={() => downloadMonthSummary("xlsx")}
            disabled={summaryLoading !== null}
            className="btn-secondary !px-4 !py-3 text-sm disabled:opacity-60"
          >
            {summaryLoading === "xlsx" ? "Gerando..." : "📊 Baixar Excel"}
          </button>
        </div>
      </div>
    </div>
  );
}
