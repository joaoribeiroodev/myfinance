import type { ShimApp as FastifyInstance } from "../fastify-shim";
import { z } from "zod";
import crypto from "crypto";
import dayjs from "dayjs";
import { prisma } from "../lib/prisma";
import { currentUserId } from "../lib/current-user";
import { logAudit } from "../lib/audit";
import { suggestCategory, reinforceCategoryRule } from "../lib/categorize";
import { parseClientDate } from "../lib/dates";
import { projectMonth } from "../lib/projection";

const transactionSchema = z.object({
  type: z.enum(["INCOME", "EXPENSE"]),
  amount: z.number().positive(),
  categoryId: z.string().uuid().optional().nullable(),
  date: z.string(), // ISO
  description: z.string().min(1),
  paymentMethod: z
    .enum(["PIX", "CREDIT_CARD", "DEBIT_CARD", "CASH", "BANK_TRANSFER", "BOLETO", "OTHER"])
    .default("OTHER"),
  recurrenceType: z.enum(["NONE", "FIXED_MONTHLY", "INSTALLMENT"]).default("NONE"),
  installmentNumber: z.number().int().optional(),
  installmentTotal: z.number().int().optional(),
  attachmentUrl: z.string().optional(),
  creditCardId: z.string().uuid().optional().nullable(),
});

const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  type: z.enum(["INCOME", "EXPENSE"]).optional(),
  paymentMethod: z.string().optional(),
  minAmount: z.coerce.number().optional(),
  maxAmount: z.coerce.number().optional(),
  search: z.string().optional(),
  page: z.coerce.number().default(1),
  pageSize: z.coerce.number().default(50),
  // quando o extrato está na visualização de um mês (não período
  // customizado), manda explicitamente "YYYY-MM" aqui pra incluir as
  // recorrências/renda fixa desse mês que ainda não geraram um lançamento
  // real (mesma projeção do dashboard), marcadas como "projected". Não dá
  // pra inferir isso só olhando from/to: eles chegam em ISO com horário já
  // deslocado pelo fuso do navegador (ver localDateRangeStart/End no
  // front), então o "dia 1" / "último dia" vira outro dia em UTC e some.
  projectedMonth: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
});

