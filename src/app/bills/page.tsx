"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { api } from "@/lib/api";
import { currency, shortDate, categoryIcon, localDateToISO, todayInputValue } from "@/lib/format";
import { emitDataChanged, onDataChanged } from "@/lib/events";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { StaggerList, StaggerItem } from "@/components/ui/PageTransition";

interface Bill {
  id: string;
  description: string;
  amount: string | number;
  type: "INCOME" | "EXPENSE";
  dueDate: string;
  status: string;
}

const statusLabel: Record<string, string> = {
  PENDING: "Pendente",
  PAID: "Pago",
  OVERDUE: "Atrasado",
  CANCELED: "Cancelado",
};

const statusStyle: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-600 dark:bg-amber-500/10",
  PAID: "bg-income-50 text-income-600 dark:bg-income-500/10",
  OVERDUE: "bg-expense-50 text-expense-600 dark:bg-expense-500/10",
  CANCELED: "bg-gray-100 text-gray-400 dark:bg-white/5",
};

export default function BillsPage() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({
    description: "",
    amount: "",
    type: "EXPENSE" as "INCOME" | "EXPENSE",
    dueDate: todayInputValue(),
    reminderDays: "",
    customAlertAt: "",
  });

  async function load() {
    setBills(await api<Bill[]>("/bills"));
    setLoading(false);
  }

  useEffect(() => {
    load();
    return onDataChanged(load);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const reminderDaysBefore = form.reminderDays
      ? form.reminderDays
          .split(",")
          .map((d) => Number(d.trim()))
          .filter((d) => !isNaN(d) && d >= 0)
      : undefined;
    await api("/bills", {
      method: "POST",
      body: JSON.stringify({
        description: form.description,
        amount: Number(form.amount.replace(",", ".")),
        type: form.type,
        dueDate: localDateToISO(form.dueDate),
        reminderDaysBefore,
        // datetime-local ("YYYY-MM-DDTHH:mm") não tem fuso — o construtor de
        // Date interpreta como horário local corretamente (diferente de uma
        // string só-data, que vira UTC), então dá pra converter direto
        customAlertAt: form.customAlertAt ? new Date(form.customAlertAt).toISOString() : undefined,
      }),
    });
    setForm({ ...form, description: "", amount: "", reminderDays: "", customAlertAt: "" });
    setFormOpen(false);
    emitDataChanged();
  }

  async function handlePay(id: string) {
    try {
      await api(`/bills/${id}/pay`, { method: "POST" });
      emitDataChanged();
    } catch (err: any) {
      alert(err.message || "Erro ao marcar como pago");
    }
  }

  async function handleCancel(id: string) {
    if (!window.confirm("Cancelar essa conta? Ela fica registrada como cancelada, sem gerar lançamento.")) return;
    try {
      await api(`/bills/${id}/cancel`, { method: "POST" });
      emitDataChanged();
    } catch (err: any) {
      alert(err.message || "Erro ao cancelar conta");
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Excluir essa conta definitivamente?")) return;
    try {
      await api(`/bills/${id}`, { method: "DELETE" });
      emitDataChanged();
    } catch (err: any) {
      alert(err.message || "Erro ao excluir conta");
    }
  }

  const pending = bills.filter((b) => b.status === "PENDING" || b.status === "OVERDUE");
  const settled = bills.filter((b) => b.status === "PAID" || b.status === "CANCELED");

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold tracking-tight">Contas</h1>
        <button onClick={() => setFormOpen(true)} className="btn-primary !px-4 !py-2.5 text-sm">
          + Agendar
        </button>
      </header>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-16 rounded-2xl" />
          ))}
        </div>
      ) : bills.length === 0 ? (
        <div className="card text-center py-10 text-gray-400">
          <p className="text-3xl mb-2">📅</p>
          <p className="text-sm">Nenhuma conta agendada</p>
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 px-1 mb-1.5">Pendentes</p>
              <div className="card !p-0 overflow-hidden divide-y divide-gray-100 dark:divide-white/5">
                <StaggerList>
                  {pending.map((b) => (
                    <StaggerItem key={b.id}>
                      <div className="flex items-center gap-3 px-4 py-3">
                        <span className="w-10 h-10 rounded-full bg-gray-100 dark:bg-white/5 flex items-center justify-center text-lg shrink-0">
                          {categoryIcon(b.description)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{b.description}</p>
                          <p className="text-xs text-gray-400">{shortDate(b.dueDate)}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold">{currency(Number(b.amount))}</p>
                          <span className={clsx("pill mt-0.5", statusStyle[b.status])}>{statusLabel[b.status]}</span>
                        </div>
                        <button onClick={() => handlePay(b.id)} className="btn-secondary !px-3 !py-2 text-xs shrink-0">
                          Pagar
                        </button>
                        <button
                          onClick={() => handleCancel(b.id)}
                          className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-gray-300 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10"
                          aria-label="Cancelar"
                          title="Cancelar"
                        >
                          ⏸
                        </button>
                        <button
                          onClick={() => handleDelete(b.id)}
                          className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-gray-300 hover:text-expense-600 hover:bg-expense-50 dark:hover:bg-expense-500/10"
                          aria-label="Excluir"
                        >
                          ✕
                        </button>
                      </div>
                    </StaggerItem>
                  ))}
                </StaggerList>
              </div>
            </div>
          )}

          {settled.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 px-1 mb-1.5">Resolvidas</p>
              <div className="card !p-0 overflow-hidden divide-y divide-gray-100 dark:divide-white/5 opacity-70">
                {settled.map((b) => (
                  <div key={b.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="w-10 h-10 rounded-full bg-gray-100 dark:bg-white/5 flex items-center justify-center text-lg shrink-0">
                      {categoryIcon(b.description)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate line-through">{b.description}</p>
                      <p className="text-xs text-gray-400">{shortDate(b.dueDate)}</p>
                    </div>
                    <p className="text-sm font-semibold">{currency(Number(b.amount))}</p>
                    <span className={clsx("pill", statusStyle[b.status])}>{statusLabel[b.status]}</span>
                    <button
                      onClick={() => handleDelete(b.id)}
                      className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-gray-300 hover:text-expense-600 hover:bg-expense-50 dark:hover:bg-expense-500/10"
                      aria-label="Excluir"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <BottomSheet open={formOpen} onClose={() => setFormOpen(false)} title="Agendar vencimento">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setForm({ ...form, type: "EXPENSE" })}
              className={clsx(
                "py-3 rounded-xl text-sm font-semibold transition-all",
                form.type === "EXPENSE" ? "bg-expense-500 text-white" : "bg-gray-100 dark:bg-white/5 text-gray-500"
              )}
            >
              💸 A pagar
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, type: "INCOME" })}
              className={clsx(
                "py-3 rounded-xl text-sm font-semibold transition-all",
                form.type === "INCOME" ? "bg-income-500 text-white" : "bg-gray-100 dark:bg-white/5 text-gray-500"
              )}
            >
              💰 A receber
            </button>
          </div>
          <div>
            <label className="label">Descrição</label>
            <input
              className="input"
              placeholder="Ex: Aluguel, Internet..."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Valor</label>
              <input
                className="input"
                placeholder="0,00"
                inputMode="decimal"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="label">Vencimento</label>
              <input
                className="input"
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="label">Avisar quantos dias antes (opcional)</label>
            <input
              className="input"
              placeholder="Padrão configurado em Configurações"
              value={form.reminderDays}
              onChange={(e) => setForm({ ...form, reminderDays: e.target.value, customAlertAt: "" })}
              disabled={!!form.customAlertAt}
            />
            <p className="text-[11px] text-gray-400 mt-1">Ex: 3,1,0 — deixe vazio pra usar o padrão do Telegram</p>
          </div>
          <div>
            <label className="label">Ou alertar numa data/hora específica (opcional)</label>
            <input
              className="input"
              type="datetime-local"
              value={form.customAlertAt}
              onChange={(e) => setForm({ ...form, customAlertAt: e.target.value, reminderDays: "" })}
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Tipo um lembrete de calendário — se preenchido, ignora os "dias antes" e avisa exatamente nesse momento.
            </p>
          </div>
          <button className="btn-primary w-full">Agendar vencimento</button>
        </form>
      </BottomSheet>
    </div>
  );
}
