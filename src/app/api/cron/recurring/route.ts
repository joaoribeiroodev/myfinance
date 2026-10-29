import { NextRequest, NextResponse } from "next/server";
import dayjs from "dayjs";
import { prisma } from "@/server/lib/prisma";

export const runtime = "nodejs";

// Equivalente ao cron.schedule("0 2 1 * *", ...) do worker.ts original —
// gera os lançamentos/contas do mês a partir dos templates de recorrência.
// Configurado no vercel.json pra rodar todo dia 1 às 02:00 (ver ali o
// comentário sobre o limite do plano Hobby da Vercel).
//
// Protegido por CRON_SECRET: a Vercel manda esse header automaticamente em
// invocações agendadas (vercel.json); sem ele, qualquer um na internet
// poderia chamar essa rota e duplicar lançamentos do mês.
function isAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // sem secret configurado, não bloqueia (ex: teste local)
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const templates = await prisma.recurringTemplate.findMany({ where: { active: true } });
  const now = dayjs();
  let generated = 0;

  for (const t of templates) {
    // já gerado esse mês? (mesma checagem usada em recurring-templates/:id/generate)
    const monthStart = new Date(Date.UTC(now.year(), now.month(), 1, 0, 0, 0));
    const monthEnd = new Date(Date.UTC(now.year(), now.month(), now.daysInMonth(), 23, 59, 59));

    const already =
      t.type === "EXPENSE"
        ? await prisma.bill.findFirst({ where: { recurringTemplateId: t.id, dueDate: { gte: monthStart, lte: monthEnd } } })
        : await prisma.transaction.findFirst({ where: { recurringTemplateId: t.id, date: { gte: monthStart, lte: monthEnd } } });
    if (already) continue;

    // ancorado ao meio-dia UTC — mesmo motivo documentado no worker.ts
    // original: evita o lançamento "voltar um dia" ao exibir no fuso do Brasil
    const dueDate = new Date(Date.UTC(now.year(), now.month(), t.dayOfMonth, 12, 0, 0));

    if (t.type === "EXPENSE") {
      const customAlertAt =
        t.alertDaysBefore != null && t.alertTimeOfDay
          ? (() => {
              const [h, m] = t.alertTimeOfDay!.split(":").map(Number);
              return dayjs(dueDate).subtract(t.alertDaysBefore!, "day").hour(h).minute(m).second(0).toDate();
            })()
          : null;

      await prisma.bill.create({
        data: {
          userId: t.userId,
          description: t.description,
          amount: t.amount,
          type: t.type,
          dueDate,
          recurringTemplateId: t.id,
          customAlertAt,
          creditCardId: t.creditCardId,
        },
      });
    } else {
      await prisma.transaction.create({
        data: {
          userId: t.userId,
          type: t.type,
          amount: t.amount,
          categoryId: t.categoryId,
          date: dueDate,
          description: t.description,
          recurrenceType: "FIXED_MONTHLY",
          recurringTemplateId: t.id,
        },
      });
    }

    await prisma.recurringTemplate.update({ where: { id: t.id }, data: { lastGeneratedAt: new Date() } });
    generated++;
  }

  return NextResponse.json({ ok: true, generated });
}
