"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { api } from "@/lib/api";
import { currency, fullDate } from "@/lib/format";
import { emitDataChanged, onDataChanged } from "@/lib/events";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Progress } from "@/components/ui/Progress";
import { StaggerList, StaggerItem } from "@/components/ui/PageTransition";

interface Goal {
  id: string;
  name: string;
  icon?: string;
  targetAmount: string | number;
  currentAmount: string | number;
  progressPercent: number;
  estimatedCompletionDate: string | null;
  status: string;
  monthlyTarget?: string | number | null;
  reminderDay?: number | null;
}

const emojiOptions = ["🐷", "✈️", "🏠", "🚗", "🎓", "💍", "🎉", "📱"];

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [contributeId, setContributeId] = useState<string | null>(null);
  const [contributeAmount, setContributeAmount] = useState("");
  const [contributeType, setContributeType] = useState<"CONTRIBUTION" | "WITHDRAWAL">("CONTRIBUTION");
  const [contributeError, setContributeError] = useState("");
  const [form, setForm] = useState({
    name: "",
    targetAmount: "",
    icon: "🐷",
    monthlyTarget: "",
    reminderDay: "",
  });

  async function load() {
    setGoals(await api<Goal[]>("/goals"));
    setLoading(false);
  }

  useEffect(() => {
    load();
    return onDataChanged(load);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await api("/goals", {
      method: "POST",
      body: JSON.stringify({
        name: form.name,
        icon: form.icon,
        targetAmount: Number(form.targetAmount.replace(",", ".")),
        monthlyTarget: form.monthlyTarget ? Number(form.monthlyTarget.replace(",", ".")) : null,
        reminderDay: form.reminderDay ? Number(form.reminderDay) : null,
      }),
    });
    setForm({ name: "", targetAmount: "", icon: "🐷", monthlyTarget: "", reminderDay: "" });
    setFormOpen(false);
    emitDataChanged();
  }

  async function handleContribute(e: React.FormEvent) {
    e.preventDefault();
    if (!contributeId) return;
    const amount = Number(contributeAmount.replace(",", "."));
    if (!amount) return;
    setContributeError("");
    try {
      await api(`/goals/${contributeId}/contributions`, {
        method: "POST",
        body: JSON.stringify({ amount, type: contributeType }),
      });
      setContributeAmount("");
      setContributeId(null);
      setContributeType("CONTRIBUTION");
      emitDataChanged();
    } catch (err: any) {
      setContributeError(err.message || "Erro ao registrar movimentação");
    }
  }

  async function handleTogglePause(g: Goal) {
    try {
      const nextStatus = g.status === "PAUSED" ? "IN_PROGRESS" : "PAUSED";
      await api(`/goals/${g.id}`, { method: "PUT", body: JSON.stringify({ status: nextStatus }) });
      emitDataChanged();
    } catch (err: any) {
      alert(err.message || "Erro ao pausar/retomar cofrinho");
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Excluir esse cofrinho? O histórico de aportes/retiradas também será perdido.")) return;
    try {
      await api(`/goals/${id}`, { method: "DELETE" });
      emitDataChanged();
    } catch (err: any) {
      alert(err.message || "Erro ao excluir cofrinho");
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <h1 className="text-xl lg:text-2xl font-extrabold tracking-tight">Cofrinhos</h1>
        <button onClick={() => setFormOpen(true)} className="btn-primary !px-4 !py-2.5 text-sm">
          + Criar
        </button>
      </header>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="skeleton h-36 rounded-2xl" />
          ))}
        </div>
      ) : goals.length === 0 ? (
        <div className="card text-center py-10 text-gray-400">
          <p className="text-3xl mb-2">🐷</p>
          <p className="text-sm">Crie seu primeiro cofrinho</p>
        </div>
      ) : (
        <StaggerList>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {goals.map((g) => (
              <StaggerItem key={g.id}>
                <div className={clsx("card", g.status === "PAUSED" && "opacity-60")}>
                  <div className="flex justify-between items-center mb-3">
                    <span className="font-semibold text-sm flex items-center gap-2">
                      <span className="text-xl">{g.icon}</span> {g.name}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="pill bg-gray-100 dark:bg-white/5 text-gray-500">{g.status}</span>
                      <button
                        onClick={() => handleDelete(g.id)}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-gray-300 hover:text-expense-600 hover:bg-expense-50 dark:hover:bg-expense-500/10"
                        aria-label="Excluir cofrinho"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  <Progress percent={g.progressPercent} color="brand" />
                  <p className="text-sm text-gray-500 my-2">
                    <span className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">{currency(Number(g.currentAmount))}</span> de{" "}
                    {currency(Number(g.targetAmount))} · {g.progressPercent}%
                  </p>
                  {g.estimatedCompletionDate && (
                    <p className="text-xs text-gray-400 mb-1">Previsão: {fullDate(g.estimatedCompletionDate)}</p>
                  )}
                  {(g.monthlyTarget || g.reminderDay) && (
                    <p className="text-xs text-gray-400 mb-3">
                      🔔 Guardar{g.monthlyTarget ? ` ${currency(Number(g.monthlyTarget))}` : ""}
                      {g.reminderDay ? ` todo dia ${g.reminderDay}` : ""}
                      {g.status === "PAUSED" ? " (pausado)" : ""}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => setContributeId(g.id)} className="btn-secondary flex-1 text-sm">
                      💰 Aportar
                    </button>
                    {g.status !== "COMPLETED" && (
                      <button onClick={() => handleTogglePause(g)} className="btn-ghost text-sm shrink-0">
                        {g.status === "PAUSED" ? "▶ Retomar" : "⏸ Pausar"}
                      </button>
                    )}
                  </div>
                </div>
              </StaggerItem>
            ))}
          </div>
        </StaggerList>
      )}

      <BottomSheet open={formOpen} onClose={() => setFormOpen(false)} title="Novo cofrinho">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Ícone</label>
            <div className="flex gap-2 flex-wrap">
              {emojiOptions.map((e) => (
                <button
                  type="button"
                  key={e}
                  onClick={() => setForm({ ...form, icon: e })}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg transition-all ${
                    form.icon === e ? "bg-brand-500 scale-105" : "bg-gray-100 dark:bg-white/5"
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Nome da meta</label>
            <input
              className="input"
              placeholder="Ex: Viagem para a praia"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="label">Valor alvo</label>
            <input
              className="input"
              placeholder="R$ 0,00"
              inputMode="decimal"
              value={form.targetAmount}
              onChange={(e) => setForm({ ...form, targetAmount: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Guardar por mês (opcional)</label>
              <input
                className="input"
                placeholder="R$ 0,00"
                inputMode="decimal"
                value={form.monthlyTarget}
                onChange={(e) => setForm({ ...form, monthlyTarget: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Dia do mês p/ lembrar</label>
              <input
                className="input"
                placeholder="Ex: 5"
                type="number"
                min={1}
                max={28}
                value={form.reminderDay}
                onChange={(e) => setForm({ ...form, reminderDay: e.target.value })}
              />
            </div>
          </div>
          <p className="text-[11px] text-gray-400 -mt-2">
            Se preenchido, você recebe um aviso no Telegram todo mês nesse dia pra guardar o valor.
          </p>
          <button className="btn-primary w-full">Criar cofrinho</button>
        </form>
      </BottomSheet>

      <BottomSheet
        open={!!contributeId}
        onClose={() => {
          setContributeId(null);
          setContributeError("");
          setContributeType("CONTRIBUTION");
        }}
        title="Movimentar cofrinho"
      >
        <form onSubmit={handleContribute} className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setContributeType("CONTRIBUTION")}
              className={`py-3 rounded-xl text-sm font-semibold transition-all ${
                contributeType === "CONTRIBUTION" ? "bg-income-500 text-white" : "bg-gray-100 dark:bg-white/5 text-gray-500"
              }`}
            >
              💰 Aportar
            </button>
            <button
              type="button"
              onClick={() => setContributeType("WITHDRAWAL")}
              className={`py-3 rounded-xl text-sm font-semibold transition-all ${
                contributeType === "WITHDRAWAL" ? "bg-expense-500 text-white" : "bg-gray-100 dark:bg-white/5 text-gray-500"
              }`}
            >
              🏃 Retirar
            </button>
          </div>
          <div>
            <label className="label">Valor</label>
            <input
              className="input text-lg font-semibold"
              placeholder="R$ 0,00"
              inputMode="decimal"
              autoFocus
              value={contributeAmount}
              onChange={(e) => setContributeAmount(e.target.value)}
              required
            />
          </div>
          {contributeError && <p className="text-sm text-expense-600">{contributeError}</p>}
          <button className="btn-primary w-full">
            {contributeType === "WITHDRAWAL" ? "Confirmar retirada" : "Confirmar aporte"}
          </button>
        </form>
      </BottomSheet>
    </div>
  );
}
