# MyFinance

Sistema financeiro pessoal — Next.js (App Router) com a API embutida nas
próprias rotas (`src/app/api`), banco Postgres e deploy direto na Vercel.

## Stack

- **Front + API**: Next.js 14, um projeto só — a UI em `src/app/*`, a API
  em `src/app/api/*`.
- **Banco**: Postgres (Neon ou Supabase, plano grátis serve) via Prisma.
- **Auth**: JWT (`jsonwebtoken` + `bcryptjs`), sem sessão/cookie — token
  guardado no navegador.
- **Cron**: `vercel.json` configura duas rotinas automáticas — geração
  mensal de contas recorrentes e varredura diária de lembretes.
- **Anexos**: upload de comprovante via Vercel Blob (opcional — some
  automaticamente da UI se você não ativar essa integração).
- **Notificações**: Telegram, direto por Chat ID (sem precisar de um bot
  rodando — ver seção abaixo).

## Deploy

### 1. Banco Postgres

Crie um projeto grátis no [Neon](https://neon.tech) ou
[Supabase](https://supabase.com). Pegue a connection string com **pooling**
ativado (Neon: host com `-pooler`; Supabase: aba Database → Connection
pooling, modo "Transaction").

### 2. Rodar as migrations

```bash
cp .env.example .env
# edite .env: DATABASE_URL (passo 1), JWT_SECRET e CRON_SECRET (gere cada um com: openssl rand -hex 32)
npm install
npx prisma migrate deploy
```

### 3. Deploy na Vercel

No painel: **New Project** → importe o repositório → configure as mesmas
variáveis do `.env` em Project → Settings → Environment Variables. O
`vercel.json` já cuida dos cron jobs.

Pela CLI, como alternativa:
```bash
npx vercel link
npx vercel env add DATABASE_URL
npx vercel env add JWT_SECRET
npx vercel env add CRON_SECRET
npx vercel --prod
```

### 4. Criar o usuário

O cadastro (`POST /api/auth/register`) só funciona uma vez — o sistema é
single-user e bloqueia um segundo cadastro depois do primeiro. Acesse o app
publicado e cadastre-se pela tela normal.

### 5. (Opcional) Upload de comprovantes

No painel da Vercel: Storage → Create Database → **Blob** → conecte ao
projeto. A variável `BLOB_READ_WRITE_TOKEN` é preenchida sozinha. Sem isso,
o campo de anexo nos lançamentos simplesmente não aparece/funciona — o
resto do sistema não é afetado.

### 6. (Opcional) Lembretes no Telegram

Em Configurações → "Notificações no Telegram": fale com `@userinfobot` no
Telegram pra pegar seu Chat ID, cole no campo e salve. Teste com o botão
"Enviar mensagem de teste". Não tem bot pra configurar — é só uma chamada
HTTP da API pro Telegram quando um lembrete dispara.

Precisa também criar um bot em `@BotFather` (é rápido: `/newbot`, escolhe
nome) só pra conseguir um token, e colar em `TELEGRAM_BOT_TOKEN` — sem esse
bot "escutando" nada, ele só existe pra identidade de quem está mandando a
mensagem.

**Limite do plano grátis da Vercel**: cron só roda 1x/dia, então o lembrete
perde a precisão de horário exato configurado — ele é checado uma vez por
dia (11:00 UTC / 08:00 no horário de Brasília — ajustável em `vercel.json`).
Pra manter o horário exato, dá pra apontar um serviço gratuito tipo
cron-job.org pra `/api/cron/reminders` a
cada minuto (a rota aceita qualquer chamador que mande
`Authorization: Bearer <CRON_SECRET>`), ou assinar o plano Pro da Vercel.

## Migrar dados de uma instalação antiga (MySQL)

Se você já usava uma versão anterior com MySQL, dá pra trazer os dados com
`scripts/import-data.ts`. Ele espera um JSON com um array por modelo do
Prisma (`{ "user": [...], "category": [...], "transaction": [...], ... }`,
na ordem de dependência — ver `MODELS_IN_ORDER` dentro do script), exportado
da instalação antiga com uma consulta equivalente a
`prisma.<modelo>.findMany()` para cada tabela, nessa ordem:
`user, category, categoryKeywordRule, creditCard, recurringTemplate,
income, transaction, bill, budget, goal, goalContribution, telegramLink,
auditLog, backupLog`.

Com o JSON em mãos (salve como `scripts/myfinance-export.json`, ou passe o
caminho como argumento):
```bash
npm run import-data
# ou: npx tsx scripts/import-data.ts /caminho/para/o/export.json
```

Os IDs são preservados, então as referências entre tabelas continuam
batendo.

## Funcionalidades

Lançamentos (com parcelamento e recorrência), cartões de crédito (limite,
fatura do ciclo, detalhe do que consome o limite), contas a pagar/receber,
orçamentos por categoria, cofrinhos/metas, dashboard com projeção do mês,
relatórios (XLSX, PDF e CSV), anexo de comprovante por lançamento, alertas
automáticos via Telegram.
