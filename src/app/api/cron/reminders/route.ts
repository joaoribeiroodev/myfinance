import { NextRequest, NextResponse } from "next/server";
import dayjs from "dayjs";
import { prisma } from "@/server/lib/prisma";
import { sendTelegramMessage } from "@/server/lib/telegram";
import {
  markOverdueIfNeeded,
  daysUntilDue,
  buildReminderMessage,
  DEFAULT_REMINDER_DAYS,
} from "@/server/lib/reminders";

export const runtime = "nodejs";

// Substitui a varredura POR MINUTO do worker.ts original. O plano Hobby da
// Vercel só permite cron com granularidade diária (mínimo uma vez por dia
// por job) — então lembretes deixam de ter precisão de horário exato
// ("avisar às 08:00") e passam a ser verificados uma vez por dia (ver
// vercel.json). Se precisar do horário exato de novo, dá pra: (a) assinar o
// plano Pro da Vercel (libera cron mais frequente), ou (b) usar um serviço
// externo gratuito tipo cron-job.org batendo nessa URL a cada minuto.
function isAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  // bookkeeping de status (OVERDUE) — igual ao worker.ts original
  const allPending = await prisma.bill.findMany({ where: { status: "PENDING" } });
  for (const bill of allPending) {
    await markOverdueIfNeeded(bill);
  }

  const links = await prisma.telegramLink.findMany({ where: { alertsEnabled: true } });
  const activeLinks = links.filter((l) => !l.chatId.startsWith("pending-"));
  let sent = 0;

  if (activeLinks.length > 0) {
    const linksByUser = new Map(activeLinks.map((l) => [l.userId, l]));
    const userIds = activeLinks.map((l) => l.userId);

    const bills = await prisma.bill.findMany({
      where: { status: "PENDING", userId: { in: userIds } },
    });

    for (const bill of bills) {
      const link = linksByUser.get(bill.userId);
      if (!link) continue;
      const days = daysUntilDue(bill);
      const reminderDays = (bill.reminderDaysBefore as number[]) ?? DEFAULT_REMINDER_DAYS;
      // sem precisão de horário aqui: se o dia bate com algum dos dias de
      // aviso configurados, manda uma vez nessa execução diária
      if (!reminderDays.includes(days) && days !== 0) continue;
      await sendTelegramMessage(link.chatId, buildReminderMessage(bill, days));
      sent++;
    }

    const today = dayjs().date();
    const goals = await prisma.goal.findMany({
      where: {
        userId: { in: userIds },
        status: "IN_PROGRESS",
        reminderDay: today,
        monthlyTarget: { not: null },
      },
    });
    for (const goal of goals) {
      const link = linksByUser.get(goal.userId);
      if (!link) continue;
      const remaining = Number(goal.targetAmount) - Number(goal.currentAmount);
      if (remaining <= 0) continue;
      const message =
        `🐷 Hoje é dia de guardar no cofrinho *${goal.name}*!\n` +
        `Meta mensal: R$ ${Number(goal.monthlyTarget).toFixed(2)}\n` +
        `Faltam R$ ${remaining.toFixed(2)} pra bater o objetivo de R$ ${Number(goal.targetAmount).toFixed(2)}.`;
      await sendTelegramMessage(link.chatId, message);
      sent++;
    }
  }

  return NextResponse.json({ ok: true, sent });
}
