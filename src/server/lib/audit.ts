import { prisma } from "./prisma";

export async function logAudit(
  userId: string,
  entity: string,
  entityId: string,
  action: "create" | "update" | "delete",
  changes?: Record<string, unknown>
) {
  await prisma.auditLog.create({
    data: { userId, entity, entityId, action, changes: (changes ?? undefined) as any },
  });
}
