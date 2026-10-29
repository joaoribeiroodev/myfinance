import { createRootApp, matchRoute, ShimReply, type ShimRequest } from "./fastify-shim";
import { registerAuth } from "./plugins/auth";
import { authRoutes } from "./routes/auth";
import { categoryRoutes } from "./routes/categories";
import { transactionRoutes } from "./routes/transactions";
import { budgetRoutes } from "./routes/budgets";
import { goalRoutes } from "./routes/goals";
import { billRoutes } from "./routes/bills";
import { dashboardRoutes } from "./routes/dashboard";
import { reportRoutes } from "./routes/reports";
import { incomeRoutes } from "./routes/incomes";
import { recurringRoutes } from "./routes/recurring";
import { cardRoutes } from "./routes/cards";
import { telegramRoutes } from "./routes/telegram";

// Monta as mesmas rotas que packages/api/src/index.ts registrava no
// Fastify, só que em cima do shim (fastify-shim.ts) — mesmas funções de
// rota, mesma lógica de negócio, só o "app" por baixo que é diferente. Fica
// montado uma única vez por cold start da função serverless (module-level,
// não recriado a cada request).
const { app, routes } = createRootApp();

let ready: Promise<void> | null = null;
async function setup() {
  await registerAuth(app as any);
  await app.register(authRoutes as any);
  await app.register(categoryRoutes as any);
  await app.register(transactionRoutes as any);
  await app.register(budgetRoutes as any);
  await app.register(goalRoutes as any);
  await app.register(billRoutes as any);
  await app.register(dashboardRoutes as any);
  await app.register(reportRoutes as any);
  await app.register(incomeRoutes as any);
  await app.register(recurringRoutes as any);
  await app.register(cardRoutes as any);
  await app.register(telegramRoutes as any);
}

export async function dispatch(req: {
  method: string;
  pathname: string;
  query: Record<string, any>;
  body: any;
  headers: Record<string, string>;
}): Promise<{ status: number; headers: Record<string, string>; body: any; isRaw: boolean }> {
  if (!ready) ready = setup();
  await ready;

  const match = matchRoute(routes, req.method, req.pathname);
  if (!match) {
    return { status: 404, headers: {}, body: { error: "Rota não encontrada" }, isRaw: false };
  }

  const shimReq: ShimRequest = {
    method: req.method,
    query: req.query,
    params: match.params,
    body: req.body,
    headers: req.headers,
  };
  const reply = new ShimReply();

  try {
    for (const pre of match.route.preHandlers) {
      await pre(shimReq, reply);
      if (reply._sent) break;
    }

    let result: any;
    if (!reply._sent) {
      result = await match.route.handler(shimReq, reply);
    }

    if (reply._sent) {
      const isRaw = Buffer.isBuffer(reply._payload);
      return { status: reply.statusCode, headers: reply._headers, body: reply._payload, isRaw };
    }
    // Handler não chamou reply.send/code — igual ao Fastify, o valor
    // retornado vira o corpo JSON com status 200.
    return { status: 200, headers: {}, body: result, isRaw: false };
  } catch (err: any) {
    // Erros de validação do zod (.parse dentro das rotas) e qualquer outro
    // erro não tratado caem aqui — mesmo comportamento de "erro 500 com a
    // mensagem", já que o Fastify original também não tinha um handler de
    // erro customizado pra essas rotas.
    console.error("[api] erro não tratado:", err);
    const message = err?.issues ? "Dados inválidos: " + JSON.stringify(err.issues) : err?.message || "Erro interno";
    return { status: err?.issues ? 400 : 500, headers: {}, body: { error: message }, isRaw: false };
  }
}
