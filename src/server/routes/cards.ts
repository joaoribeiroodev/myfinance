import type { ShimApp as FastifyInstance } from "../fastify-shim";
import { z } from "zod";
import dayjs from "dayjs";
import { prisma } from "../lib/prisma";
import { currentUserId } from "../lib/current-user";
import { logAudit } from "../lib/audit";

const cardSchema = z.object({
  name: z.string().min(1),
  brand: z.string().optional(),
  limitAmount: z.number().positive(),
  closingDay: z.number().int().min(1).max(28),
  dueDay: z.number().int().min(1).max(28),
  color: z.string().optional(),
  active: z.boolean().default(true),
});

// Dado o dia de fechamento, calcula o início/fim do ciclo de fatura cujo
// fechamento cai no mês de referência (ex: fatura que fecha em outubro).
// Exportada pra ser reutilizada pelo resumo de cartões do bot do Telegram.
//
// Quando referenceMonth é "agora" (uso mais comum, tela de cartões sem
// escolher mês) e o dia de fechamento deste mês AINDA NÃO CHEGOU (ex:
// fecha dia 25 e hoje é dia 1), essa fatura nem começou a fechar de
// verdade — a fatura "atual" de fato é a que fechou no mês anterior (dia
// 25 do mês passado). Sem esse ajuste, no início do mês a tela pulava
// direto pro fechamento futuro deste mês (ciclo em aberto, mal começou) e
// escondia a fatura que acabou de fechar.
//
// A "fatura atual" é decidida só pela data de FECHAMENTO, não pelo
// vencimento — assim que uma fatura fecha, ela já é a atual (mesmo que
// ainda não tenha vencido), e só passa a ser a próxima quando a PRÓXIMA
// fechar. Vencimento é só informativo (quando precisa pagar), não decide
// qual fatura mostrar aqui.
//
// Selecionar um mês explícito (?month=) continua olhando o fechamento
// exato daquele mês, sem rolar — o ajuste só vale pra "agora".
export function invoiceCycle(referenceMonth: Date, closingDay: number, opts: { rollForward?: boolean } = {}) {
  const ref = dayjs(referenceMonth);
  const dateInMonth = (base: dayjs.Dayjs, day: number) => base.date(Math.min(day, base.daysInMonth()));

  // Fechamento mais recente: se o dia de fechamento deste mês ainda não
  // chegou, o fechamento de verdade mais recente foi no mês anterior.
  let end = dateInMonth(ref, closingDay);
  if (opts.rollForward && end.isAfter(ref, "day")) {
    end = dateInMonth(ref.subtract(1, "month"), closingDay);
  }

  const start = end.subtract(1, "month").add(1, "day");
  return { start: start.startOf("day").toDate(), end: end.endOf("day").toDate() };
}

// Soma as recorrências de despesa ativas vinculadas ao cartão que ainda não
// geraram uma conta/lançamento real dentro do ciclo atual (lastGeneratedAt
// nunca rodou pra esse mês, ou rodou mas a Bill/Transaction ainda não
// existe pra esse ciclo) — sem isso, uma assinatura recém-cadastrada só
// passava a contar no limite depois que o cron do dia 1 rodasse pra ela,
// mesmo já sendo uma dívida certa.
export async function sumProjectedRecurring(cardId: string, cycleStart: Date, cycleEnd: Date) {
  const templates = await prisma.recurringTemplate.findMany({
    where: { creditCardId: cardId, active: true, type: "EXPENSE" },
  });
  if (templates.length === 0) return { amount: 0, items: [] as { id: string; description: string; amount: number }[] };

  const templateIds = templates.map((t) => t.id);
  const [bills, txs] = await Promise.all([
    prisma.bill.findMany({
      where: { recurringTemplateId: { in: templateIds }, dueDate: { gte: cycleStart, lte: cycleEnd } },
      select: { recurringTemplateId: true },
    }),
    prisma.transaction.findMany({
      where: { recurringTemplateId: { in: templateIds }, date: { gte: cycleStart, lte: cycleEnd } },
      select: { recurringTemplateId: true },
    }),
  ]);
  const generatedIds = new Set([...bills.map((b) => b.recurringTemplateId), ...txs.map((t) => t.recurringTemplateId)]);
  const pending = templates.filter((t) => !generatedIds.has(t.id));
  return {
    amount: pending.reduce((s, t) => s + Number(t.amount), 0),
    items: pending.map((t) => ({ id: t.id, description: t.description, amount: Number(t.amount) })),
  };
}

