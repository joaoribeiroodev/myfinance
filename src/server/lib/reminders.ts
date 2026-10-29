import dayjs from "dayjs";
import { prisma } from "./prisma";
import { sendTelegramMessage } from "./telegram";
import type { Bill, TelegramLink } from "@prisma/client";

export const DEFAULT_REMINDER_DAYS = [3, 1, 0];

// Marca como OVERDUE se já passou do vencimento. Isso é só bookkeeping de
// status — roda independente de qualquer configuração de alerta, pra uma
// conta não ficar "pendente" pra sempre só porque os alertas estão
// desligados ou o horário configurado nunca bateu.
export async function markOverdueIfNeeded(bill: Bill): Promise<boolean> {
  if (bill.status !== "PENDING") return false;
  const today = dayjs().startOf("day");
  const due = dayjs(bill.dueDate).startOf("day");
  if (due.diff(today, "day") < 0) {
    await prisma.bill.update({ where: { id: bill.id }, data: { status: "OVERDUE" } });
    return true;
  }
  return false;
}

export function daysUntilDue(bill: Bill): number {
  const today = dayjs().startOf("day");
  const due = dayjs(bill.dueDate).startOf("day");
  return due.diff(today, "day");
}

export function buildReminderMessage(bill: Bill, days: number): string {
  const label = bill.type === "EXPENSE" ? "pagar" : "receber";
  const when = days === 0 ? "vence *hoje*" : `vence em *${days} dia(s)*`;
  return `🔔 Lembrete: *${bill.description}* (R$ ${Number(bill.amount).toFixed(
    2
  )}) a ${label} ${when} — ${dayjs(bill.dueDate).format("DD/MM/YYYY")}`;
}

// O dia do vencimento (dia 0) pode ter um horário próprio
// (TelegramLink.dueDateAlertTime); os demais dias ("3 dias antes" etc.) usam
// sempre o horário geral (alertTime). Se dueDateAlertTime não estiver
// configurado, cai no horário geral também.
export function reminderTimeFor(link: TelegramLink, days: number): string {
  if (days === 0 && link.dueDateAlertTime) return link.dueDateAlertTime;
  return link.alertTime;
}

// Usado na hora de criar/editar a conta (bills.ts) — dispara na hora, sem
// esperar o horário configurado, se a data cair dentro da janela de aviso
// agora. Isso é intencional: é uma reação imediata à ação do usuário, não
// um lembrete agendado — o horário configurado só vale pra varredura diária
// (ver worker.ts).
export async function evaluateBillReminder(bill: Bill) {
  if (bill.status !== "PENDING") return;
  if (await markOverdueIfNeeded(bill)) return;

  // Conta com alerta customizado (data/hora específica, tipo lembrete de
  // calendário) não usa a lógica de "dias antes" — quem dispara esse aviso
  // é o cron dedicado em worker.ts, no minuto exato configurado.
  if (bill.customAlertAt) return;

  const days = daysUntilDue(bill);
  const reminderDays = (bill.reminderDaysBefore as number[]) ?? DEFAULT_REMINDER_DAYS;
  if (!reminderDays.includes(days)) return;

  const link = await prisma.telegramLink.findUnique({ where: { userId: bill.userId } });
  if (!link || link.chatId.startsWith("pending-") || !link.alertsEnabled) return;

  // sem fila/worker separado no ambiente serverless — envia direto
  await sendTelegramMessage(link.chatId, buildReminderMessage(bill, days));
}
