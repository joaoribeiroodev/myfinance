"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { emitDataChanged } from "@/lib/events";
import { currency, localDateToISO, todayInputValue } from "@/lib/format";
import { BottomSheet } from "./ui/BottomSheet";
import clsx from "clsx";

interface Category {
  id: string;
  name: string;
  type: "INCOME" | "EXPENSE";
}

interface Card {
  id: string;
  name: string;
}

// Mesmos campos/funções do formulário da tela de Lançamentos (data, cartão,
// parcelas) — antes esse formulário "rápido" (usado pelo botão flutuante no
// mobile) só tinha valor/descrição/categoria, então uma despesa no cartão
// feita por aqui não tinha como ser vinculada nem parcelada.
export function QuickAddSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [saving, setSaving] = useState(false);

  const emptyForm = {
    type: "EXPENSE" as "INCOME" | "EXPENSE",
    amount: "",
    description: "",
    date: todayInputValue(),
    categoryId: "",
    creditCardId: "",
    installments: "1",
  };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (open) {
      api<Category[]>("/categories").then(setCategories).catch(() => {});
      api<any[]>("/credit-cards").then((c) => setCards(c.map((x) => ({ id: x.id, name: x.name })))).catch(() => {});
      setForm(emptyForm);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function suggest(desc: string) {
    if (!desc || desc.length < 3) return;
    try {
      const { categoryId: suggested } = await api<{ categoryId: string | null }>(
        `/transactions/suggest-category?description=${encodeURIComponent(desc)}`
      );
      if (suggested) setForm((f) => ({ ...f, categoryId: suggested }));
    } catch {}
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.amount || !form.description) return;
    const installments = Math.max(1, Number(form.installments) || 1);
    setSaving(true);
    try {
      await api("/transactions", {
        method: "POST",
        body: JSON.stringify({
          type: form.type,
          amount: Number(form.amount.replace(",", ".")),
          description: form.description,
          categoryId: form.categoryId || null,
          date: localDateToISO(form.date),
          creditCardId: form.creditCardId || null,
          recurrenceType: installments > 1 ? "INSTALLMENT" : "NONE",
          installmentTotal: installments > 1 ? installments : undefined,
          installmentNumber: installments > 1 ? 1 : undefined,
          paymentMethod: form.creditCardId ? "CREDIT_CARD" : "OTHER",
        }),
      });
      setForm(emptyForm);
      emitDataChanged();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Novo lançamento">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setForm({ ...form, type: "EXPENSE" })}
            className={clsx(
              "py-3 rounded-xl text-sm font-semibold transition-all",
              form.type === "EXPENSE" ? "bg-expense-500 text-white shadow-sm" : "bg-gray-100 dark:bg-white/5 text-gray-500"
            )}
          >
            💸 Despesa
          </button>
          <button
            type="button"
            onClick={() => setForm({ ...form, type: "INCOME" })}
            className={clsx(
              "py-3 rounded-xl text-sm font-semibold transition-all",
              form.type === "INCOME" ? "bg-income-500 text-white shadow-sm" : "bg-gray-100 dark:bg-white/5 text-gray-500"
            )}
          >
            💰 Receita
          </button>
        </div>

        <div>
          <label className="label">Valor</label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">R$</span>
            <input
              className="input !pl-10 text-lg font-semibold"
              placeholder="0,00"
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              autoFocus
              required
            />
          </div>
        </div>

        <div>
          <label className="label">Descrição</label>
          <input
            className="input"
            placeholder="Ex: Mercado, Uber, Salário..."
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            onBlur={(e) => suggest(e.target.value)}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Categoria</label>
            <select
              className="input"
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            >
              <option value="">Sem categoria</option>
              {categories
                .filter((c) => c.type === form.type)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="label">Data</label>
            <input
              className="input"
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </div>
        </div>

        {form.type === "EXPENSE" && cards.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
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
            </div>
            <div>
              <label className="label">Parcelas</label>
              <input
                className="input"
                type="number"
                min={1}
                max={48}
                value={form.installments}
                onChange={(e) => setForm({ ...form, installments: e.target.value })}
              />
            </div>
          </div>
        )}
        {Number(form.installments) > 1 && (
          <p className="text-xs text-gray-400 -mt-2">
            Vai gerar {form.installments}x de{" "}
            {form.amount ? currency(Number(form.amount.replace(",", ".")) || 0) : "R$ 0,00"} nos próximos meses.
          </p>
        )}

        <button className="btn-primary w-full" disabled={saving}>
          {saving ? "Salvando..." : "Adicionar lançamento"}
        </button>
      </form>
    </BottomSheet>
  );
}
