"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import dayjs from "dayjs";
import { api, getToken } from "@/lib/api";
import { onDataChanged, emitDataChanged } from "@/lib/events";
import {
  currency,
  fullDate,
  categoryIcon,
  localDateToISO,
  localDateRangeStart,
  localDateRangeEnd,
  todayInputValue,
  isoToInputValue,
} from "@/lib/format";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { StaggerList, StaggerItem } from "@/components/ui/PageTransition";

interface Category {
  id: string;
  name: string;
  type: "INCOME" | "EXPENSE";
}

interface Transaction {
  id: string;
  type: "INCOME" | "EXPENSE";
  amount: string | number;
  description: string;
  date: string;
  category?: Category | null;
  creditCardId?: string | null;
  // recorrência/renda fixa do mês que ainda não gerou um lançamento real —
  // vem projetada do backend pra aparecer no extrato também, mas não pode
  // ser editada/excluída por não existir de verdade ainda
  projected?: boolean;
  // presente quando esse item é uma conta (Bill) pendente/vencida, real mas
  // ainda não paga — vem de /bills, não de /transactions, então edita/exclui
  // por rotas diferentes (pagar/cancelar/excluir conta, não lançamento)
  billId?: string | null;
  billStatus?: "PENDING" | "OVERDUE" | string;
  attachmentUrl?: string | null;
  installmentGroupId?: string | null;
  installmentNumber?: number | null;
  installmentTotal?: number | null;
}

