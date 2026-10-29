import { prisma } from "./prisma";

// Categorização inteligente: procura palavras da descrição entre as regras de
// keyword já aprendidas para o usuário e retorna a categoria mais provável.
export async function suggestCategory(
  userId: string,
  description: string
): Promise<string | null> {
  const words = description
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos
    .split(/\s+/)
    .filter((w) => w.length >= 3);

  if (words.length === 0) return null;

  const rules = await prisma.categoryKeywordRule.findMany({
    where: {
      keyword: { in: words },
      category: { userId },
    },
    orderBy: { hitCount: "desc" },
  });

  return rules[0]?.categoryId ?? null;
}

// Reforça a regra (ou cria uma nova) quando o usuário confirma/escolhe uma
// categoria para uma descrição — assim o sistema "aprende" com o tempo.
export async function reinforceCategoryRule(categoryId: string, description: string) {
  const words = description
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/\s+/)
    .filter((w) => w.length >= 3);

  for (const keyword of words) {
    const existing = await prisma.categoryKeywordRule.findFirst({
      where: { categoryId, keyword },
    });
    if (existing) {
      await prisma.categoryKeywordRule.update({
        where: { id: existing.id },
        data: { hitCount: { increment: 1 } },
      });
    } else {
      await prisma.categoryKeywordRule.create({
        data: { categoryId, keyword, hitCount: 1 },
      });
    }
  }
}
