import { PrismaClient } from "@prisma/client";

// Em serverless (Vercel) cada invocação pode recriar o módulo em hot
// reload no dev, e múltiplas invocações concorrentes compartilham o mesmo
// processo — sem esse cache global, cada reload criava um PrismaClient novo
// e estourava o limite de conexões do Postgres. Padrão recomendado pela
// própria Prisma para Next.js.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
