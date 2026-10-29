// Normaliza uma data que chega do cliente (string ISO).
//
// Um <input type="date"> manda só "YYYY-MM-DD", sem horário. `new
// Date("2026-10-15")` interpreta isso como meia-noite UTC — no Brasil
// (UTC-3) isso vira 14/10 21:00 local, "voltando" um dia quando exibido de
// volta. Pra qualquer string só-data (sem T/horário), tratamos como
// meio-dia UTC em vez de meia-noite: meio-dia nunca escorrega pro dia
// adjacente ao converter pra qualquer fuso entre UTC-11 e UTC+11, o que
// cobre o Brasil e a enorme maioria dos casos reais.
//
// Uma string ISO completa (com horário, ex: vinda do frontend já corrigido)
// é respeitada como está.
export function parseClientDate(value: string): Date {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  return dateOnly ? new Date(`${value}T12:00:00Z`) : new Date(value);
}
