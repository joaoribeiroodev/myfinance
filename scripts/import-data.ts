// Importa o JSON gerado por packages/api/scripts/export-data.ts pro Postgres
// novo (Neon/Supabase). Preserva os IDs originais (UUIDs), então todas as
// referências (FKs) continuam batendo sem precisar remapear nada.
//
// Roda com: npx tsx scripts/import-data.ts
// (dentro de packages/vercel, com o .env apontando pro Postgres novo —
// rode "npx prisma migrate deploy" ou "npx prisma db push" ANTES disso,
// pra criar as tabelas)
import "dotenv/config";
import fs from "fs";
import path from "path";
import { prisma } from "../src/server/lib/prisma";

const MODELS_IN_ORDER = [
  "user",
  "category",
  "categoryKeywordRule",
  "creditCard",
  "recurringTemplate",
  "income",
  "transaction",
  "bill",
  "budget",
  "goal",
  "goalContribution",
  "telegramLink",
  "auditLog",
  "backupLog",
] as const;

async function main() {
  const inPath = process.argv[2] || path.join(__dirname, "myfinance-export.json");
  if (!fs.existsSync(inPath)) {
    console.error(`Arquivo não encontrado: ${inPath}`);
    console.error("Gere com packages/api/scripts/export-data.ts e copie pra cá, ou passe o caminho como argumento.");
    process.exit(1);
  }
  const dump = JSON.parse(fs.readFileSync(inPath, "utf-8"));

  for (const model of MODELS_IN_ORDER) {
    const rows: any[] = dump[model] ?? [];
    if (rows.length === 0) {
      console.log(`[import] ${model}: nada a importar`);
      continue;
    }
    // createMany ignora relações aninhadas — como os dados exportados já
    // trazem as FKs como colunas simples (ex: categoryId), isso é suficiente
    // e muito mais rápido que criar linha por linha.
    const result = await (prisma as any)[model].createMany({ data: rows, skipDuplicates: true });
    console.log(`[import] ${model}: ${result.count}/${rows.length} registro(s) importado(s)`);
  }

  console.log("\n[import] concluído. Confira os totais acima contra o que o export mostrou.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
