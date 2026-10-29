import type { ShimApp as FastifyInstance } from "../fastify-shim";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { currentUserId } from "../lib/current-user";
import { logAudit } from "../lib/audit";
import { parseClientDate } from "../lib/dates";

const budgetSchema = z.object({
  categoryId: z.string().uuid(),
  referenceMonth: z.string(), // ISO, primeiro dia do mês
  limitAmount: z.number().positive(),
  alertThresholdPercent: z.number().int().min(1).max(100).default(80),
});

export async function budgetRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/budgets", async (req) => {
    const userId = currentUserId(req);
    const { month } = req.query as { month?: string };
    const where: any = { userId };
    if (month) where.referenceMonth = parseClientDate(month);

    const budgets = await prisma.budget.findMany({
      where,
      include: { category: true },
    });

    // calcula o gasto real de cada categoria no mês de referência
    const results = await Promise.all(
      budgets.map(async (b) => {
        const start = b.referenceMonth;
        const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
        const agg = await prisma.transaction.aggregate({
          where: {
            userId,
            categoryId: b.categoryId,
            type: "EXPENSE",
            date: { gte: start, lt: end },
          },
          _sum: { amount: true },
        });
        const spent = Number(agg._sum.amount ?? 0);
        const limit = Number(b.limitAmount);
        return {
          ...b,
          spent,
          usagePercent: limit > 0 ? Math.round((spent / limit) * 100) : 0,
          exceeded: spent > limit,
        };
      })
    );

    return results;
  });

  app.post("/budgets", async (req, reply) => {
    const userId = currentUserId(req);
    const body = budgetSchema.parse(req.body);
    const budget = await prisma.budget.upsert({
      where: {
        userId_categoryId_referenceMonth: {
          userId,
          categoryId: body.categoryId,
          referenceMonth: parseClientDate(body.referenceMonth),
        },
      },
      create: { ...body, userId, referenceMonth: parseClientDate(body.referenceMonth) },
      update: {
        limitAmount: body.limitAmount,
        alertThresholdPercent: body.alertThresholdPercent,
      },
    });
    await logAudit(userId, "budget", budget.id, "create", body);
    return reply.code(201).send(budget);
  });

  app.delete("/budgets/:id", async (req, reply) => {
    const userId = currentUserId(req);
    const { id } = req.params as { id: string };
    const owned = await prisma.budget.findFirst({ where: { id, userId } });
    if (!owned) return reply.code(404).send({ error: "Orçamento não encontrado" });
    await prisma.budget.delete({ where: { id } });
    await logAudit(userId, "budget", id, "delete");
    return reply.code(204).send();
  });
}
