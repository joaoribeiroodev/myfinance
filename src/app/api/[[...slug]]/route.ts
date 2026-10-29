import { NextRequest, NextResponse } from "next/server";
import { dispatch } from "@/server/index";

// Roda em Node.js (não Edge) porque as rotas herdadas usam Prisma,
// pdfkit/exceljs e bcryptjs, que precisam do runtime Node completo.
export const runtime = "nodejs";

async function handle(req: NextRequest) {
  const url = new URL(req.url);
  // remove o prefixo /api — as rotas originais foram escritas como
  // "/transactions", "/credit-cards/:id", etc., sem esse prefixo
  const pathname = url.pathname.replace(/^\/api/, "") || "/";
  const query = Object.fromEntries(url.searchParams.entries());

  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => (headers[key] = value));

  let body: any = undefined;
  if (!["GET", "HEAD"].includes(req.method)) {
    const text = await req.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
  }

  const result = await dispatch({
    method: req.method,
    pathname,
    query,
    body,
    headers,
  });

  if (result.isRaw) {
    return new NextResponse(result.body, { status: result.status, headers: result.headers });
  }
  if (result.status === 204 || result.body === undefined) {
    return new NextResponse(null, { status: result.status, headers: result.headers });
  }
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}

export {
  handle as GET,
  handle as POST,
  handle as PUT,
  handle as DELETE,
  handle as PATCH,
};
