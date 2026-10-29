import type { ShimApp as FastifyInstance } from "../fastify-shim";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export async function authRoutes(app: FastifyInstance) {
  // Registro só é permitido se ainda não existir nenhum usuário
  // (sistema é single-user; evita cadastros indevidos se exposto por engano)
  app.post("/auth/register", async (req, reply) => {
    const existing = await prisma.user.count();
    if (existing > 0) {
      return reply.code(403).send({ error: "Cadastro já realizado. Use /auth/login." });
    }
    const body = registerSchema.parse(req.body);
    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = await prisma.user.create({
      data: { name: body.name, email: body.email, passwordHash },
    });
    const token = app.jwt.sign({ sub: user.id, email: user.email });
    return { token, user: { id: user.id, name: user.name, email: user.email } };
  });

  app.post("/auth/login", async (req, reply) => {
    const body = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user) return reply.code(401).send({ error: "Credenciais inválidas" });
    const valid = await bcrypt.compare(body.password, user.passwordHash);
    if (!valid) return reply.code(401).send({ error: "Credenciais inválidas" });
    const token = app.jwt.sign({ sub: user.id, email: user.email });
    return { token, user: { id: user.id, name: user.name, email: user.email } };
  });

  app.get(
    "/auth/me",
    { preHandler: [app.authenticate] },
    async (req) => {
      const payload = req.user as { sub: string };
      const user = await prisma.user.findUniqueOrThrow({ where: { id: payload.sub } });
      return { id: user.id, name: user.name, email: user.email };
    }
  );
}
