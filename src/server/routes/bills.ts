import type { ShimApp as FastifyInstance } from "../fastify-shim";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { currentUserId } from "../lib/current-user";
import { logAudit } from "../lib/audit";
import { evaluateBillReminder, DEFAULT_REMINDER_DAYS } from "../lib/reminders";
import { parseClientDate } from "../lib/dates";

const billSchema = z.object({
  description: z.string().min(1),
  amount: z.number().positive(),
  type: z.enum(["INCOME", "EXPENSE"]),
  dueDate: z.string(),
  // se não vier, usa o padrão configurado em /telegram/settings (ou [3,1,0])
  reminderDaysBefore: z.array(z.number().int().min(0)).optional(),
  // alerta customizado (data/hora específica, tipo evento de calendário) —
  // quando preenchido, ignora reminderDaysBefore e o horário padrão
  customAlertAt: z.string().optional().nullable(),
  creditCardId: z.string().uuid().optional().nullable(),
});

export async function billRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/bills", async (req) => {
    const userId = currentUserId(req);
    const { status } = req.query as { status?: string };
    const where: any = { userId };
    if (status) where.status = status;
    return prisma.bill.findMany({ where, orderBy: { dueDate: "asc" } });
  });

  app.post("/bills", async (req, reply) => {
    const userId = currentUserId(req);
    const body = billSchema.parse(req.body);

    let reminderDaysBefore = body.reminderDaysBefore;
    if (!reminderDaysBefore) {
      const link = await prisma.telegramLink.findUnique({ where: { userId } });
      reminderDaysBefore = (link?.defaultReminderDays as number[]) ?? DEFAULT_REMINDER_DAYS;
    }

    const bill = await prisma.bill.create({
      data: {
        userId,
        description: body.description,
        amount: body.amount,
        type: body.type,
        dueDate: parseClientDate(body.dueDate),
        reminderDaysBefore,
        customAlertAt: body.customAlertAt ? parseClientDate(body.customAlertAt) : null,
        creditCardId: body.creditCardId ?? null,
      },
    });
    await logAudit(userId, "bill", bill.id, "create", body);

    // dispara a checagem de alerta já na hora do cadastro — se a data de
    // vencimento cair num dos dias de aviso (ex: vence hoje), o Telegram
    // recebe a notificação sem precisar esperar o cron das 8h do dia seguinte
    await evaluateBillReminder(bill);

    return reply.code(201).send(bill);
  });

  app.put("/bills/:id", async (req, reply) => {
    const userId = currentUserId(req);
    const { id } = req.params as { id: string };
    const owned = await prisma.bill.findFirst({ where: { id, userId } });
    if (!owned) return reply.code(404).send({ error: "Conta não encontrada" });

    const body = billSchema.partial().parse(req.body);
    const bill = await prisma.bill.update({
      where: { id },
      data: {
        ...body,
        dueDate: body.dueDate ? parseClientDate(body.dueDate) : undefined,
        customAlertAt:
          body.customAlertAt !== undefined
            ? body.customAlertAt
              ? parseClientDate(body.customAlertAt)
              : null
            : undefined,
      },
    });
    await logAudit(userId, "bill", id, "update", body);

    if (body.dueDate || body.reminderDaysBefore) {
      await evaluateBillReminder(bill);
    }

    return bill;
  });

  app.post("/bills/:id/pay", async (req, reply) => {
    const userId = currentUserId(req);
    const { id } = req.params as { id: string };
    const owned = await prisma.bill.findFirst({ where: { id, userId } });
    if (!owned) return reply.code(404).send({ error: "Conta não encontrada" });

    const [bill, transaction] = await prisma.$transaction([
      prisma.bill.update({
        where: { id },
        data: { status: "PAID", paidAt: new Date() },
      }),
      prisma.transaction.create({
        data: {
          userId,
          type: owned.type,
          amount: owned.amount,
          date: new Date(),
          description: `Pagamento: ${owned.description}`,
          creditCardId: owned.creditCardId ?? null,
          paymentMethod: owned.creditCardId ? "CREDIT_CARD" : "OTHER",
        },
      }),
    ]);

    await logAudit(userId, "bill", id, "update", { status: "PAID" });
    return { bill, transaction };
  });

  // cancelar sem excluir o histórico (ex: conta que não vai mais ser paga,
  // mas o usuário quer manter o registro de que existiu)
  app.post("/bills/:id/cancel", async (req, reply) => {
    const userId = currentUserId(req);
    const { id } = req.params as { id: string };
    const owned = await prisma.bill.findFirst({ where: { id, userId } });
    if (!owned) return reply.code(404).send({ error: "Conta não encontrada" });
    const bill = await prisma.bill.update({ where: { id }, data: { status: "CANCELED" } });
    await logAudit(userId, "bill", id, "update", { status: "CANCELED" });
    return bill;
  });

  app.delete("/bills/:id", async (req, reply) => {
    const userId = currentUserId(req);
    const { id } = req.params as { id: string };
    const owned = await prisma.bill.findFirst({ where: { id, userId } });
    if (!owned) return reply.code(404).send({ error: "Conta não encontrada" });
    await prisma.bill.delete({ where: { id } });
    await logAudit(userId, "bill", id, "delete");
    return reply.code(204).send();
  });
}
