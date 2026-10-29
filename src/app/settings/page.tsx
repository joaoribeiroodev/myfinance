"use client";

import { useEffect, useState } from "react";
import dayjs from "dayjs";
import { api } from "@/lib/api";
import { currency } from "@/lib/format";
import { emitDataChanged } from "@/lib/events";

interface Income {
  id: string;
  description: string;
  amount: string | number;
  isFixed: boolean;
  referenceMonth: string;
  payDay?: number | null;
}

function IncomeSection() {
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [form, setForm] = useState({ description: "", amount: "", isFixed: true, payDay: "" });
  const month = dayjs().format("YYYY-MM") + "-01";

  async function load() {
    setIncomes(await api<Income[]>(`/incomes?month=${month}`));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await api("/incomes", {
      method: "POST",
      body: JSON.stringify({
        description: form.description,
        amount: Number(form.amount.replace(",", ".")),
        isFixed: form.isFixed,
        referenceMonth: month,
        payDay: form.payDay ? Number(form.payDay) : null,
      }),
    });
    setForm({ description: "", amount: "", isFixed: true, payDay: "" });
    load();
    emitDataChanged();
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Excluir essa renda? O lançamento vinculado a ela também será removido.")) return;
    try {
      await api(`/incomes/${id}`, { method: "DELETE" });
      load();
      emitDataChanged();
    } catch (err: any) {
      alert(err.message || "Erro ao excluir renda");
    }
  }

  const total = incomes.reduce((s, i) => s + Number(i.amount), 0);

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-500/10 flex items-center justify-center text-xl">
          💼
        </span>
        <div>
          <h2 className="font-semibold text-sm">Renda mensal</h2>
          <p className="text-xs text-gray-400">Entra como receita no saldo e no health score do dashboard deste mês</p>
        </div>
      </div>

      {incomes.length > 0 && (
        <div className="divide-y divide-gray-100 dark:divide-white/5">
          {incomes.map((i) => (
            <div key={i.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                {i.description} {i.isFixed ? <span className="pill bg-gray-100 dark:bg-white/5 text-gray-400 ml-1">fixa</span> : null}
                {i.payDay ? <span className="text-xs text-gray-400 ml-1">· dia {i.payDay}</span> : null}
              </span>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{currency(Number(i.amount))}</span>
                <button onClick={() => handleDelete(i.id)} className="text-gray-300 hover:text-expense-600">
                  ✕
                </button>
              </div>
            </div>
          ))}
          <div className="flex justify-between pt-2 text-sm font-semibold">
            <span>Total previsto</span>
            <span>{currency(total)}</span>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-wrap gap-2 items-end pt-1">
        <input
          className="input flex-1 min-w-[140px]"
          placeholder="Ex: Salário"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          required
        />
        <input
          className="input w-28"
          placeholder="R$ 0,00"
          inputMode="decimal"
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
          required
        />
        <input
          className="input w-20"
          placeholder="Dia"
          type="number"
          min={1}
          max={31}
          title="Dia do mês em que você recebe (opcional)"
          value={form.payDay}
          onChange={(e) => setForm({ ...form, payDay: e.target.value })}
        />
        <button className="btn-secondary !px-4 !py-3 text-sm">Adicionar</button>
      </form>
      <p className="text-[11px] text-gray-400">
        "Dia" é o dia do mês em que você recebe (ex: 5) — opcional, deixe vazio pra usar o dia 1.
      </p>
    </div>
  );
}

interface TelegramSettings {
  linked: boolean;
  chatId: string;
  alertsEnabled: boolean;
  defaultReminderDays: number[];
  alertTime: string;
  dueDateAlertTime: string;
}

// Sem bot rodando, "vincular" é só salvar o chat ID direto — pra pegar o
// próprio: abra o Telegram, fale com @userinfobot, ele responde com o Id.
function TelegramLinkSection({ onLinked }: { onLinked: () => void }) {
  const [chatId, setChatId] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!chatId.trim()) return;
    setSaving(true);
    try {
      await api("/telegram/settings", { method: "PUT", body: JSON.stringify({ chatId: chatId.trim() }) });
      onLinked();
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    setTestMsg(null);
    try {
      await api("/telegram/test", { method: "POST" });
      setTestMsg("✓ Mensagem de teste enviada — confira o Telegram.");
    } catch (err: any) {
      setTestMsg(err.message || "Erro ao enviar teste");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-500/10 flex items-center justify-center text-xl">
          🔔
        </span>
        <div>
          <h2 className="font-semibold text-sm">Notificações no Telegram</h2>
          <p className="text-xs text-gray-400">Lembretes de contas e cofrinhos direto no chat</p>
        </div>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Fale com <code className="text-brand-600 dark:text-brand-400">@userinfobot</code> no Telegram pra pegar seu Chat
        ID, cole abaixo e salve.
      </p>
      <form onSubmit={save} className="flex gap-2">
        <input
          className="input flex-1"
          placeholder="Seu Chat ID (ex: 123456789)"
          value={chatId}
          onChange={(e) => setChatId(e.target.value)}
        />
        <button className="btn-primary shrink-0" disabled={saving}>
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </form>
      <button onClick={test} disabled={testing} className="btn-ghost text-xs">
        {testing ? "Enviando..." : "Enviar mensagem de teste"}
      </button>
      {testMsg && <p className="text-xs text-gray-400">{testMsg}</p>}
    </div>
  );
}

function AlertSettingsSection() {
  const [settings, setSettings] = useState<TelegramSettings | null>(null);
  const [daysInput, setDaysInput] = useState("3,1,0");
  const [timeInput, setTimeInput] = useState("08:00");
  const [dueDateTimeInput, setDueDateTimeInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function load() {
    try {
      const data = await api<TelegramSettings>("/telegram/settings");
      setSettings(data);
      setDaysInput(data.defaultReminderDays.join(","));
      setTimeInput(data.alertTime ?? "08:00");
      setDueDateTimeInput(data.dueDateAlertTime ?? "");
    } catch {}
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleAlerts() {
    if (!settings) return;
    const next = { ...settings, alertsEnabled: !settings.alertsEnabled };
    setSettings(next);
    await api("/telegram/settings", {
      method: "PUT",
      body: JSON.stringify({ alertsEnabled: next.alertsEnabled }),
    }).catch(() => load());
  }

  async function saveDays(e: React.FormEvent) {
    e.preventDefault();
    const days = daysInput
      .split(",")
      .map((d) => Number(d.trim()))
      .filter((d) => !isNaN(d) && d >= 0);
    setSaving(true);
    try {
      await api("/telegram/settings", {
        method: "PUT",
        body: JSON.stringify({
          defaultReminderDays: days,
          alertTime: timeInput,
          dueDateAlertTime: dueDateTimeInput || "",
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      load();
    } finally {
      setSaving(false);
    }
  }

  if (!settings || !settings.linked) return null;

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-500/10 flex items-center justify-center text-xl">
          🔔
        </span>
        <div className="flex-1">
          <h2 className="font-semibold text-sm">Alertas automáticos</h2>
          <p className="text-xs text-gray-400">Avisos de contas a pagar/receber direto no Telegram</p>
        </div>
        <button
          onClick={toggleAlerts}
          className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${
            settings.alertsEnabled ? "bg-brand-500" : "bg-gray-200 dark:bg-white/10"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
              settings.alertsEnabled ? "translate-x-5" : ""
            }`}
          />
        </button>
      </div>

      {settings.alertsEnabled && (
        <form onSubmit={saveDays} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Avisar quantos dias antes do vencimento</label>
              <input
                className="input"
                placeholder="Ex: 3,1,0"
                value={daysInput}
                onChange={(e) => setDaysInput(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Horário do aviso</label>
              <input
                className="input"
                type="time"
                value={timeInput}
                onChange={(e) => setTimeInput(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="label">Horário específico no dia do vencimento (opcional)</label>
            <input
              className="input"
              type="time"
              value={dueDateTimeInput}
              onChange={(e) => setDueDateTimeInput(e.target.value)}
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Avisos de "N dias antes" continuam saindo no horário geral acima. O dia do próprio vencimento (quando
              "0" está na lista de dias) pode ter um horário diferente aqui — deixe vazio pra usar o mesmo horário
              geral.
            </p>
          </div>
          <p className="text-[11px] text-gray-400 -mt-1">
            Dias: separe por vírgula — "0" avisa no próprio dia do vencimento. Horário geral: quando os lembretes
            diários (contas e cofrinhos) são enviados no Telegram.
          </p>
          <button className="btn-secondary !px-4 !py-3 text-sm w-full" disabled={saving}>
            {saved ? "✓ Salvo" : saving ? "Salvando..." : "Salvar"}
          </button>
        </form>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="space-y-5 max-w-xl">
      <h1 className="text-xl font-extrabold tracking-tight">Configurações</h1>

      <IncomeSection />

      <TelegramLinkSection onLinked={() => setRefreshKey((k) => k + 1)} />

      <AlertSettingsSection key={refreshKey} />

      <div className="card space-y-2">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-500/10 flex items-center justify-center text-xl">
            📲
          </span>
          <div>
            <h2 className="font-semibold text-sm">Instalar como app</h2>
            <p className="text-xs text-gray-400">Use o MyFinance como um app no seu celular</p>
          </div>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No Chrome/Safari do celular, abra o menu e toque em{" "}
          <span className="font-medium">"Adicionar à tela inicial"</span> (ou "Instalar app"). O MyFinance abre em tela
          cheia, sem a barra do navegador.
        </p>
      </div>

      <p className="text-center text-xs text-gray-300 dark:text-gray-600 pt-2">MyFinance • v1.0</p>
    </div>
  );
}
