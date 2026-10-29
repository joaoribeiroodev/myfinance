import type { ShimApp as FastifyInstance } from "../fastify-shim";
import { z } from "zod";
import dayjs from "dayjs";
import { prisma } from "../lib/prisma";
import { currentUserId } from "../lib/current-user";
import { logAudit } from "../lib/audit";
import { parseClientDate } from "../lib/dates";

const goalSchema = z.object({
  name: z.string().min(1),
  icon: z.string().optional(),
  targetAmount: z.number().positive(),
  targetDate: z.string().optional().nullable(),
  monthlyTarget: z.number().positive().optional().nullable(),
  reminderDay: z.number().int().min(1).max(28).optional().nullable(),
  // pausar um cofrinho só impede os lembretes de aporte mensal — não afeta
  // o saldo guardado nem impede movimentações manuais
  status: z.enum(["IN_PROGRESS", "PAUSED"]).optional(),
});

const contributionSchema = z.object({
  amount: z.number().positive(),
  note: z.string().optional(),
  type: z.enum(["CONTRIBUTION", "WITHDRAWAL"]).default("CONTRIBUTION"),
});

export async function goalRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/goals", async (req) => {
    const userId = currentUserId(req);
    const goals = await prisma.goal.findMany({
      where: { userId },
      include: { contributions: { orderBy: { date: "desc" }, take: 5 } },
      orderBy: { createdAt: "desc" },
    });

    // Projeção simples: quanto tempo falta no ritmo médio de aportes
    return goals.map((g) => {
      const current = Number(g.currentAmount);
      const target = Number(g.targetAmount);
      const progressPercent = target > 0 ? Math.round((current / target) * 100) : 0;

      let estimatedCompletionDate: string | null = null;
      if (g.contributions.length >= 2) {
        const first = g.contributions[g.contributions.length - 1];
        const monthsElapsed = Math.max(
          1,
          dayjs().diff(dayjs(first.date), "month")
        );
        const avgMonthly =
          g.contributions.reduce((sum, c) => sum + Number(c.amount), 0) /
          monthsElapsed;
        const remaining = target - current;
        if (avgMonthly > 0 && remaining > 0) {
          const monthsNeeded = Math.ceil(remaining / avgMonthly);
          estimatedCompletionDate = dayjs().add(monthsNeeded, "month").toISOString();
        }
      }

      return { ...g, progressPercent, estimatedCompletionDate };
    });
  });

  app.post("/goals", async (req, reply) => {
    const userId = currentUserId(req);
    const body = goalSchema.parse(req.body);
    const goal = await prisma.goal.create({
      data: {
        userId,
        name: body.name,
        icon: body.icon,
        targetAmount: body.targetAmount,
        targetDate: body.targetDate ? parseClientDate(body.targetDate) : null,
        monthlyTarget: body.monthlyTarget ?? null,
        reminderDay: body.reminderDay ?? null,
      },
    });
    await logAudit(userId, "goal", goal.id, "create", body);
    return reply.code(201).send(goal);
  });

  // Aporte (CONTRIBUTION) ou retirada (WITHDRAWAL) no cofrinho.
  // Retirada é registrada como contribuição de valor negativo, pra manter
  // o histórico (GoalContribution) como extrato único de movimentações.
  app.post("/goals/:id/contributions", async (req, reply) => {
    const userId = currentUserId(req);
    const { id } = req.params as { id: string };
    const owned = await prisma.goal.findFirst({ where: { id, userId } });
    if (!owned) return reply.code(404).send({ error: "Meta não encontrada" });

    const body = contributionSchema.parse(req.body);
    const isWithdrawal = body.type === "WITHDRAWAL";

    if (isWithdrawal && body.amount > Number(owned.currentAmount)) {
      return reply.code(400).send({ error: "Valor de retirada maior que o saldo guardado no cofrinho" });
    }

    const delta = isWithdrawal ? -body.amount : body.amount;
    const [contribution, goal] = await prisma.$transaction([
      prisma.goalContribution.create({
        data: { goalId: id, amount: delta, note: body.note },
      }),
      prisma.goal.update({
        where: { id },
        data: { currentAmount: { increment: delta } },
      }),
    ]);

    if (Number(goal.currentAmount) >= Number(goal.targetAmount)) {
      await prisma.goal.update({ where: { id }, data: { status: "COMPLETED" } });
    } else if (owned.status === "COMPLETED") {
      // retirada depois de completo volta pro andamento
      await prisma.goal.update({ where: { id }, data: { status: "IN_PROGRESS" } });
    }

    await logAudit(userId, "goal", id, "update", { contribution: body });
    return reply.code(201).send(contribution);
  });

  app.put("/goals/:id", async (req, reply) => {
    const userId = currentUserId(req);
    const { id } = req.params as { id: string };
    const owned = await prisma.goal.findFirst({ where: { id, userId } });
    if (!owned) return reply.code(404).send({ error: "Meta não encontrada" });

    const body = goalSchema.partial().parse(req.body);
    const goal = await prisma.goal.update({
      where: { id },
      data: {
        ...body,
        targetDate: body.targetDate !== undefined ? (body.targetDate ? parseClientDate(body.targetDate) : null) : undefined,
      },
    });
    await logAudit(userId, "goal", id, "update", body);
    return goal;
  });

  app.delete("/goals/:id", async (req, reply) => {
    const userId = currentUserId(req);
    const { id } = req.params as { id: string };
    const owned = await prisma.goal.findFirst({ where: { id, userId } });
    if (!owned) return reply.code(404).send({ error: "Meta não encontrada" });
    await prisma.goal.delete({ where: { id } });
    await logAudit(userId, "goal", id, "delete");
    return reply.code(204).send();
  });
}
