import type { ShimApp as FastifyInstance } from "../fastify-shim";
import { z } from "zod";
import dayjs from "dayjs";
import { prisma } from "../lib/prisma";
import { currentUserId } from "../lib/current-user";
import { logAudit } from "../lib/audit";

// Templates de recorrência (assinaturas, aluguel, salário fixo etc.).
// O worker (jobs/worker.ts) já lê esses templates todo dia 1 do mês e gera
// automaticamente o Bill (se EXPENSE) ou Transaction (se INCOME) — essas
// rotas são o que faltava pro usuário conseguir cadastrar/editar isso.
const recurringSchema = z.object({
  description: z.string().min(1),
  amount: z.number().positive(),
  type: z.enum(["INCOME", "EXPENSE"]),
  categoryId: z.string().uuid().optional().nullable(),
  dayOfMonth: z.number().int().min(1).max(28),
  isSubscription: z.boolean().default(false),
  active: z.boolean().default(true),
  // alerta customizado opcional aplicado a cada conta gerada mensalmente
  // (tipo lembrete recorrente de calendário): "avisar N dias antes, às HH:mm"
  alertDaysBefore: z.number().int().min(0).optional().nullable(),
  alertTimeOfDay: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido, use o formato HH:mm")
    .optional()
    .nullable(),
  // só faz sentido pra EXPENSE — toda conta gerada mensalmente já nasce
  // vinculada a esse cartão
  creditCardId: z.string().uuid().optional().nullable(),
});

