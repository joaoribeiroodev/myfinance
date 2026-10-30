// Categorias sugeridas criadas automaticamente para todo usuário novo —
// evita a tela de lançamentos ficar sem nenhuma opção pra selecionar logo
// no primeiro acesso. O usuário pode editar, apagar ou criar outras à vontade.
export const DEFAULT_CATEGORIES: Array<{ name: string; type: "EXPENSE" | "INCOME"; color: string; icon: string }> = [
  { name: "Moradia", type: "EXPENSE", color: "#f97316", icon: "🏠" },
  { name: "Alimentação", type: "EXPENSE", color: "#ef4444", icon: "🍽️" },
  { name: "Transporte", type: "EXPENSE", color: "#3b82f6", icon: "🚗" },
  { name: "Saúde", type: "EXPENSE", color: "#22c55e", icon: "💊" },
  { name: "Educação", type: "EXPENSE", color: "#6366f1", icon: "📚" },
  { name: "Lazer", type: "EXPENSE", color: "#a855f7", icon: "🎮" },
  { name: "Compras", type: "EXPENSE", color: "#ec4899", icon: "🛍️" },
  { name: "Assinaturas", type: "EXPENSE", color: "#14b8a6", icon: "📺" },
  { name: "Cuidados pessoais", type: "EXPENSE", color: "#f59e0b", icon: "💇" },
  { name: "Outras despesas", type: "EXPENSE", color: "#64748b", icon: "📦" },
  { name: "Salário", type: "INCOME", color: "#22c55e", icon: "💰" },
  { name: "Freelance", type: "INCOME", color: "#06b6d4", icon: "💻" },
  { name: "Investimentos", type: "INCOME", color: "#8405e0", icon: "📈" },
  { name: "Outras receitas", type: "INCOME", color: "#64748b", icon: "➕" },
];