export async function transactionRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // Listagem com filtros avançados e busca textual
  app.get("/transactions", async (req) => {
    const userId = currentUserId(req);
    const q = querySchema.parse(req.query);

    const where: any = { userId };
    if (q.from || q.to) {
      where.date = {};
      if (q.from) where.date.gte = parseClientDate(q.from);
      if (q.to) where.date.lte = parseClientDate(q.to);
    }
    if (q.categoryId) where.categoryId = q.categoryId;
    if (q.type) where.type = q.type;
    if (q.paymentMethod) where.paymentMethod = q.paymentMethod;
    if (q.minAmount || q.maxAmount) {
      where.amount = {};
      if (q.minAmount) where.amount.gte = q.minAmount;
      if (q.maxAmount) where.amount.lte = q.maxAmount;
    }
    if (q.search) where.description = { contains: q.search };

    const [items, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: { category: true },
        orderBy: { date: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.transaction.count({ where }),
    ]);

    // Extrato pedindo as recorrências/renda fixa ainda não lançadas nesse
    // mês (mesma projeção usada no dashboard e no relatório) — o mês vem
    // explícito do front (projectedMonth=YYYY-MM), não inferido de from/to.
    let projectedResults: typeof items = [];
    if (q.projectedMonth) {
      const refStart = dayjs(`${q.projectedMonth}-01`);
      const { projectedItems } = await projectMonth(userId, refStart, 0, 0);
      const filtered = projectedItems
        .filter((p) => !q.type || p.type === q.type)
        .filter((p) => !q.categoryId || p.categoryId === q.categoryId)
        .filter((p) => !q.search || p.description.toLowerCase().includes(q.search.toLowerCase()));

      const categoryIds = [...new Set(filtered.map((p) => p.categoryId).filter((id): id is string => !!id))];
      const categoriesById = categoryIds.length
        ? new Map((await prisma.category.findMany({ where: { id: { in: categoryIds } } })).map((c) => [c.id, c]))
        : new Map();

      projectedResults = filtered.map((p) => ({
        id: p.id,
        userId,
        type: p.type,
        amount: p.amount as any,
        categoryId: p.categoryId,
        category: p.categoryId ? categoriesById.get(p.categoryId) ?? null : null,
        date: new Date(p.date),
        description: p.description,
        paymentMethod: "OTHER",
        recurrenceType: "FIXED_MONTHLY",
        installmentNumber: null,
        installmentTotal: null,
        recurringTemplateId: null,
        attachmentUrl: null,
        source: "MANUAL",
        creditCardId: null,
        installmentGroupId: null,
        incomeId: null,
        projected: true,
      })) as any;
    }

    // Contas (Bill) ainda pendentes/vencidas no período filtrado — antes só
    // apareciam na tela "Contas", separada do Extrato, então uma conta
    // cadastrada manualmente por lá (não vinda de recorrência) não tinha
    // como ser marcada como paga a partir daqui. categoryId não se aplica a
    // Bill (não tem categoria), então um filtro de categoria ativo exclui
    // contas, igual já faria com uma despesa sem categoria.
    let billResults: typeof items = [];
    if (!q.categoryId) {
      const billWhere: any = { userId, status: { in: ["PENDING", "OVERDUE"] } };
      if (q.from || q.to) {
        billWhere.dueDate = {};
        if (q.from) billWhere.dueDate.gte = parseClientDate(q.from);
        if (q.to) billWhere.dueDate.lte = parseClientDate(q.to);
      }
      if (q.type) billWhere.type = q.type;
      if (q.search) billWhere.description = { contains: q.search };

      const bills = await prisma.bill.findMany({ where: billWhere });
      billResults = bills.map((b) => ({
        id: b.id,
        userId,
        type: b.type,
        amount: b.amount as any,
        categoryId: null,
        category: null,
        date: b.dueDate,
        description: b.description,
        paymentMethod: "OTHER",
        recurrenceType: "NONE",
        installmentNumber: null,
        installmentTotal: null,
        recurringTemplateId: b.recurringTemplateId,
        attachmentUrl: null,
        source: "MANUAL",
        creditCardId: b.creditCardId,
        installmentGroupId: null,
        incomeId: null,
        projected: false,
        billId: b.id,
        billStatus: b.status,
      })) as any;
    }

    const combined = [...projectedResults, ...billResults, ...items].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    return {
      items: combined,
      total: total + projectedResults.length + billResults.length,
      page: q.page,
      pageSize: q.pageSize,
    };
  });

  // Sugestão de categoria para uma descrição (categorização inteligente)
  app.get("/transactions/suggest-category", async (req) => {
    const userId = currentUserId(req);
    const { description } = req.query as { description?: string };
    if (!description) return { categoryId: null };
    const categoryId = await suggestCategory(userId, description);
    return { categoryId };
  });

  app.post("/transactions", async (req, reply) => {
    const userId = currentUserId(req);
    const body = transactionSchema.parse(req.body);

    // Compra parcelada: gera automaticamente as N parcelas futuras (uma por
    // mês, mesmo dia), todas ligadas por installmentGroupId — antes disso
    // installmentNumber/Total eram só metadados manuais e não geravam nada.
    const isInstallmentPurchase =
      body.recurrenceType === "INSTALLMENT" && (body.installmentTotal ?? 1) > 1;

    if (isInstallmentPurchase) {
      const total = body.installmentTotal!;
      const groupId = crypto.randomUUID();
      const baseDate = dayjs(parseClientDate(body.date));

      const installments = Array.from({ length: total }).map((_, i) => ({
        userId,
        type: body.type,
        amount: body.amount,
        categoryId: body.categoryId ?? null,
        date: baseDate.add(i, "month").toDate(),
        description: `${body.description} (${i + 1}/${total})`,
        paymentMethod: body.paymentMethod,
        recurrenceType: body.recurrenceType,
        installmentNumber: i + 1,
        installmentTotal: total,
        installmentGroupId: groupId,
        attachmentUrl: i === 0 ? body.attachmentUrl : undefined,
        creditCardId: body.creditCardId ?? null,
      }));

      const created = await prisma.$transaction(
        installments.map((data) => prisma.transaction.create({ data }))
      );

      if (body.categoryId) {
        await reinforceCategoryRule(body.categoryId, body.description);
      }
      await logAudit(userId, "transaction", groupId, "create", {
        ...body,
        installmentGroupId: groupId,
        installmentsCreated: total,
      });
      // devolve a primeira parcela (a que representa o lançamento "atual")
      return reply.code(201).send(created[0]);
    }

    const transaction = await prisma.transaction.create({
      data: {
        userId,
        type: body.type,
        amount: body.amount,
        categoryId: body.categoryId ?? null,
        date: parseClientDate(body.date),
        description: body.description,
        paymentMethod: body.paymentMethod,
        recurrenceType: body.recurrenceType,
        installmentNumber: body.installmentNumber,
        installmentTotal: body.installmentTotal,
        attachmentUrl: body.attachmentUrl,
        creditCardId: body.creditCardId ?? null,
      },
    });

    if (body.categoryId) {
      await reinforceCategoryRule(body.categoryId, body.description);
    }

    await logAudit(userId, "transaction", transaction.id, "create", body);
    return reply.code(201).send(transaction);
  });

  app.put("/transactions/:id", async (req, reply) => {
    const userId = currentUserId(req);
    const { id } = req.params as { id: string };
    const owned = await prisma.transaction.findFirst({ where: { id, userId } });
    if (!owned) return reply.code(404).send({ error: "Lançamento não encontrado" });

    const body = transactionSchema.partial().parse(req.body);
    const transaction = await prisma.transaction.update({
      where: { id },
      data: {
        ...body,
        date: body.date ? parseClientDate(body.date) : undefined,
      },
    });
    await logAudit(userId, "transaction", id, "update", body);
    return transaction;
  });

  app.delete("/transactions/:id", async (req, reply) => {
    const userId = currentUserId(req);
    const { id } = req.params as { id: string };
    const { deleteGroup } = req.query as { deleteGroup?: string };
    const owned = await prisma.transaction.findFirst({ where: { id, userId } });
    if (!owned) return reply.code(404).send({ error: "Lançamento não encontrado" });

    // deleteGroup=true remove todas as parcelas restantes da mesma compra
    // parcelada (mesmo installmentGroupId), não só a selecionada
    if (deleteGroup === "true" && owned.installmentGroupId) {
      await prisma.transaction.deleteMany({
        where: { userId, installmentGroupId: owned.installmentGroupId },
      });
      await logAudit(userId, "transaction", owned.installmentGroupId, "delete", { group: true });
      return reply.code(204).send();
    }

    await prisma.transaction.delete({ where: { id } });
    await logAudit(userId, "transaction", id, "delete");
    return reply.code(204).send();
  });

  // Detecção de assinaturas/recorrências não usadas há muito tempo (>60 dias)
  app.get("/transactions/stale-subscriptions", async (req) => {
    const userId = currentUserId(req);
    const cutoff = dayjs().subtract(60, "day").toDate();
    const templates = await prisma.recurringTemplate.findMany({
      where: { userId, isSubscription: true, active: true },
    });
    const stale = templates.filter(
      (t) => !t.lastGeneratedAt || t.lastGeneratedAt < cutoff
    );
    return stale;
  });
}