export async function recurringRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/recurring-templates", async (req) => {
    const userId = currentUserId(req);
    return prisma.recurringTemplate.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  });

  app.post("/recurring-templates", async (req, reply) => {
    const userId = currentUserId(req);
    const body = recurringSchema.parse(req.body);
    const template = await prisma.recurringTemplate.create({
      data: { ...body, userId },
    });
    await logAudit(userId, "recurring_template", template.id, "create", body);
    return reply.code(201).send(template);
  });

  app.put("/recurring-templates/:id", async (req, reply) => {
    const userId = currentUserId(req);
    const { id } = req.params as { id: string };
    const owned = await prisma.recurringTemplate.findFirst({ where: { id, userId } });
    if (!owned) return reply.code(404).send({ error: "Recorrência não encontrada" });

    const body = recurringSchema.partial().parse(req.body);
    const template = await prisma.recurringTemplate.update({ where: { id }, data: body });
    await logAudit(userId, "recurring_template", id, "update", body);
    return template;
  });

  // pausar/retomar rapidamente, sem precisar reenviar o objeto todo
  app.post("/recurring-templates/:id/toggle", async (req, reply) => {
    const userId = currentUserId(req);
    const { id } = req.params as { id: string };
    const owned = await prisma.recurringTemplate.findFirst({ where: { id, userId } });
    if (!owned) return reply.code(404).send({ error: "Recorrência não encontrada" });
    const template = await prisma.recurringTemplate.update({
      where: { id },
      data: { active: !owned.active },
    });
    await logAudit(userId, "recurring_template", id, "update", { active: template.active });
    return template;
  });

  // "Lançar agora" — gera a conta/lançamento real de um mês específico sem
  // esperar o cron do dia 1 (worker.ts). É o que "libera" um item previsto
  // que aparece no Extrato (recorrência com dia já passado no mês, mas
  // ainda sem Bill/Transaction real) — o usuário clica e confirma o
  // lançamento, em vez de ficar só olhando uma prévia travada.
  // EXPENSE vira Bill (igual ao cron); markPaid=true já cria o pagamento
  // junto (Bill PAID + Transaction), pra marcar "paga" num clique só.
  // INCOME vira Transaction direto, igual o cron já faz.
  app.post("/recurring-templates/:id/generate", async (req, reply) => {
    const userId = currentUserId(req);
    const { id } = req.params as { id: string };
    const { month, markPaid } = (req.body as { month?: string; markPaid?: boolean }) ?? {};
    const template = await prisma.recurringTemplate.findFirst({ where: { id, userId } });
    if (!template) return reply.code(404).send({ error: "Recorrência não encontrada" });
    if (!template.active) return reply.code(400).send({ error: "Recorrência está pausada" });

    const ref = month ? dayjs(`${month}-01`) : dayjs();
    const daysInMonth = ref.daysInMonth();
    const day = Math.min(template.dayOfMonth, daysInMonth);
    // mesma âncora ao meio-dia UTC usada em todo o resto do app (ver
    // lib/dates.ts) — evita o lançamento "voltar um dia" ao exibir no fuso
    // do Brasil
    const dueDate = new Date(Date.UTC(ref.year(), ref.month(), day, 12, 0, 0));
    const monthStart = new Date(Date.UTC(ref.year(), ref.month(), 1, 0, 0, 0));
    const monthEnd = new Date(Date.UTC(ref.year(), ref.month(), daysInMonth, 23, 59, 59));

    if (template.type === "INCOME") {
      const existing = await prisma.transaction.findFirst({
        where: { recurringTemplateId: id, date: { gte: monthStart, lte: monthEnd } },
      });
      if (existing) return reply.code(409).send({ error: "Esse mês já foi lançado", transaction: existing });

      const transaction = await prisma.transaction.create({
        data: {
          userId,
          type: "INCOME",
          amount: template.amount,
          categoryId: template.categoryId,
          date: dueDate,
          description: template.description,
          recurrenceType: "FIXED_MONTHLY",
          recurringTemplateId: template.id,
        },
      });
      await prisma.recurringTemplate.update({ where: { id }, data: { lastGeneratedAt: new Date() } });
      await logAudit(userId, "recurring_template", id, "update", { month: ref.format("YYYY-MM") });
      return reply.code(201).send({ transaction });
    }

    const existingBill = await prisma.bill.findFirst({
      where: { recurringTemplateId: id, dueDate: { gte: monthStart, lte: monthEnd } },
    });
    if (existingBill) return reply.code(409).send({ error: "Esse mês já foi lançado", bill: existingBill });

    const customAlertAt =
      template.alertDaysBefore != null && template.alertTimeOfDay
        ? (() => {
            const [h, m] = template.alertTimeOfDay!.split(":").map(Number);
            return dayjs(dueDate).subtract(template.alertDaysBefore!, "day").hour(h).minute(m).second(0).toDate();
          })()
        : null;

    const bill = await prisma.bill.create({
      data: {
        userId,
        description: template.description,
        amount: template.amount,
        type: "EXPENSE",
        dueDate,
        recurringTemplateId: template.id,
        customAlertAt,
        creditCardId: template.creditCardId,
      },
    });
    await prisma.recurringTemplate.update({ where: { id }, data: { lastGeneratedAt: new Date() } });

    if (!markPaid) {
      await logAudit(userId, "recurring_template", id, "update", { month: ref.format("YYYY-MM") });
      return reply.code(201).send({ bill });
    }

    const [paidBill, transaction] = await prisma.$transaction([
      prisma.bill.update({ where: { id: bill.id }, data: { status: "PAID", paidAt: new Date() } }),
      prisma.transaction.create({
        data: {
          userId,
          type: "EXPENSE",
          amount: bill.amount,
          categoryId: template.categoryId,
          date: new Date(),
          description: bill.description,
          creditCardId: bill.creditCardId,
          paymentMethod: bill.creditCardId ? "CREDIT_CARD" : "OTHER",
        },
      }),
    ]);
    await logAudit(userId, "recurring_template", id, "update", { month: ref.format("YYYY-MM"), markPaid: true });
    return reply.code(201).send({ bill: paidBill, transaction });
  });

  app.delete("/recurring-templates/:id", async (req, reply) => {
    const userId = currentUserId(req);
    const { id } = req.params as { id: string };
    const owned = await prisma.recurringTemplate.findFirst({ where: { id, userId } });
    if (!owned) return reply.code(404).send({ error: "Recorrência não encontrada" });
    await prisma.recurringTemplate.delete({ where: { id } });
    await logAudit(userId, "recurring_template", id, "delete");
    return reply.code(204).send();
  });
}