export default function TransactionsPage() {
  const [items, setItems] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [cards, setCards] = useState<{ id: string; name: string }[]>([]);
  const [filters, setFilters] = useState({ search: "", type: "", categoryId: "", from: "", to: "" });
  const [formOpen, setFormOpen] = useState(false);
  const [showPeriod, setShowPeriod] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [projectedSheet, setProjectedSheet] = useState<Transaction | null>(null);
  const [generating, setGenerating] = useState(false);
  // conta (Bill) real pendente/vencida clicada no extrato — ações aqui
  // batem em /bills/:id, não em /transactions/:id
  const [billSheet, setBillSheet] = useState<Transaction | null>(null);
  const [installmentDeleteSheet, setInstallmentDeleteSheet] = useState<Transaction | null>(null);
  const [installmentDeleteLoading, setInstallmentDeleteLoading] = useState(false);
  const [billActionLoading, setBillActionLoading] = useState(false);
  // Mês em exibição no extrato — por padrão só o mês atual aparece, pra não
  // poluir a tela com o histórico inteiro; o usuário navega entre meses com
  // as setas. Um período customizado (filtro "Período") tem prioridade sobre
  // essa navegação, pra quem quiser ver um intervalo fora de um mês exato.
  const [month, setMonth] = useState(() => dayjs().format("YYYY-MM"));
  const customPeriodActive = Boolean(filters.from || filters.to);

  function monthRangeStrings(monthStr: string) {
    const [y, m] = monthStr.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    return { from: `${monthStr}-01`, to: `${monthStr}-${String(lastDay).padStart(2, "0")}` };
  }

  const emptyForm = {
    type: "EXPENSE" as "INCOME" | "EXPENSE",
    amount: "",
    description: "",
    date: todayInputValue(),
    categoryId: "",
    creditCardId: "",
    installments: "1",
    attachmentUrl: "",
  };
  const [form, setForm] = useState(emptyForm);
  const [uploading, setUploading] = useState(false);

  // Sobe o comprovante pro Vercel Blob (ver src/app/api/uploads/route.ts) e
  // guarda a URL no form — vai junto no POST/PUT do lançamento como
  // attachmentUrl (campo que já existia no schema, mas não tinha como
  // anexar o arquivo de fato antes dessa rota existir).
  async function handleAttachmentUpload(file: File) {
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const token = getToken();
      const res = await fetch("/api/uploads", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao enviar anexo");
      setForm((f) => ({ ...f, attachmentUrl: data.url }));
    } catch (err: any) {
      alert(err.message || "Erro ao enviar anexo");
    } finally {
      setUploading(false);
    }
  }

  async function load() {
    const qs = new URLSearchParams();
    if (filters.search) qs.set("search", filters.search);
    if (filters.type) qs.set("type", filters.type);
    if (filters.categoryId) qs.set("categoryId", filters.categoryId);
    if (customPeriodActive) {
      if (filters.from) qs.set("from", localDateRangeStart(filters.from));
      if (filters.to) qs.set("to", localDateRangeEnd(filters.to));
    } else {
      const { from, to } = monthRangeStrings(month);
      qs.set("from", localDateRangeStart(from));
      qs.set("to", localDateRangeEnd(to));
      // só na visualização padrão (mês inteiro) pede pro extrato incluir as
      // recorrências/renda fixa ainda não lançadas nesse mês — manda o mês
      // explícito (não dá pra backend inferir de from/to, que chegam com
      // horário já deslocado pelo fuso do navegador)
      qs.set("projectedMonth", month);
    }
    const data = await api<{ items: Transaction[] }>(`/transactions?${qs.toString()}`);
    setItems(data.items);
    setLoading(false);
  }

  useEffect(() => {
    api<Category[]>("/categories").then(setCategories).catch(() => {});
    api<any[]>("/credit-cards").then((c) => setCards(c.map((x) => ({ id: x.id, name: x.name })))).catch(() => {});
    return onDataChanged(load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, month]);

  async function handleSuggest(description: string) {
    if (!description || description.length < 3) return;
    try {
      const { categoryId } = await api<{ categoryId: string | null }>(
        `/transactions/suggest-category?description=${encodeURIComponent(description)}`
      );
      if (categoryId) setForm((f) => ({ ...f, categoryId }));
    } catch {}
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const installments = Math.max(1, Number(form.installments) || 1);

    if (editingId) {
      // edição não re-gera parcelas — só atualiza o lançamento selecionado
      await api(`/transactions/${editingId}`, {
        method: "PUT",
        body: JSON.stringify({
          type: form.type,
          description: form.description,
          amount: Number(form.amount.replace(",", ".")),
          categoryId: form.categoryId || null,
          date: localDateToISO(form.date),
          creditCardId: form.creditCardId || null,
          paymentMethod: form.creditCardId ? "CREDIT_CARD" : "OTHER",
          attachmentUrl: form.attachmentUrl || undefined,
        }),
      });
    } else {
      await api("/transactions", {
        method: "POST",
        body: JSON.stringify({
          type: form.type,
          description: form.description,
          amount: Number(form.amount.replace(",", ".")),
          categoryId: form.categoryId || null,
          date: localDateToISO(form.date),
          creditCardId: form.creditCardId || null,
          recurrenceType: installments > 1 ? "INSTALLMENT" : "NONE",
          installmentTotal: installments > 1 ? installments : undefined,
          installmentNumber: installments > 1 ? 1 : undefined,
          paymentMethod: form.creditCardId ? "CREDIT_CARD" : "OTHER",
          attachmentUrl: form.attachmentUrl || undefined,
        }),
      });
    }
    setForm(emptyForm);
    setEditingId(null);
    setFormOpen(false);
    emitDataChanged();
  }

  function openEdit(t: Transaction) {
    // recorrência projetada ainda não existe de verdade — abre ações pra
    // "liberar" ela (lançar agora / marcar como paga) em vez de editar
    if (t.projected) {
      setProjectedSheet(t);
      return;
    }
    // conta (Bill) real pendente/vencida — pagar/cancelar/excluir usa as
    // rotas de /bills, não dá pra editar como um lançamento normal
    if (t.billId) {
      setBillSheet(t);
      return;
    }
    setEditingId(t.id);
    setForm({
      type: t.type,
      amount: String(Number(t.amount)).replace(".", ","),
      description: t.description,
      date: isoToInputValue(t.date),
      categoryId: t.category?.id ?? "",
      creditCardId: t.creditCardId ?? "",
      installments: "1",
      attachmentUrl: t.attachmentUrl ?? "",
    });
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  // Projetados vêm com id "recurring-<templateId>" (recorrência ativa) ou
  // "income-<incomeId>" (renda fixa) — só o primeiro tem como "lançar
  // agora" (endpoint novo em recurring-templates); renda fixa é gerada de
  // novo cadastrando o mês em Configurações.
  function templateIdFromProjected(t: Transaction) {
    return t.id.startsWith("recurring-") ? t.id.slice("recurring-".length) : null;
  }

  async function handleGenerateProjected(markPaid: boolean) {
    if (!projectedSheet) return;
    const templateId = templateIdFromProjected(projectedSheet);
    if (!templateId) return;
    setGenerating(true);
    try {
      await api(`/recurring-templates/${templateId}/generate`, {
        method: "POST",
        body: JSON.stringify({ month, markPaid }),
      });
      setProjectedSheet(null);
      emitDataChanged();
    } catch (err: any) {
      alert(err.message || "Erro ao lançar recorrência");
    } finally {
      setGenerating(false);
    }
  }

  async function handleDelete(t: Transaction, e?: React.MouseEvent) {
    e?.stopPropagation();
    // Lançamento parcelado — abre opções (só essa parcela ou todas de uma
    // vez) em vez de excluir direto, pra não obrigar apagar uma por uma.
    if (t.installmentGroupId) {
      setInstallmentDeleteSheet(t);
      return;
    }
    if (!window.confirm("Excluir esse lançamento?")) return;
    try {
      await api(`/transactions/${t.id}`, { method: "DELETE" });
      emitDataChanged();
    } catch (err: any) {
      alert(err.message || "Erro ao excluir lançamento");
    }
  }

  async function handleDeleteInstallment(scope: "one" | "group") {
    if (!installmentDeleteSheet) return;
    setInstallmentDeleteLoading(true);
    try {
      const qs = scope === "group" ? "?deleteGroup=true" : "";
      await api(`/transactions/${installmentDeleteSheet.id}${qs}`, { method: "DELETE" });
      setInstallmentDeleteSheet(null);
      emitDataChanged();
    } catch (err: any) {
      alert(err.message || "Erro ao excluir lançamento");
    } finally {
      setInstallmentDeleteLoading(false);
    }
  }

  // Ações da conta (Bill) real pendente/vencida aberta pelo extrato — mesmo
  // padrão já usado na tela "Contas" (bills/page.tsx), só que disparado a
  // partir do Lançamentos.
  async function handlePayBill() {
    if (!billSheet?.billId) return;
    setBillActionLoading(true);
    try {
      await api(`/bills/${billSheet.billId}/pay`, { method: "POST" });
      setBillSheet(null);
      emitDataChanged();
    } catch (err: any) {
      alert(err.message || "Erro ao marcar conta como paga");
    } finally {
      setBillActionLoading(false);
    }
  }

  async function handleCancelBill() {
    if (!billSheet?.billId) return;
    if (!window.confirm("Cancelar essa conta?")) return;
    setBillActionLoading(true);
    try {
      await api(`/bills/${billSheet.billId}/cancel`, { method: "POST" });
      setBillSheet(null);
      emitDataChanged();
    } catch (err: any) {
      alert(err.message || "Erro ao cancelar conta");
    } finally {
      setBillActionLoading(false);
    }
  }

  async function handleDeleteBill() {
    if (!billSheet?.billId) return;
    if (!window.confirm("Excluir essa conta?")) return;
    setBillActionLoading(true);
    try {
      await api(`/bills/${billSheet.billId}`, { method: "DELETE" });
      setBillSheet(null);
      emitDataChanged();
    } catch (err: any) {
      alert(err.message || "Erro ao excluir conta");
    } finally {
      setBillActionLoading(false);
    }
  }

  // agrupa por data pra parecer um extrato
  const groups = items.reduce<Record<string, Transaction[]>>((acc, t) => {
    const key = fullDate(t.date);
    (acc[key] ??= []).push(t);
    return acc;
  }, {});

  return (
    <div className="space-y-5 lg:max-w-4xl lg:mx-auto">
      <header className="flex items-center justify-between">
        <h1 className="text-xl lg:text-2xl font-extrabold tracking-tight">Lançamentos</h1>
        <button
          onClick={() => {
            setEditingId(null);
            setForm(emptyForm);
            setFormOpen(true);
          }}
          className="btn-primary !px-4 !py-2.5 text-sm"
        >
          + Novo
        </button>
      </header>

      <div className="flex items-center justify-between">
        <div
          className={clsx(
            "flex items-center gap-1 bg-gray-100 dark:bg-white/5 rounded-full px-1 transition-opacity",
            customPeriodActive && "opacity-40 pointer-events-none"
          )}
        >
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
            className="w-7 h-7 rounded-full flex items-center justify-center text-gray-500 hover:bg-white dark:hover:bg-white/10"
            aria-label="Próximo mês"
          >
            ›
          </button>
        </div>
        {customPeriodActive && <p className="text-[11px] text-gray-400">período customizado ativo</p>}
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
        <input
          className="input !w-auto min-w-[160px] flex-1"
          placeholder="🔍 Buscar..."
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
        />
        <select
          className="input !w-auto"
          value={filters.type}
          onChange={(e) => setFilters({ ...filters, type: e.target.value })}
        >
          <option value="">Todos</option>
          <option value="EXPENSE">Despesas</option>
          <option value="INCOME">Receitas</option>
        </select>
        <select
          className="input !w-auto"
          value={filters.categoryId}
          onChange={(e) => setFilters({ ...filters, categoryId: e.target.value })}
        >
          <option value="">Categoria</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setShowPeriod(!showPeriod)}
          className={clsx("input !w-auto shrink-0", showPeriod && "border-brand-500 text-brand-600")}
        >
          📅 Período
        </button>
      </div>

      {showPeriod && (
        <div className="card flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[140px]">
            <label className="label">De</label>
            <input
              className="input"
              type="date"
              value={filters.from}
              onChange={(e) => setFilters({ ...filters, from: e.target.value })}
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="label">Até</label>
            <input
              className="input"
              type="date"
              value={filters.to}
              onChange={(e) => setFilters({ ...filters, to: e.target.value })}
            />
          </div>
          {(filters.from || filters.to) && (
            <button
              onClick={() => setFilters({ ...filters, from: "", to: "" })}
              className="btn-ghost text-xs self-end mb-0.5"
            >
              Limpar
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-16 rounded-2xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="card text-center py-10 text-gray-400">
          <p className="text-3xl mb-2">🧾</p>
          <p className="text-sm">Nenhum lançamento encontrado</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groups).map(([date, group]) => (
            <div key={date}>
              <p className="text-xs font-semibold text-gray-400 px-1 mb-1.5">{date}</p>
              <div className="card !p-0 overflow-hidden divide-y divide-gray-100 dark:divide-white/5">
                <StaggerList>
                  {group.map((t) => (
                    <StaggerItem key={t.id}>
                      <div
                        onClick={() => openEdit(t)}
                        className={clsx(
                          "flex items-center gap-3 px-4 py-3 group transition-colors cursor-pointer active:bg-gray-50 dark:active:bg-white/5",
                          t.projected && "opacity-60"
                        )}
                      >
                        <span className="w-10 h-10 rounded-full bg-gray-100 dark:bg-white/5 flex items-center justify-center text-lg shrink-0">
                          {categoryIcon(t.category?.name)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{t.description}</p>
                          <p className="text-xs text-gray-400">
                            {t.category?.name ?? "Sem categoria"}
                            {t.projected ? " · previsto" : ""}
                            {t.billId ? (t.billStatus === "OVERDUE" ? " · vencida" : " · pendente") : ""}
                          </p>
                        </div>
                        <span
                          className={clsx(
                            "text-sm font-bold shrink-0",
                            t.type === "INCOME" ? "text-income-600 dark:text-income-400" : "text-expense-600 dark:text-expense-400"
                          )}
                        >
                          {t.type === "INCOME" ? "+" : "-"}
                          {currency(Number(t.amount))}
                        </span>
                        {!t.projected && !t.billId && (
                          <button
                            onClick={(e) => handleDelete(t, e)}
                            className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-gray-300 hover:text-expense-600 hover:bg-expense-50 dark:hover:bg-expense-500/10 transition-colors"
                            aria-label="Excluir"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </StaggerItem>
                  ))}
                </StaggerList>
              </div>
            </div>
          ))}
        </div>
      )}

      <BottomSheet open={formOpen} onClose={closeForm} title={editingId ? "Editar lançamento" : "Novo lançamento"}>
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
            <label className="label">Descrição</label>
            <input
              className="input"
              placeholder="Descrição"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              onBlur={(e) => handleSuggest(e.target.value)}
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
                <option value="">Nenhuma</option>
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

          {form.type === "EXPENSE" && (
            <div className={clsx("grid gap-3", editingId || cards.length === 0 ? "grid-cols-1" : "grid-cols-2")}>
              {cards.length > 0 && (
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
              )}
              {!editingId && (
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
              )}
            </div>
          )}
          {!editingId && Number(form.installments) > 1 && (
            <p className="text-xs text-gray-400 -mt-2">
              Vai gerar {form.installments}x de{" "}
              {form.amount ? currency(Number(form.amount.replace(",", ".")) || 0) : "R$ 0,00"} nos próximos meses.
            </p>
          )}

          <div>
            <label className="label">Comprovante (opcional)</label>
            {form.attachmentUrl ? (
              <div className="flex items-center gap-2 text-xs">
                <a href={form.attachmentUrl} target="_blank" rel="noreferrer" className="text-brand-600 dark:text-brand-400 underline">
                  📎 Ver anexo
                </a>
                <button type="button" onClick={() => setForm({ ...form, attachmentUrl: "" })} className="text-gray-400">
                  remover
                </button>
              </div>
            ) : (
              <input
                className="input"
                type="file"
                accept="image/*,application/pdf"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleAttachmentUpload(file);
                }}
              />
            )}
            {uploading && <p className="text-xs text-gray-400 mt-1">Enviando...</p>}
          </div>

          <button className="btn-primary w-full">{editingId ? "Salvar alterações" : "Adicionar lançamento"}</button>
        </form>
      </BottomSheet>

      <BottomSheet open={!!projectedSheet} onClose={() => setProjectedSheet(null)} title="Lançamento previsto">
        {projectedSheet && (
          <div className="space-y-4">
            <div className="card !bg-gray-50 dark:!bg-white/5">
              <p className="text-sm font-medium">{projectedSheet.description}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {fullDate(projectedSheet.date)} ·{" "}
                {projectedSheet.type === "INCOME" ? "receita" : "despesa"} prevista de uma recorrência — ainda não
                existe como lançamento real.
              </p>
              <p className="text-lg font-bold mt-2">{currency(Number(projectedSheet.amount))}</p>
            </div>

            {templateIdFromProjected(projectedSheet) ? (
              <div className="space-y-2">
                {projectedSheet.type === "EXPENSE" && (
                  <button
                    onClick={() => handleGenerateProjected(true)}
                    disabled={generating}
                    className="btn-primary w-full disabled:opacity-60"
                  >
                    {generating ? "Lançando..." : "Marcar como paga agora"}
                  </button>
                )}
                <button
                  onClick={() => handleGenerateProjected(false)}
                  disabled={generating}
                  className="btn-secondary w-full disabled:opacity-60"
                >
                  {generating
                    ? "Lançando..."
                    : projectedSheet.type === "INCOME"
                      ? "Confirmar recebimento"
                      : "Lançar como pendente (em Contas)"}
                </button>
              </div>
            ) : (
              <p className="text-xs text-gray-400">
                Essa é a renda fixa cadastrada em Configurações — pra gerar o lançamento desse mês, abra
                Configurações e salve a renda de novo (ela se repete automaticamente a partir do próximo mês em que
                for recadastrada).
              </p>
            )}
          </div>
        )}
      </BottomSheet>

      <BottomSheet open={!!billSheet} onClose={() => setBillSheet(null)} title="Conta pendente">
        {billSheet && (
          <div className="space-y-4">
            <div className="card !bg-gray-50 dark:!bg-white/5">
              <p className="text-sm font-medium">{billSheet.description}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Vencimento em {fullDate(billSheet.date)} ·{" "}
                {billSheet.billStatus === "OVERDUE" ? "vencida" : "pendente"}
              </p>
              <p className="text-lg font-bold mt-2">{currency(Number(billSheet.amount))}</p>
            </div>

            <div className="space-y-2">
              <button
                onClick={handlePayBill}
                disabled={billActionLoading}
                className="btn-primary w-full disabled:opacity-60"
              >
                {billActionLoading ? "Processando..." : "Marcar como paga"}
              </button>
              <button
                onClick={handleCancelBill}
                disabled={billActionLoading}
                className="btn-secondary w-full disabled:opacity-60"
              >
                Cancelar conta
              </button>
              <button
                onClick={handleDeleteBill}
                disabled={billActionLoading}
                className="w-full py-3 rounded-xl text-sm font-semibold text-expense-600 hover:bg-expense-50 dark:hover:bg-expense-500/10 transition-colors disabled:opacity-60"
              >
                Excluir conta
              </button>
            </div>
          </div>
        )}
      </BottomSheet>

      <BottomSheet
        open={!!installmentDeleteSheet}
        onClose={() => setInstallmentDeleteSheet(null)}
        title="Excluir parcela"
      >
        {installmentDeleteSheet && (
          <div className="space-y-4">
            <div className="card !bg-gray-50 dark:!bg-white/5">
              <p className="text-sm font-medium">{installmentDeleteSheet.description}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Parcela {installmentDeleteSheet.installmentNumber ?? "?"} de{" "}
                {installmentDeleteSheet.installmentTotal ?? "?"}
              </p>
              <p className="text-lg font-bold mt-2">{currency(Number(installmentDeleteSheet.amount))}</p>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => handleDeleteInstallment("group")}
                disabled={installmentDeleteLoading}
                className="btn-primary w-full disabled:opacity-60 !bg-expense-500 hover:!bg-expense-600"
              >
                {installmentDeleteLoading ? "Excluindo..." : "Excluir todas as parcelas"}
              </button>
              <button
                onClick={() => handleDeleteInstallment("one")}
                disabled={installmentDeleteLoading}
                className="btn-secondary w-full disabled:opacity-60"
              >
                Excluir só essa parcela
              </button>
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
