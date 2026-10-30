"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { api } from "@/lib/api";
import { currency, fullDate } from "@/lib/format";
import { emitDataChanged, onDataChanged } from "@/lib/events";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Progress } from "@/components/ui/Progress";
import { StaggerList, StaggerItem } from "@/components/ui/PageTransition";

interface CreditCard {
  id: string;
  name: string;
  brand?: string | null;
  limitAmount: string | number;
  closingDay: number;
  dueDay: number;
  color: string;
  active: boolean;
  currentInvoice: {
    committed: number;
    limitUsed: number;
    available: number;
    usagePercent: number;
    cycleEnd: string;
  };
}

interface InvoiceItem {
  id: string;
  kind: "transaction" | "bill";
  description: string;
  amount: number;
  date: string;
  type: "INCOME" | "EXPENSE";
  category: string | null;
  installmentNumber: number | null;
  installmentTotal: number | null;
  pending: boolean;
}

interface InvoiceDetail {
  card: CreditCard;
  committed: number;
  limitUsed: number;
  available: number;
  usagePercent: number;
  items: InvoiceItem[];
}

export default function CardsPage() {
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailCard, setDetailCard] = useState<CreditCard | null>(null);
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const emptyForm = {
    name: "",
    brand: "",
    limitAmount: "",
    closingDay: "5",
    dueDay: "12",
  };
  const [form, setForm] = useState(emptyForm);

  async function load() {
    setCards(await api<CreditCard[]>("/credit-cards"));
    setLoading(false);
  }

  useEffect(() => {
    load();
    return onDataChanged(load);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name: form.name,
      brand: form.brand || undefined,
      limitAmount: Number(form.limitAmount.replace(",", ".")),
      closingDay: Number(form.closingDay),
      dueDay: Number(form.dueDay),
    };

    if (editingId) {
      await api(`/credit-cards/${editingId}`, { method: "PUT", body: JSON.stringify(payload) });
    } else {
      await api("/credit-cards", { method: "POST", body: JSON.stringify(payload) });
    }
    closeForm();
    emitDataChanged();
  }

  function openEdit(c: CreditCard) {
    setEditingId(c.id);
    setForm({
      name: c.name,
      brand: c.brand ?? "",
      limitAmount: String(Number(c.limitAmount)).replace(".", ","),
      closingDay: String(c.closingDay),
      dueDay: String(c.dueDay),
    });
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  async function handleDelete(id: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    if (!window.confirm("Excluir esse cartão? Lançamentos já vinculados a ele não são apagados.")) return;
    try {
      await api(`/credit-cards/${id}`, { method: "DELETE" });
      emitDataChanged();
    } catch (err: any) {
      alert(err.message || "Erro ao excluir cartão");
    }
  }

  async function handleToggleActive(c: CreditCard, e?: React.MouseEvent) {
    e?.stopPropagation();
    try {
      await api(`/credit-cards/${c.id}`, { method: "PUT", body: JSON.stringify({ active: !c.active }) });
      emitDataChanged();
    } catch (err: any) {
      alert(err.message || "Erro ao ativar/desativar cartão");
    }
  }

  // Abre o detalhe do cartão — tudo que está consumindo o limite agora
  // (fatura atual + parcelas/recorrências futuras ainda em aberto, reais ou
  // ainda como conta pendente), pra responder "o que está consumindo esse
  // cartão?"
  async function openDetail(c: CreditCard) {
    setDetailCard(c);
    setDetailLoading(true);
    try {
      const data = await api<InvoiceDetail>(`/credit-cards/${c.id}/invoice?scope=open`);
      setDetail(data);
    } catch (err: any) {
      alert(err.message || "Erro ao carregar detalhe do cartão");
      setDetailCard(null);
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetail() {
    setDetailCard(null);
    setDetail(null);
  }

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <h1 className="text-xl lg:text-2xl font-extrabold tracking-tight">Cartões</h1>
        <button
          onClick={() => {
            setEditingId(null);
            setForm(emptyForm);
            setFormOpen(true);
          }}
          className="btn-primary !px-4 !py-2.5 text-sm"
        >
          + Cartão
        </button>
      </header>
      <p className="text-sm text-gray-400">
        Controle manual de limite e fatura — vincule lançamentos a um cartão pra ver o quanto já está comprometido.
      </p>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="skeleton h-40 rounded-3xl" />
          ))}
        </div>
      ) : cards.length === 0 ? (
        <div className="card text-center py-10 text-gray-400">
          <p className="text-3xl mb-2">💳</p>
          <p className="text-sm">Nenhum cartão cadastrado</p>
        </div>
      ) : (
        <StaggerList>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {cards.map((c) => (
              <StaggerItem key={c.id}>
                <div
                  onClick={() => openDetail(c)}
                  className={clsx(
                    "card-gradient !rounded-3xl cursor-pointer active:scale-[0.98] transition-transform",
                    !c.active && "opacity-50"
                  )}
                >
                  {/* decoração puramente visual — sem pointer-events-none ela ficava
                      por cima do botão ✏️/⏸/✕ (fica posicionada no mesmo canto
                      superior direito), "roubando" o clique: por ser absolute sem
                      z-index, o navegador empilha ela acima dos elementos estáticos
                      ao lado (o header com os botões), então o clique caía nela e
                      borbulhava pro onClick do card inteiro (abrir detalhe) em vez
                      de chegar no botão — por isso só dava pra ver os detalhes */}
                  <div className="absolute -right-6 -top-6 w-32 h-32 rounded-full bg-white/10 blur-2xl pointer-events-none" />
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-bold">
                        {c.name} {!c.active && <span className="text-xs font-normal text-white/60">(inativo)</span>}
                      </p>
                      <p className="text-xs text-white/60">{c.brand || "Cartão de crédito"}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(c);
                        }}
                        className="text-white/50 hover:text-white text-xs"
                        aria-label="Editar cartão"
                        title="Editar"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={(e) => handleToggleActive(c, e)}
                        className="text-white/50 hover:text-white text-xs"
                        aria-label="Ativar/desativar cartão"
                        title={c.active ? "Desativar" : "Ativar"}
                      >
                        {c.active ? "⏸" : "▶"}
                      </button>
                      <button
                        onClick={(e) => handleDelete(c.id, e)}
                        className="text-white/50 hover:text-white text-sm"
                        aria-label="Excluir cartão"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  <p className="text-2xl font-extrabold tabular-nums mt-4">{currency(c.currentInvoice.committed)}</p>
                  <p className="text-xs text-white/60">fatura atual · fecha {fullDate(c.currentInvoice.cycleEnd)}</p>

                  <div className="mt-3 h-2 rounded-full bg-white/15 overflow-hidden">
                    <div
                      className="h-full bg-white rounded-full transition-all"
                      style={{ width: `${Math.min(100, c.currentInvoice.usagePercent)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-white/70 mt-1.5">
                    <span>{c.currentInvoice.usagePercent}% do limite</span>
                    <span>Limite {currency(Number(c.limitAmount))}</span>
                  </div>
                  {/* limite comprometido inclui parcelas futuras em aberto, não só
                      a fatura que fecha esse mês — por isso pode ser maior que o
                      valor acima quando há compra parcelada em andamento */}
                  {c.currentInvoice.limitUsed > c.currentInvoice.committed && (
                    <p className="text-[11px] text-white/60 mt-1.5">
                      Limite comprometido (inclui parcelas futuras): {currency(c.currentInvoice.limitUsed)}
                    </p>
                  )}
                </div>
              </StaggerItem>
            ))}
          </div>
        </StaggerList>
      )}

      <BottomSheet open={formOpen} onClose={closeForm} title={editingId ? "Editar cartão" : "Novo cartão"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Nome</label>
            <input
              className="input"
              placeholder="Ex: Nubank, Inter Black..."
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="label">Bandeira (opcional)</label>
            <input
              className="input"
              placeholder="Ex: Mastercard, Visa"
              value={form.brand}
              onChange={(e) => setForm({ ...form, brand: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Limite</label>
            <input
              className="input"
              placeholder="R$ 0,00"
              inputMode="decimal"
              value={form.limitAmount}
              onChange={(e) => setForm({ ...form, limitAmount: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Dia de fechamento</label>
              <input
                className="input"
                type="number"
                min={1}
                max={28}
                value={form.closingDay}
                onChange={(e) => setForm({ ...form, closingDay: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="label">Dia de vencimento</label>
              <input
                className="input"
                type="number"
                min={1}
                max={28}
                value={form.dueDay}
                onChange={(e) => setForm({ ...form, dueDay: e.target.value })}
                required
              />
            </div>
          </div>
          <button className="btn-primary w-full">{editingId ? "Salvar alterações" : "Salvar cartão"}</button>
        </form>
      </BottomSheet>

      <BottomSheet open={!!detailCard} onClose={closeDetail} title={detailCard ? `O que consome ${detailCard.name}` : ""}>
        {detailLoading || !detail ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-14 rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="card !bg-gray-50 dark:!bg-white/5 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Fatura deste ciclo</span>
                <span className="font-semibold">{currency(detail.committed)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Limite comprometido (total)</span>
                <span className="font-semibold">{currency(detail.limitUsed)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Disponível</span>
                <span className="font-semibold">{currency(detail.available)}</span>
              </div>
            </div>

            {detail.items.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">Nada consumindo o limite desse cartão.</p>
            ) : (
              <div className="card !p-0 overflow-hidden divide-y divide-gray-100 dark:divide-white/5">
                {detail.items
                  .filter((i) => i.type === "EXPENSE")
                  .map((i) => (
                    <div key={i.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {i.description}
                          {i.installmentTotal && i.installmentTotal > 1 ? (
                            <span className="text-gray-400 font-normal">
                              {" "}
                              ({i.installmentNumber}/{i.installmentTotal})
                            </span>
                          ) : null}
                        </p>
                        <p className="text-xs text-gray-400">
                          {fullDate(i.date)}
                          {i.pending ? " · pendente" : ""}
                          {i.category ? ` · ${i.category}` : ""}
                        </p>
                      </div>
                      <span className="text-sm font-bold shrink-0 text-expense-600 dark:text-expense-400">
                        {currency(i.amount)}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
