import type { ShimApp as FastifyInstance } from "../fastify-shim";
import { z } from "zod";
import dayjs from "dayjs";
import { prisma } from "../lib/prisma";
import { currentUserId } from "../lib/current-user";
import { logAudit } from "../lib/audit";
import { parseClientDate } from "../lib/dates";

// Renda mensal cadastrada manualmente (salário fixo, freelas variáveis etc.)
// Usada no planejamento financeiro mensal — separado dos lançamentos de
// receita pontuais, pra representar "quanto eu espero ganhar este mês".
const incomeSchema = z.object({
  description: z.string().min(1),
  amount: z.number().positive(),
  isFixed: z.boolean().default(true),
  referenceMonth: z.string(), // ISO, primeiro dia do mês
  // dia do mês em que o pagamento efetivamente cai (opcional) — usado pra
  // datar o lançamento gerado e o fluxo de caixa no dia certo, não sempre
  // no dia 1
  payDay: z.number().int().min(1).max(31).optional().nullable(),
});

// Monta a data do lançamento gerado a partir do dia de recebimento
// (Income.payDay) diretamente em UTC, ancorada ao meio-dia — mesma
// estratégia do parseClientDate (ver lib/dates.ts) — em vez de encadear
// pelo dayjs local. referenceMonth já vem normalizado pro dia 1 do mês,
// mas se essa normalização tiver rodado em horário local do servidor
// (ex: container em UTC) o horário gravado pode não ser meia-noite exata
// em UTC; usar os componentes de ano/mês em UTC evita herdar esse
// deslocamento e "voltar um dia" ao exibir no fuso do Brasil (UTC-3) — foi
// o que causava salário cadastrado pro dia 5 aparecer como dia 4 no extrato.
function incomeTransactionDate(referenceMonth: Date, payDay?: number | null) {
  const year = referenceMonth.getUTCFullYear();
  const month = referenceMonth.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = payDay ? Math.min(payDay, daysInMonth) : 1;
  return new Date(Date.UTC(year, month, day, 12, 0, 0));
}

export async function incomeRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/incomes", async (req) => {
    const userId = currentUserId(req);
    const { month } = req.query as { month?: string };
    const where: any = { userId };
    if (month) where.referenceMonth = dayjs(parseClientDate(month)).startOf("month").toDate();
    return prisma.income.findMany({ where, orderBy: { referenceMonth: "desc" } });
  });

  app.post("/incomes", async (req, reply) => {
    const userId = currentUserId(req);
    const body = incomeSchema.parse(req.body);
    const referenceMonth = dayjs(parseClientDate(body.referenceMonth)).startOf("month").toDate();

    const income = await prisma.income.create({
      data: {
        userId,
        description: body.description,
        amount: body.amount,
        isFixed: body.isFixed,
        referenceMonth,
        payDay: body.payDay ?? null,
      },
    });

    // gera o lançamento de Receita vinculado, pra contar de verdade no
    // saldo/health score do dashboard do mês de referência — datado no dia
    // certo do recebimento, se informado, não sempre no dia 1
    await prisma.transaction.create({
      data: {
        userId,
        type: "INCOME",
        amount: body.amount,
        description: body.description,
        date: incomeTransactionDate(referenceMonth, body.payDay),
        incomeId: income.id,
        source: "MANUAL",
      },
    });

    await logAudit(userId, "income", income.id, "create", body);
    return reply.code(201).send(income);
  });

  app.put("/incomes/:id", async (req, reply) => {
    const userId = currentUserId(req);
    const { id } = req.params as { id: string };
    const owned = await prisma.income.findFirst({ where: { id, userId } });
    if (!owned) return reply.code(404).send({ error: "Renda não encontrada" });

    const body = incomeSchema.partial().parse(req.body);
    const referenceMonth = body.referenceMonth
      ? dayjs(parseClientDate(body.referenceMonth)).startOf("month").toDate()
      : undefined;

    const income = await prisma.income.update({
      where: { id },
      data: { ...body, referenceMonth },
    });

    // mantém o lançamento vinculado em sincronia (ou cria, se essa renda foi
    // cadastrada antes dessa vinculação existir)
    const newDate = incomeTransactionDate(income.referenceMonth, income.payDay);
    const linkedTransaction = await prisma.transaction.findFirst({ where: { incomeId: id } });
    if (linkedTransaction) {
      await prisma.transaction.update({
        where: { id: linkedTransaction.id },
        data: {
          amount: body.amount,
          description: body.description,
          date: newDate,
        },
      });
    } else {
      await prisma.transaction.create({
        data: {
          userId,
          type: "INCOME",
          amount: income.amount,
          description: income.description,
          date: newDate,
          incomeId: income.id,
          source: "MANUAL",
        },
      });
    }

    await logAudit(userId, "income", id, "update", body);
    return income;
  });

  app.delete("/incomes/:id", async (req, reply) => {
    const userId = currentUserId(req);
    const { id } = req.params as { id: string };
    const owned = await prisma.income.findFirst({ where: { id, userId } });
    if (!owned) return reply.code(404).send({ error: "Renda não encontrada" });
    await prisma.income.delete({ where: { id } });
    await logAudit(userId, "income", id, "delete");
    return reply.code(204).send();
  });
}
