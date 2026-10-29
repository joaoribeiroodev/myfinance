import { z } from "zod";
import type { ShimApp as FastifyInstance } from "../fastify-shim";
import { prisma } from "../lib/prisma";
import { currentUserId } from "../lib/current-user";
import { sendTelegramMessage } from "../lib/telegram";

// Vínculo com Telegram sem bot: enviar notificação é só uma chamada HTTP
// pra Telegram Bot API (ver lib/telegram.ts), não precisa de um processo
// rodando o tempo todo escutando mensagens — isso só era necessário pros
// COMANDOS de chat (/gastei, /resumo etc.), que não existem nessa versão.
// Então em vez do fluxo antigo (gerar código → mandar /start <código> pro
// bot → bot confirma o vínculo), o usuário só cola o próprio chat ID
// (consegue em @userinfobot no Telegram) e testa.
const settingsSchema = z.object({
  chatId: z.string().min(1).optional(),
  alertsEnabled: z.boolean().optional(),
  defaultReminderDays: z.array(z.number().int().min(0)).optional(),
  alertTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido, use o formato HH:mm")
    .optional(),
  dueDateAlertTime: z
    .union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido, use o formato HH:mm"), z.literal(""), z.null()])
    .optional(),
});

function toResponse(link: { chatId: string; alertsEnabled: boolean; defaultReminderDays: unknown; alertTime: string; dueDateAlertTime: string | null } | null) {
  return {
    linked: !!link?.chatId,
    chatId: link?.chatId ?? "",
    alertsEnabled: link?.alertsEnabled ?? true,
    defaultReminderDays: (link?.defaultReminderDays as number[]) ?? [3, 1, 0],
    alertTime: link?.alertTime ?? "08:00",
    dueDateAlertTime: link?.dueDateAlertTime ?? "",
  };
}

export async function telegramRoutes(app: FastifyInstance) {
  app.addHook("preHandler", (app as any).authenticate);

  app.get("/telegram/settings", async (req: any) => {
    const userId = currentUserId(req);
    const link = await prisma.telegramLink.findUnique({ where: { userId } });
    return toResponse(link);
  });

  app.put("/telegram/settings", async (req: any) => {
    const userId = currentUserId(req);
    const body = settingsSchema.parse(req.body);
    const link = await prisma.telegramLink.upsert({
      where: { userId },
      create: {
        userId,
        chatId: body.chatId || "",
        alertsEnabled: body.alertsEnabled ?? true,
        defaultReminderDays: body.defaultReminderDays ?? [3, 1, 0],
        alertTime: body.alertTime ?? "08:00",
        dueDateAlertTime: body.dueDateAlertTime || null,
      },
      update: {
        ...body,
        dueDateAlertTime: body.dueDateAlertTime !== undefined ? body.dueDateAlertTime || null : undefined,
      },
    });
    return toResponse(link);
  });

  // Envia uma mensagem de teste pro chatId salvo — assim o usuário confirma
  // que o número/ID está certo antes de confiar nos lembretes automáticos.
  app.post("/telegram/test", async (req: any, reply: any) => {
    const userId = currentUserId(req);
    const link = await prisma.telegramLink.findUnique({ where: { userId } });
    if (!link?.chatId) {
      return reply.code(400).send({ error: "Salve um Chat ID antes de testar" });
    }
    await sendTelegramMessage(link.chatId, "✅ MyFinance conectado! Você vai receber seus lembretes por aqui.");
    return { ok: true };
  });
}
