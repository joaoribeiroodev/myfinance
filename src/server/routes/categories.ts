import type { ShimApp as FastifyInstance } from "../fastify-shim";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { currentUserId } from "../lib/current-user";
import { logAudit } from "../lib/audit";

const categorySchema = z.object({
  name: z.string().min(1),
  type: z.enum(["INCOME", "EXPENSE"]),
  color: z.string().optional(),
  icon: z.string().optional(),
  parentId: z.string().uuid().optional().nullable(),
});

export async function categoryRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/categories", async (req) => {
    const userId = currentUserId(req);
    return prisma.category.findMany({
      where: { userId },
      include: { children: true },
      orderBy: { name: "asc" },
    });
  });

  app.post("/categories", async (req, reply) => {
    const userId = currentUserId(req);
    const body = categorySchema.parse(req.body);
    const category = await prisma.category.create({ data: { ...body, userId } });
    await logAudit(userId, "category", category.id, "create", body);
    return reply.code(201).send(category);
  });

  app.put("/categories/:id", async (req, reply) => {
    const userId = currentUserId(req);
    const { id } = req.params as { id: string };
    const owned = await prisma.category.findFirst({ where: { id, userId } });
    if (!owned) return reply.code(404).send({ error: "Categoria não encontrada" });
    const body = categorySchema.partial().parse(req.body);
    const category = await prisma.category.update({ where: { id }, data: body });
    await logAudit(userId, "category", id, "update", body);
    return category;
  });

  app.delete("/categories/:id", async (req, reply) => {
    const userId = currentUserId(req);
    const { id } = req.params as { id: string };
    const owned = await prisma.category.findFirst({ where: { id, userId } });
    if (!owned) return reply.code(404).send({ error: "Categoria não encontrada" });
    await prisma.category.delete({ where: { id } });
    await logAudit(userId, "category", id, "delete");
    return reply.code(204).send();
  });
}
