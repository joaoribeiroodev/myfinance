// Helpers de data "local-safe": um <input type="date"> dá uma string
// YYYY-MM-DD sem fuso. `new Date("2026-10-15")` interpreta isso como meia-
// noite UTC, e no Brasil (UTC-3) isso vira 14/10 21:00 local — "volta" um
// dia na exibição. Construindo a partir dos componentes Y/M/D em vez de
// deixar o parser de string decidir o fuso, evitamos esse bug.
export function localDateToISO(dateStr: string, hour = 12) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d, hour, 0, 0).toISOString();
}

export function localDateRangeStart(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0).toISOString();
}

export function localDateRangeEnd(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59).toISOString();
}

// Valor padrão de hoje pra um <input type="date">, em horário local
// (toISOString().slice(0,10) usaria UTC e podia mostrar o dia errado à noite)
export function todayInputValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Inverso de localDateToISO: pega uma data (ISO vinda do backend) e devolve
// "YYYY-MM-DD" pra popular um <input type="date">, usando os componentes
// locais (getFullYear/getMonth/getDate) em vez de toISOString() — que usa
// UTC e sofreria o mesmo "volta um dia" ao exibir de volta no formulário.
export function isoToInputValue(d: string | Date) {
  const date = new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function currentMonthInputValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function currency(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function shortDate(d: string | Date) {
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export function fullDate(d: string | Date) {
  return new Date(d).toLocaleDateString("pt-BR");
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

const CATEGORY_ICONS: Record<string, string> = {
  alimentação: "🍔",
  alimentacao: "🍔",
  mercado: "🛒",
  transporte: "🚗",
  moradia: "🏠",
  saúde: "💊",
  saude: "💊",
  lazer: "🎮",
  educação: "📚",
  educacao: "📚",
  assinaturas: "📱",
  salário: "💼",
  salario: "💼",
  investimentos: "📈",
  roupas: "👕",
  viagem: "✈️",
  pets: "🐾",
  outros: "🏷️",
};

export function categoryIcon(name?: string | null) {
  if (!name) return "🏷️";
  const key = name.toLowerCase().trim();
  return CATEGORY_ICONS[key] ?? "🏷️";
}
