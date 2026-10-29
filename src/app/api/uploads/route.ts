import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import jwt from "jsonwebtoken";

export const runtime = "nodejs";

// Upload de comprovante/recibo anexado a um lançamento. Fica fora do shim
// (fastify-shim.ts) de propósito: upload de arquivo binário via
// multipart/form-data não existia nas rotas originais (o campo
// attachmentUrl já existia no schema, mas nunca teve um jeito de fato de
// subir o arquivo) — é mais simples como uma rota Next.js comum usando
// FormData nativo do que forçar esse caso dentro do shim, pensado pra
// JSON.
//
// Requer a integração "Blob" ativada no projeto da Vercel (Storage →
// Create Database → Blob) e a variável BLOB_READ_WRITE_TOKEN configurada
// (a própria Vercel preenche sozinha quando você conecta o Blob ao
// projeto).
function getUserId(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || "change-me-in-env") as { sub: string };
    return payload.sub;
  } catch {
    return null;
  }
}

const MAX_SIZE = 8 * 1024 * 1024; // 8MB — recibo/nota fiscal não precisa de mais que isso
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];

export async function POST(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Upload de anexos não configurado — ative o Blob Storage no projeto da Vercel." },
      { status: 501 }
    );
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Arquivo não enviado" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Arquivo muito grande (máx. 8MB)" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Tipo de arquivo não aceito (use foto ou PDF)" }, { status: 400 });
  }

  const blob = await put(`receipts/${userId}/${Date.now()}-${file.name}`, file, {
    access: "public",
    addRandomSuffix: true,
  });

  return NextResponse.json({ url: blob.url });
}
