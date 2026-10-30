"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { api } from "@/lib/api";
import { currency, categoryIcon } from "@/lib/format";
import { emitDataChanged, onDataChanged } from "@/lib/events";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { StaggerList, StaggerItem } from "@/components/ui/PageTransition";

interface Category {
  id: string;
  name: string;
  type: "INCOME" | "EXPENSE";
}

interface RecurringTemplate {
  id: string;
  description: string;
  amount: string | number;
  type: "INCOME" | "EXPENSE";
  categoryId?: string | null;
  dayOfMonth: number;
  active: boolean;
  isSubscription: boolean;
  lastGeneratedAt: string | null;
  alertDaysBefore?: number | null;
  alertTimeOfDay?: string | null;
  creditCardId?: string | null;
}

export default function RecurringPage() {
  const [items, setItems] = useState<RecurringTemplate[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [cards, setCards] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const emptyForm = {
    description: "",
    amount: "",
    type: "EXPENSE" as "INCOME" | "EXPENSE",
    categoryId: "",
    dayOfMonth: "5",
    isSubscription: true,
    alertDaysBefore: "",
    alertTimeOfDay: "",
    creditCardId: "",
  };
  const [form, setForm] = useState(emptyForm);

  async function load() {
    setItems(await api<RecurringTemplate[]>("/recurring-templates"));
    setLoading(false);
  }

  useEffect(() => {
    api<Category[]>("/categories").then(setCategories).catch(() => {});
    api<any[]>("/credit-cards").then((c) => setCards(c.map((x) => ({ id: x.id, name: x.name })))).catch(() => {});
    load();
    return onDataChanged(load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      description: form.description,
      amount: Number(form.amount.replace(",", ".")),
      type: form.type,
      categoryId: form.categoryId || null,
      dayOfMonth: Number(form.dayOfMonth),
      isSubscription: form.isSubscription,
      alertDaysBefore: form.alertDaysBefore ? Number(form.alertDaysBefore) : null,
      alertTimeOfDay: form.alertDaysBefore && form.alertTimeOfDay ? form.alertTimeOfDay : null,
      creditCardId: form.type === "EXPENSE" && form.creditCardId ? form.creditCardId : null,
    };

    if (editingId) {
      await api(`/recurring-templates/${editingId}`, { method: "PUT", body: JSON.stringify(payload) });
    } else {
      await api("/recurring-templates", { method: "POST", body: JSON.stringify(payload) });
    }
    closeForm();
    emitDataChanged();
  }

  function openEdit(t: RecurringTemplate) {
    setEditingId(t.id);
    setForm({
      description: t.description,
      amount: String(Number(t.amount)).replace(".", ","),
      type: t.type,
      categoryId: t.categoryId ?? "",
      dayOfMonth: String(t.dayOfMonth),
      isSubscription: t.isSubscription,
      alertDaysBefore: t.alertDaysBefore != null ? String(t.alertDaysBefore) : "",
      alertTimeOfDay: t.alertTimeOfDay ?? "",
      creditCardId: t.creditCardId ?? "",
    });
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  async function handleToggle(id: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    try {
      await api(`/recurring-templates/${id}/toggle`, { method: "POST" });
      emitDataChanged();
    } catch (err: any) {
      alert(err.message || "Erro ao pausar/retomar recorrência");
    }
  }

  async function handleDelete(id: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    if (!window.confirm("Excluir essa recorrência? Lançamentos/contas já gerados não são afetados.")) return;
    try {
      await api(`/recurring-templates/${id}`, { method: "DELETE" });
      emitDataChanged();
    } catch (err: any) {
      alert(err.message || "Erro ao excluir recorrência");
    }
  }

  return (
    <div className="space-y-5 lg:max-w-4xl lg:mx-auto">
      <header className="flex items-center justify-between">
        <h1 className="text-xl lg:text-2xl font-extrabold tracking-tight">Recorrências</h1>
        <button
          onClick={() => {
            setEditingId(null);
            setForm(emptyForm);
            setFormOpen(true);
          }}
          className="btn-primary !px-4 !py-2.5 text-sm"
        >
          + Nova
        </button>
      </header>
      <p className="text-sm text-gray-400">
        Assinaturas, aluguel, salário fixo... todo dia 1 o sistema gera automaticamente o lançamento ou a conta.
      </p>

      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="skeleton h-16 rounded-2xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="card text-center py-10 text-gray-400">
          <p className="text-3xl mb-2">🔁</p>
          <p className="text-sm">Nenhuma recorrência cadastrada</p>
        </div>
      ) : (
        <div className="card !p-0 overflow-hidden divide-y divide-gray-100 dark:divide-white/5">
          <StaggerList>
            {items.map((t) => (
              <StaggerItem key={t.id}>
                <div
                  onClick={() => openEdit(t)}
                  className={clsx(
                    "flex items-center gap-3 px-4 py-3 cursor-pointer active:bg-gray-50 dark:active:bg-white/5 transition-colors",
                    !t.active && "opacity-50"
                  )}
                >
                  <span className="w-10 h-10 rounded-full bg-gray-100 dark:bg-white/5 flex items-center justify-center text-lg shrink-0">
                    {t.isSubscription ? "📱" : categoryIcon(t.description)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{t.description}</p>
                    <p className="text-xs text-gray-400">Todo dia {t.dayOfMonth}</p>
                  </div>
                  <span
                    className={clsx(
                      "text-sm font-bold shrink-0",
                      t.type === "INCOME" ? "text-income-600 dark:text-income-400" : "text-expense-600 dark:text-expense-400"
                    )}
                  >
                    {currency(Number(t.amount))}
                  </span>
                  <button
                    onClick={(e) => handleToggle(t.id, e)}
                    className={clsx(
                      "shrink-0 w-11 h-6 rounded-full relative transition-colors",
                      t.active ? "bg-brand-500" : "bg-gray-200 dark:bg-white/10"
                    )}
                    aria-label="Pausar/retomar"
                  >
                    <span
                      className={clsx(
                        "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform",
                        t.active && "translate-x-5"
                      )}
                    />
                  </button>
                  <button
                    onClick={(e) => handleDelete(t.id, e)}
                    className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-gray-300 hover:text-expense-600 hover:bg-expense-50 dark:hover:bg-expense-500/10"
                  >
                    ✕
                  </button>
                </div>
              </StaggerItem>
            ))}
          </StaggerList>
        </div>
      )}

      <BottomSheet open={formOpen} onClose={closeForm} title={editingId ? "Editar recorrência" : "Nova recorrência"}>
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
              💸 Despesa
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, type: "INCOME" })}
              className={clsx(
                "py-3 rounded-xl text-sm font-semibold transition-all",
                form.type === "INCOME" ? "bg-income-500 text-white" : "bg-gray-100 dark:bg-white/5 text-gray-500"
              )}
            >
              💰 Receita
            </button>
          </div>
          <div>
            <label className="label">Descrição</label>
            <input
              className="input"
              placeholder="Ex: Netflix, Aluguel, Salário..."
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
              <label className="label">Dia do mês</label>
              <input
                className="input"
                type="number"
                min={1}
                max={28}
                value={form.dayOfMonth}
                onChange={(e) => setForm({ ...form, dayOfMonth: e.target.value })}
                required
              />
            </div>
          </div>
          <div>
            <label className="label">Categoria</label>
            <select
              className="input"
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            >
              <option value="">Nenhuma</option>
              {categories.filter((c) => c.type === form.type).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <input
              type="checkbox"
              checked={form.isSubscription}
              onChange={(e) => setForm({ ...form, isSubscription: e.target.checked })}
              className="rounded"
            />
            É uma assinatura (app, streaming...)
          </label>

          {form.type === "EXPENSE" && cards.length > 0 && (
            <div>
              <label className="label">Cartão (opcional)</label>
              <select
                className="input"
                value={form.creditCardId}
                onChange={(e) => setForm({ ...form, creditCardId: e.target.value })}
              >
                <option value="">Nenhum</option>
                {cards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-gray-400 mt-1">
                Toda conta gerada todo mês por essa recorrência já nasce vinculada a esse cartão.
              </p>
            </div>
          )}

          {form.type === "EXPENSE" && (
            <div>
              <label className="label">Alerta no Telegram (opcional)</label>
              <div className="grid grid-cols-2 gap-3">
                <input
                  className="input"
                  type="number"
                  min={0}
                  placeholder="Dias antes"
                  value={form.alertDaysBefore}
                  onChange={(e) => setForm({ ...form, alertDaysBefore: e.target.value })}
                />
                <input
                  className="input"
                  type="time"
                  value={form.alertTimeOfDay}
                  onChange={(e) => setForm({ ...form, alertTimeOfDay: e.target.value })}
                  disabled={!form.alertDaysBefore}
                />
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                Tipo um lembrete recorrente de calendário — a cada execução mensal, avisa esses dias antes do
                vencimento gerado, nesse horário. Deixe vazio pra usar o padrão de Configurações.
              </p>
            </div>
          )}

          <button className="btn-primary w-full">{editingId ? "Salvar alterações" : "Salvar recorrência"}</button>
        </form>
      </BottomSheet>
    </div>
  );
}
