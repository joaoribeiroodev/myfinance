// Monta os dados do relatório "Despesas do mês" — lista enxuta de cada
// despesa do mês (lançada de verdade OU projetada de uma recorrência ainda
// não gerada) com descrição e valor, mais os totais. Usado tanto pela
// exportação em PDF quanto pela aba extra no Excel.
import dayjs from "dayjs";
import { prisma } from "./prisma";
import { projectMonth } from "./projection";

const MONTHS_PT = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

export interface MonthReportItem {
  description: string;
  amount: number;
  projected: boolean;
  type: "INCOME" | "EXPENSE";
}

export interface MonthReport {
  month: string; // "YYYY-MM"
  monthLabel: string; // ex: "novembro"
  items: MonthReportItem[]; // só despesas, maior valor primeiro
  totalExpense: number;
  totalIncome: number;
  balance: number;
}

export async function buildMonthReport(userId: string, monthParam?: string): Promise<MonthReport> {
  const ref = monthParam ? dayjs(monthParam) : dayjs();
  const start = ref.startOf("month").toDate();
  const end = ref.endOf("month").toDate();

  const [incomeAgg, expenseAgg, expenseTransactions, incomeTransactions] = await Promise.all([
    prisma.transaction.aggregate({
      where: { userId, type: "INCOME", date: { gte: start, lte: end } },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { userId, type: "EXPENSE", date: { gte: start, lte: end } },
      _sum: { amount: true },
    }),
    prisma.transaction.findMany({
      where: { userId, type: "EXPENSE", date: { gte: start, lte: end } },
      select: { description: true, amount: true },
    }),
    // receitas reais do mês também entram na lista (não só nos totais) —
    // antes o relatório "Despesas do mês" listava cada despesa mas a
    // receita só aparecia como um número solto no total final
    prisma.transaction.findMany({
      where: { userId, type: "INCOME", date: { gte: start, lte: end } },
      select: { description: true, amount: true },
    }),
  ]);

  // mesma projeção de recorrências/renda fixa do dashboard e do bot, pra
  // o relatório incluir despesas previstas pro mês que ainda não viraram
  // um lançamento real (ex: assinatura que só é cobrada dia 20).
  const { totalIncome, totalExpense, projectedItems } = await projectMonth(
    userId,
    ref,
    Number(incomeAgg._sum.amount ?? 0),
    Number(expenseAgg._sum.amount ?? 0)
  );

  // Receitas primeiro (maior valor primeiro), depois despesas (maior valor
  // primeiro) — separa visualmente o que entra do que sai em vez de
  // misturar tudo só por valor.
  const items: MonthReportItem[] = [
    ...incomeTransactions
      .map((t) => ({ description: t.description, amount: Number(t.amount), projected: false, type: "INCOME" as const }))
      .sort((a, b) => b.amount - a.amount),
    ...projectedItems
      .filter((p) => p.type === "INCOME")
      .map((p) => ({ description: p.description, amount: p.amount, projected: true, type: "INCOME" as const }))
      .sort((a, b) => b.amount - a.amount),
    ...expenseTransactions
      .map((t) => ({ description: t.description, amount: Number(t.amount), projected: false, type: "EXPENSE" as const }))
      .sort((a, b) => b.amount - a.amount),
    ...projectedItems
      .filter((p) => p.type === "EXPENSE")
      .map((p) => ({ description: p.description, amount: p.amount, projected: true, type: "EXPENSE" as const }))
      .sort((a, b) => b.amount - a.amount),
  ];

  return {
    month: ref.format("YYYY-MM"),
    monthLabel: MONTHS_PT[ref.month()],
    items,
    totalExpense,
    totalIncome,
    balance: totalIncome - totalExpense,
  };
}
