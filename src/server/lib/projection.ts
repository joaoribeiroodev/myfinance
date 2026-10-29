// Projeção de recorrências ainda não lançadas no mês (templates ativos e
// renda fixa cadastrada em Configurações) — extraído de dashboard.ts pra ser
// reutilizado também pelo resumo do bot do Telegram, garantindo que os dois
// mostrem exatamente o mesmo saldo/receitas/despesas do mês.
import dayjs, { Dayjs } from "dayjs";
import { prisma } from "./prisma";

export interface ProjectedItem {
  id: string;
  description: string;
  amount: number;
  type: "INCOME" | "EXPENSE";
  date: string;
  projected: true;
  // categoria da recorrência (quando houver) — usada pra "despesas por
  // categoria" também contar o que ainda não foi lançado nesse mês, e não
  // só os lançamentos reais. Renda fixa (Income) não tem categoria.
  categoryId: string | null;
}

export interface MonthProjection {
  totalIncome: number;
  totalExpense: number;
  hasProjectedRecurring: boolean;
  projectedItems: ProjectedItem[];
}

/**
 * Soma às receitas/despesas já realizadas no mês (totalIncome/totalExpense
 * recebidos) o valor de recorrências ativas e renda fixa que ainda não
 * geraram um lançamento/conta real nesse mês. Só projeta pra mês atual ou
 * futuro — meses passados não são afetados, pra não alterar histórico já
 * fechado.
 */
// Mesma estratégia de ancoragem ao meio-dia UTC do parseClientDate (ver
// lib/dates.ts): evita que a data projetada "volte um dia" ao ser exibida
// no fuso do Brasil (UTC-3) quando o servidor roda em UTC.
function utcNoonISO(ref: Dayjs, day: number): string {
  return new Date(Date.UTC(ref.year(), ref.month(), day, 12, 0, 0)).toISOString();
}

export async function projectMonth(
  userId: string,
  ref: Dayjs,
  totalIncome: number,
  totalExpense: number
): Promise<MonthProjection> {
  const start = ref.startOf("month").toDate();
  const end = ref.endOf("month").toDate();

  let hasProjectedRecurring = false;
  const projectedItems: ProjectedItem[] = [];

  if (!ref.isBefore(dayjs(), "month")) {
    const [generatedTx, generatedBills] = await Promise.all([
      prisma.transaction.findMany({
        where: { userId, recurringTemplateId: { not: null }, date: { gte: start, lte: end } },
        select: { recurringTemplateId: true },
      }),
      prisma.bill.findMany({
        where: { userId, recurringTemplateId: { not: null }, dueDate: { gte: start, lte: end } },
        select: { recurringTemplateId: true },
      }),
    ]);
    const generatedTxTemplateIds = new Set(generatedTx.map((t) => t.recurringTemplateId));
    const generatedBillTemplateIds = new Set(generatedBills.map((b) => b.recurringTemplateId));

    const recurringTemplates = await prisma.recurringTemplate.findMany({ where: { userId, active: true } });
    for (const t of recurringTemplates) {
      const alreadyGenerated =
        t.type === "INCOME" ? generatedTxTemplateIds.has(t.id) : generatedBillTemplateIds.has(t.id);
      if (alreadyGenerated) continue;
      hasProjectedRecurring = true;
      if (t.type === "INCOME") totalIncome += Number(t.amount);
      else totalExpense += Number(t.amount);
      projectedItems.push({
        id: `recurring-${t.id}`,
        description: t.description,
        amount: Number(t.amount),
        type: t.type,
        date: utcNoonISO(ref, Math.min(t.dayOfMonth, ref.daysInMonth())),
        projected: true,
        categoryId: t.categoryId,
      });
    }

    const existingIncomesThisMonth = await prisma.income.findMany({
      where: { userId, referenceMonth: start },
      select: { description: true },
    });
    const existingDescriptions = new Set(existingIncomesThisMonth.map((i) => i.description));

    const fixedIncomes = await prisma.income.findMany({
      where: { userId, isFixed: true, referenceMonth: { lt: start } },
      orderBy: { referenceMonth: "desc" },
    });
    const latestFixedByDescription = new Map<string, (typeof fixedIncomes)[number]>();
    for (const inc of fixedIncomes) {
      if (!latestFixedByDescription.has(inc.description)) latestFixedByDescription.set(inc.description, inc);
    }
    for (const [description, inc] of latestFixedByDescription) {
      if (existingDescriptions.has(description)) continue;
      hasProjectedRecurring = true;
      totalIncome += Number(inc.amount);
      projectedItems.push({
        id: `income-${inc.id}`,
        description,
        amount: Number(inc.amount),
        type: "INCOME",
        date: utcNoonISO(ref, inc.payDay ? Math.min(inc.payDay, ref.daysInMonth()) : 1),
        projected: true,
        categoryId: null,
      });
    }
  }

  return { totalIncome, totalExpense, hasProjectedRecurring, projectedItems };
}

/**
 * Soma às despesas reais já agrupadas por categoria (ex: resultado de um
 * `prisma.transaction.groupBy`) as despesas projetadas (recorrências ainda
 * não lançadas) de mesma categoria — sem isso, "despesas por categoria"
 * ficava faltando tudo que ainda não tinha virado lançamento real no mês
 * (ex: uma assinatura recorrente categorizada, mas ainda não cobrada).
 * Devolve totais por categoria (categoryId null = "Sem categoria") já
 * prontos pra buscar o nome da categoria e calcular o percentual.
 */
export function mergeExpenseTotalsByCategory(
  realByCategory: { categoryId: string | null; total: number }[],
  projectedItems: ProjectedItem[]
): { categoryId: string | null; total: number }[] {
  const totals = new Map<string, number>();
  for (const c of realByCategory) {
    const key = c.categoryId ?? "__none__";
    totals.set(key, (totals.get(key) ?? 0) + c.total);
  }
  for (const item of projectedItems) {
    if (item.type !== "EXPENSE") continue;
    const key = item.categoryId ?? "__none__";
    totals.set(key, (totals.get(key) ?? 0) + item.amount);
  }
  return Array.from(totals.entries()).map(([key, total]) => ({
    categoryId: key === "__none__" ? null : key,
    total,
  }));
}
