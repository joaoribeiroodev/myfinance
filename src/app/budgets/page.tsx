"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { currency, categoryIcon, currentMonthInputValue } from "@/lib/format";
import { emitDataChanged, onDataChanged } from "@/lib/events";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Progress } from "@/components/ui/Progress";
import { StaggerList, StaggerItem } from "@/components/ui/PageTransition";

interface Category {
  id: string;
  name: string;
  type: "INCOME" | "EXPENSE";
}

interface Budget {
  id: string;
  categoryId: string;
  category: Category;
  limitAmount: string | number;
  spent: number;
  usagePercent: number;
  exceeded: boolean;
}

export default function BudgetsPage() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ categoryId: "", limitAmount: "" });
  const month = currentMonthInputValue();

  async function load() {
    const data = await api<Budget[]>(`/budgets?month=${month}`);
    setBudgets(data);
    setLoading(false);
  }

  useEffect(() => {
    api<Category[]>("/categories").then((cats) => setCategories(cats.filter((c) => c.type === "EXPENSE")));
    load();
    return onDataChanged(load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await api("/budgets", {
      method: "POST",
      body: JSON.stringify({
        categoryId: form.categoryId,
        referenceMonth: month,
        limitAmount: Number(form.limitAmount.replace(",", ".")),
      }),
    });
    setForm({ categoryId: "", limitAmount: "" });
    setFormOpen(false);
    emitDataChanged();
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Excluir esse orçamento?")) return;
    try {
      await api(`/budgets/${id}`, { method: "DELETE" });
      emitDataChanged();
    } catch (err: any) {
      alert(err.message || "Erro ao excluir orçamento");
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold tracking-tight">Orçamentos</h1>
        <button onClick={() => setFormOpen(true)} className="btn-primary !px-4 !py-2.5 text-sm">
          + Definir
        </button>
      </header>
      <p className="text-sm text-gray-400">Tetos de gasto por categoria neste mês.</p>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[1, 2].map((i) => (
            <div key={i} className="skeleton h-28 rounded-2xl" />
          ))}
        </div>
      ) : budgets.length === 0 ? (
        <div className="card text-center py-10 text-gray-400">
          <p className="text-3xl mb-2">🎯</p>
          <p className="text-sm">Nenhum orçamento definido ainda</p>
        </div>
      ) : (
        <StaggerList>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {budgets.map((b) => (
              <StaggerItem key={b.id}>
                <div className="card">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-9 h-9 rounded-full bg-gray-100 dark:bg-white/5 flex items-center justify-center text-base">
                      {categoryIcon(b.category.name)}
                    </span>
                    <span className="font-semibold text-sm flex-1">{b.category.name}</span>
                    {b.exceeded && <span className="pill bg-expense-50 text-expense-600 dark:bg-expense-500/10">Excedido</span>}
                    <button
                      onClick={() => handleDelete(b.id)}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-gray-300 hover:text-expense-600 hover:bg-expense-50 dark:hover:bg-expense-500/10 shrink-0"
                      aria-label="Excluir orçamento"
                    >
                      ✕
                    </button>
                  </div>
                  <Progress percent={b.usagePercent} color={b.exceeded ? "expense" : b.usagePercent >= 80 ? "amber" : "brand"} />
                  <div className="flex justify-between mt-2 text-xs">
                    <span className="text-gray-400">{b.usagePercent}% utilizado</span>
                    <span className={b.exceeded ? "text-expense-600 font-semibold" : "text-gray-500"}>
                      {currency(b.spent)} / {currency(Number(b.limitAmount))}
                    </span>
                  </div>
                </div>
              </StaggerItem>
            ))}
          </div>
        </StaggerList>
      )}

      <BottomSheet open={formOpen} onClose={() => setFormOpen(false)} title="Definir orçamento">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Categoria</label>
            <select
              className="input"
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              required
            >
              <option value="">Selecione...</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Teto mensal</label>
            <input
              className="input"
              placeholder="R$ 0,00"
              inputMode="decimal"
              value={form.limitAmount}
              onChange={(e) => setForm({ ...form, limitAmount: e.target.value })}
              required
            />
          </div>
          <button className="btn-primary w-full">Salvar orçamento</button>
        </form>
      </BottomSheet>
    </div>
  );
}
