import jwt from "jsonwebtoken";
import type { ShimApp, ShimRequest, ShimReply } from "../fastify-shim";

// Substitui o @fastify/jwt original (plugins/auth.ts da API) por
// jsonwebtoken puro — mesma função (sign/verify com expiração de 30 dias,
// decorar app.authenticate como preHandler), só que sem depender do
// plugin/instância do Fastify, que não existe aqui.
export async function registerAuth(app: ShimApp) {
  const secret = process.env.JWT_SECRET || "change-me-in-env";

  app.decorate("jwt", {
    sign: (payload: object) => jwt.sign(payload, secret, { expiresIn: "30d" }),
  });

  app.decorate("authenticate", async (request: ShimRequest, reply: ShimReply) => {
    try {
      const header = request.headers["authorization"] || request.headers["Authorization" as any];
      const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
      if (!token) throw new Error("sem token");
      request.user = jwt.verify(token, secret);
    } catch {
      reply.code(401).send({ error: "Não autenticado" });
    }
  });
}