// Soma o que consome o limite de um cartão num intervalo — combinando os
// dois lugares onde uma despesa vinculada a cartão pode existir:
//  1) Transaction (compra manual avulsa ou parcelada, e também o lançamento
//     criado quando uma conta/Bill é paga)
//  2) Bill ainda PENDING/OVERDUE gerada por uma recorrência vinculada ao
//     cartão (worker.ts cria essas como Bill, não Transaction, até serem
//     pagas) — sem isso, uma recorrência de despesa no cartão nunca
//     aparecia comprometendo o limite enquanto não fosse paga manualmente.
// Devolve a soma das duas fontes, sem contar em dobro: uma Bill só entra
// enquanto está PENDING/OVERDUE; assim que é paga (status PAID), ela some
// daqui e passa a contar via Transaction (criada no momento do pagamento).
export async function sumCardCommitment(cardId: string, where: { gte: Date; lte?: Date }) {
  const dateWhere = where.lte ? { gte: where.gte, lte: where.lte } : { gte: where.gte };
  const [txAgg, billAgg] = await Promise.all([
    prisma.transaction.aggregate({
      where: { creditCardId: cardId, type: "EXPENSE", date: dateWhere },
      _sum: { amount: true },
    }),
    prisma.bill.aggregate({
      where: {
        creditCardId: cardId,
        type: "EXPENSE",
        status: { in: ["PENDING", "OVERDUE"] },
        dueDate: dateWhere,
      },
      _sum: { amount: true },
    }),
  ]);
  return Number(txAgg._sum.amount ?? 0) + Number(billAgg._sum.amount ?? 0);
}

