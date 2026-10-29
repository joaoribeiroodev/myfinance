import type { ShimApp as FastifyInstance } from "../fastify-shim";
import dayjs from "dayjs";
import { prisma } from "../lib/prisma";
import { currentUserId } from "../lib/current-user";
import { projectMonth, mergeExpenseTotalsByCategory } from "../lib/projection";

export async function dashboardRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/dashboard/summary", async (req) => {
    const userId = currentUserId(req);
    const { month } = req.query as { month?: string };
    const ref = month ? dayjs(month) : dayjs();
    const start = ref.startOf("month").toDate();
    const end = ref.endOf("month").toDate();

    const [incomeAgg, expenseAgg, byCategory, bills, budgets, goalsAgg] = await Promise.all([
      prisma.transaction.aggregate({
        where: { userId, type: "INCOME", date: { gte: start, lte: end } },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: { userId, type: "EXPENSE", date: { gte: start, lte: end } },
        _sum: { amount: true },
      }),
      prisma.transaction.groupBy({
        by: ["categoryId"],
        where: { userId, type: "EXPENSE", date: { gte: start, lte: end } },
        _sum: { amount: true },
      }),
      prisma.bill.findMany({
        where: { userId, status: "PENDING", dueDate: { gte: new Date() } },
        orderBy: { dueDate: "asc" },
        take: 5,
      }),
      prisma.budget.findMany({
        where: { userId, referenceMonth: start },
      }),
      // dinheiro guardado em cofrinhos ainda em andamento (não concluídos) —
      // considerado "reservado", fora do saldo disponível de verdade
      prisma.goal.aggregate({
        where: { userId, status: "IN_PROGRESS" },
        _sum: { currentAmount: true },
      }),
    ]);

    // Recorrências ativas só geram o lançamento/conta de verdade no dia 1 do
    // mês (ver jobs/worker.ts). Pra um mês atual ou futuro ainda não gerado,
    // isso fazia o dashboard mostrar tudo zerado mesmo com assinaturas,
    // salário fixo etc. já cadastrados. projectMonth soma o valor de cada
    // template/renda fixa ainda não lançado nesse mês (compartilhado com o
    // resumo do bot do Telegram, pra os dois baterem sempre o mesmo número).
    const projection = await projectMonth(
      userId,
      ref,
      Number(incomeAgg._sum.amount ?? 0),
      Number(expenseAgg._sum.amount ?? 0)
    );
    const { totalIncome, totalExpense, hasProjectedRecurring, projectedItems } = projection;

    const balance = totalIncome - totalExpense;
    const reservedInGoals = Number(goalsAgg._sum.currentAmount ?? 0);
    const availableBalance = balance - reservedInGoals;

    // Lista de consulta rápida: tudo que entra/sai nesse mês — lançamentos
    // já realizados + contas agendadas (pendentes/atrasadas) que caem no
    // mês + o que foi projetado de recorrências/renda fixa ainda não
    // geradas (marcado como "projected" pro front distinguir visualmente).
    const [monthTransactionsList, monthBillsList] = await Promise.all([
      prisma.transaction.findMany({
        where: { userId, date: { gte: start, lte: end } },
        select: { id: true, description: true, amount: true, type: true, date: true },
      }),
      prisma.bill.findMany({
        where: { userId, dueDate: { gte: start, lte: end }, status: { in: ["PENDING", "OVERDUE"] } },
        select: { id: true, description: true, amount: true, type: true, dueDate: true, status: true },
      }),
    ]);
    const monthItems = [
      ...monthTransactionsList.map((t) => ({
        id: t.id,
        description: t.description,
        amount: Number(t.amount),
        type: t.type,
        date: t.date.toISOString(),
        projected: false as const,
      })),
      ...monthBillsList.map((b) => ({
        id: b.id,
        description: b.description,
        amount: Number(b.amount),
        type: b.type,
        date: b.dueDate.toISOString(),
        projected: false as const,
      })),
      ...projectedItems,
    ].sort((a, b) => (a.date < b.date ? -1 : 1));

    // Inclui aqui também as despesas projetadas (recorrências ainda não
    // lançadas no mês) — senão uma assinatura categorizada mas ainda não
    // cobrada simplesmente não aparecia em "despesas por categoria".
    const mergedCategoryTotals = mergeExpenseTotalsByCategory(
      byCategory.map((c) => ({ categoryId: c.categoryId, total: Number(c._sum.amount ?? 0) })),
      projectedItems
    );
    const categories = await prisma.category.findMany({
      where: { id: { in: mergedCategoryTotals.map((c) => c.categoryId).filter(Boolean) as string[] } },
    });
    const expensesByCategoryRaw = mergedCategoryTotals.map((c) => ({
      category: categories.find((cat) => cat.id === c.categoryId)?.name ?? "Sem categoria",
      total: c.total,
    }));
    const expensesByCategory = expensesByCategoryRaw.map((c) => ({
      ...c,
      percent: totalExpense > 0 ? Math.round((c.total / totalExpense) * 100) : 0,
    }));

    // fluxo de caixa diário do mês — monta TODOS os dias do mês (não só os
    // que têm lançamento), senão o gráfico "pula" entre dias com dado e
    // desenha uma linha reta cobrindo dias vazios, dando a impressão errada
    // de uma transição gradual onde não houve nada. Também soma o saldo
    // acumulado dia a dia, que é o que normalmente se espera ver num
    // "fluxo de caixa" (como o saldo vai evoluindo ao longo do mês).
    const monthTransactionsForCashFlow = await prisma.transaction.findMany({
      where: { userId, date: { gte: start, lte: end } },
      select: { date: true, amount: true, type: true },
    });
    const cashFlowMap = new Map<string, { income: number; expense: number }>();
    for (const t of monthTransactionsForCashFlow) {
      const key = dayjs(t.date).format("YYYY-MM-DD");
      const entry = cashFlowMap.get(key) ?? { income: 0, expense: 0 };
      if (t.type === "INCOME") entry.income += Number(t.amount);
      else entry.expense += Number(t.amount);
      cashFlowMap.set(key, entry);
    }
    let runningBalance = 0;
    const daysInMonth = ref.daysInMonth();
    const cashFlow = Array.from({ length: daysInMonth }, (_, i) => {
      const date = ref.date(i + 1).format("YYYY-MM-DD");
      const entry = cashFlowMap.get(date) ?? { income: 0, expense: 0 };
      runningBalance += entry.income - entry.expense;
      return { date, income: entry.income, expense: entry.expense, balance: runningBalance };
    });

    // utilização média dos orçamentos do mês
    let budgetUsagePercent: number | null = null;
    if (budgets.length > 0) {
      const usages = await Promise.all(
        budgets.map(async (b) => {
          const agg = await prisma.transaction.aggregate({
            where: { userId, categoryId: b.categoryId, type: "EXPENSE", date: { gte: start, lte: end } },
            _sum: { amount: true },
          });
          const spent = Number(agg._sum.amount ?? 0);
          return Number(b.limitAmount) > 0 ? spent / Number(b.limitAmount) : 0;
        })
      );
      budgetUsagePercent = Math.round(
        (usages.reduce((a, b) => a + b, 0) / usages.length) * 100
      );
    }

    // Health Score (0-100): combina taxa de poupança + aderência ao orçamento.
    // Sem nenhum lançamento no mês, não há base pra calcular nada — os
    // valores-padrão (50 pts de poupança, 70 pts de orçamento) faziam o
    // score aparecer como 58 mesmo com tudo zerado, parecendo "saudável"
    // sem motivo. Nesse caso devolvemos null e o front mostra "—".
    const hasActivity = totalIncome > 0 || totalExpense > 0;
    let healthScore: number | null = null;
    if (hasActivity) {
      const savingsRate = totalIncome > 0 ? balance / totalIncome : 0;
      const savingsScore = Math.max(0, Math.min(100, savingsRate * 100 + 50)); // 0% poupança = 50 pts, 50% = 100
      const budgetScore =
        budgetUsagePercent === null ? 70 : Math.max(0, 100 - Math.max(0, budgetUsagePercent - 100));
      healthScore = Math.round(savingsScore * 0.6 + budgetScore * 0.4);
    }

    return {
      period: ref.format("YYYY-MM"),
      totalIncome,
      totalExpense,
      balance,
      reservedInGoals,
      availableBalance,
      budgetUsagePercent,
      healthScore,
      hasProjectedRecurring,
      upcomingBills: bills.map((b) => ({
        id: b.id,
        description: b.description,
        amount: Number(b.amount),
        dueDate: b.dueDate.toISOString(),
        status: b.status,
      })),
      expensesByCategory,
      cashFlow,
      monthItems,
    };
  });

  // Projeção financeira simples: média móvel dos últimos 3 meses + recorrências cadastradas
  app.get("/dashboard/projection", async (req) => {
    const userId = currentUserId(req);
    const months = 3;
    const since = dayjs().subtract(months, "month").startOf("month").toDate();

    const transactions = await prisma.transaction.findMany({
      where: { userId, date: { gte: since } },
    });

    const incomeAvg =
      transactions.filter((t) => t.type === "INCOME").reduce((s, t) => s + Number(t.amount), 0) /
      months;
    const expenseAvg =
      transactions.filter((t) => t.type === "EXPENSE").reduce((s, t) => s + Number(t.amount), 0) /
      months;

    const recurringTemplates = await prisma.recurringTemplate.findMany({
      where: { userId, active: true },
    });
    const recurringIncome = recurringTemplates
      .filter((t) => t.type === "INCOME")
      .reduce((s, t) => s + Number(t.amount), 0);
    const recurringExpense = recurringTemplates
      .filter((t) => t.type === "EXPENSE")
      .reduce((s, t) => s + Number(t.amount), 0);

    const projectedMonthlyIncome = Math.max(incomeAvg, recurringIncome);
    const projectedMonthlyExpense = Math.max(expenseAvg, recurringExpense);
    const projectedBalance = projectedMonthlyIncome - projectedMonthlyExpense;

    const nextMonths = Array.from({ length: 6 }).map((_, i) => {
      const date = dayjs().add(i + 1, "month").format("YYYY-MM");
      return {
        month: date,
        projectedIncome: projectedMonthlyIncome,
        projectedExpense: projectedMonthlyExpense,
        projectedBalance: projectedBalance * (i + 1),
      };
    });

    return { projectedMonthlyIncome, projectedMonthlyExpense, projectedBalance, nextMonths };
  });
}