export async function cardRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/credit-cards", async (req) => {
    const userId = currentUserId(req);
    const cards = await prisma.creditCard.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });

    // já devolve a fatura atual (ciclo corrente) de cada cartão, pra listagem
    const withCurrentInvoice = await Promise.all(
      cards.map(async (c) => {
        const { start, end } = invoiceCycle(new Date(), c.closingDay, { rollForward: true });
        const [realCommitted, realLimitUsed, projected] = await Promise.all([
          // "committed": só o valor QUE FECHA nessa fatura (o que você paga
          // esse mês) — usado pra exibir o valor grande do card.
          sumCardCommitment(c.id, { gte: start, lte: end }),
          // "limitUsed": o que realmente ocupa o limite do cartão agora —
          // inclui a fatura atual + toda parcela/conta futura já gerada
          // (real ou ainda como Bill pendente). Numa compra parcelada o
          // valor total é reservado do limite no ato da compra (não só a
          // parcela do mês), então sem isso o limite "disponível" ficava
          // quase cheio mesmo com dívida parcelada em aberto. Fatura de
          // ciclos já fechados (antes do início do ciclo atual) não entra
          // mais aqui — presumida paga.
          sumCardCommitment(c.id, { gte: start }),
          // recorrência vinculada ao cartão que ainda nem gerou a conta
          // desse ciclo — já conta como comprometido, não só depois que o
          // cron do dia 1 rodar pra ela
          sumProjectedRecurring(c.id, start, end),
        ]);
        const committed = realCommitted + projected.amount;
        const limitUsed = realLimitUsed + projected.amount;
        const limit = Number(c.limitAmount);
        return {
          ...c,
          currentInvoice: {
            cycleStart: start,
            cycleEnd: end,
            committed,
            limitUsed,
            available: Math.max(0, limit - limitUsed),
            usagePercent: limit > 0 ? Math.round((limitUsed / limit) * 100) : 0,
          },
        };
      })
    );

    return withCurrentInvoice;
  });

  app.post("/credit-cards", async (req, reply) => {
    const userId = currentUserId(req);
    const body = cardSchema.parse(req.body);
    const card = await prisma.creditCard.create({ data: { ...body, userId } });
    await logAudit(userId, "credit_card", card.id, "create", body);
    return reply.code(201).send(card);
  });

  app.put("/credit-cards/:id", async (req, reply) => {
    const userId = currentUserId(req);
    const { id } = req.params as { id: string };
    const owned = await prisma.creditCard.findFirst({ where: { id, userId } });
    if (!owned) return reply.code(404).send({ error: "Cartão não encontrado" });
    const body = cardSchema.partial().parse(req.body);
    const card = await prisma.creditCard.update({ where: { id }, data: body });
    await logAudit(userId, "credit_card", id, "update", body);
    return card;
  });

  app.delete("/credit-cards/:id", async (req, reply) => {
    const userId = currentUserId(req);
    const { id } = req.params as { id: string };
    const owned = await prisma.creditCard.findFirst({ where: { id, userId } });
    if (!owned) return reply.code(404).send({ error: "Cartão não encontrado" });
    await prisma.creditCard.delete({ where: { id } });
    await logAudit(userId, "credit_card", id, "delete");
    return reply.code(204).send();
  });

  // Detalhe do que está consumindo o limite de um cartão — combina
  // transações reais e contas (Bill) ainda pendentes vinculadas a ele, pra
  // responder "o que está consumindo esse cartão?" na tela de detalhe.
  // ?scope=cycle (padrão) limita à fatura do ciclo atual; ?scope=open traz
  // tudo que compromete o limite a partir do início do ciclo atual (igual
  // ao "limitUsed" da listagem, incluindo parcelas/recorrências futuras).
  // ?month=YYYY-MM-01 (padrão: mês atual) escolhe o ciclo de referência.
  app.get("/credit-cards/:id/invoice", async (req, reply) => {
    const userId = currentUserId(req);
    const { id } = req.params as { id: string };
    const { month, scope } = req.query as { month?: string; scope?: string };
    const card = await prisma.creditCard.findFirst({ where: { id, userId } });
    if (!card) return reply.code(404).send({ error: "Cartão não encontrado" });

    const ref = month ? dayjs(month).toDate() : new Date();
    const { start, end } = invoiceCycle(ref, card.closingDay, { rollForward: !month });
    const isOpenScope = scope === "open";
    const dateWhere = isOpenScope ? { gte: start } : { gte: start, lte: end };

    const [transactions, bills, projected] = await Promise.all([
      prisma.transaction.findMany({
        where: { creditCardId: id, date: dateWhere },
        include: { category: true },
        orderBy: { date: "asc" },
      }),
      prisma.bill.findMany({
        where: { creditCardId: id, status: { in: ["PENDING", "OVERDUE"] }, dueDate: dateWhere },
        orderBy: { dueDate: "asc" },
      }),
      sumProjectedRecurring(id, start, end),
    ]);

    // unifica os dois em uma única lista pra exibir na tela de detalhe,
    // ordenada por data — Bill ainda não é um lançamento real, então entra
    // marcada como "pending" (ainda não paga, mas já reserva limite)
    const items = [
      ...transactions.map((t) => ({
        id: t.id,
        kind: "transaction" as const,
        description: t.description,
        amount: Number(t.amount),
        date: t.date,
        type: t.type,
        category: t.category?.name ?? null,
        installmentNumber: t.installmentNumber,
        installmentTotal: t.installmentTotal,
        pending: false,
      })),
      ...bills.map((b) => ({
        id: b.id,
        kind: "bill" as const,
        description: b.description,
        amount: Number(b.amount),
        date: b.dueDate,
        type: b.type,
        category: null as string | null,
        installmentNumber: null as number | null,
        installmentTotal: null as number | null,
        pending: true,
      })),
      // recorrência vinculada ainda sem conta gerada nesse ciclo — mesmo
      // critério do cálculo de comprometido/limite usado, pra explicar de
      // onde vem esse valor extra na tela de detalhe
      ...projected.items.map((p) => ({
        id: p.id,
        kind: "recurring" as const,
        description: p.description,
        amount: p.amount,
        date: end,
        type: "EXPENSE" as const,
        category: null as string | null,
        installmentNumber: null as number | null,
        installmentTotal: null as number | null,
        pending: true,
      })),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const realCommitted = await sumCardCommitment(id, { gte: start, lte: end });
    const realLimitUsed = await sumCardCommitment(id, { gte: start });
    const committed = realCommitted + projected.amount;
    const limitUsed = realLimitUsed + projected.amount;
    const limit = Number(card.limitAmount);

    return {
      card,
      cycleStart: start,
      cycleEnd: end,
      dueDate: dayjs(end).date(card.dueDay).add(card.dueDay <= card.closingDay ? 1 : 0, "month").toISOString(),
      committed,
      limitUsed,
      available: Math.max(0, limit - limitUsed),
      usagePercent: limit > 0 ? Math.round((limitUsed / limit) * 100) : 0,
      items,
    };
  });
}
