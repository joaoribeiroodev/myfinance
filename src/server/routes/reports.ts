import type { ShimApp as FastifyInstance } from "../fastify-shim";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import dayjs from "dayjs";
import { prisma } from "../lib/prisma";
import { currentUserId } from "../lib/current-user";
import { buildMonthReport } from "../lib/monthReport";

// Formata em Real brasileiro sem depender de Intl/locale do container
// (R$ 1.234,56) — usado no PDF, que não tem numFmt como o Excel.
function formatBRL(value: number): string {
  const fixed = value.toFixed(2).replace(".", ",");
  const [intPart, decPart] = fixed.split(",");
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${withThousands},${decPart}`;
}

// Paleta do app (ver packages/web/tailwind.config.js) — ARGB pro ExcelJS
const THEME = {
  brand600: "FF6E04BA",
  brand50: "FFF5EBFF",
  brand700: "FF590499",
  income600: "FF06B377",
  expense600: "FFE81A4A",
  surfaceSoft: "FFF7F6FB",
  white: "FFFFFFFF",
  gray400: "FF9CA3AF",
};

function styleTitleRow(sheet: ExcelJS.Worksheet, title: string, columnCount: number) {
  sheet.mergeCells(1, 1, 1, columnCount);
  const cell = sheet.getCell(1, 1);
  cell.value = title;
  cell.font = { bold: true, size: 14, color: { argb: THEME.white } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.brand600 } };
  cell.alignment = { vertical: "middle", horizontal: "left" };
  sheet.getRow(1).height = 28;
}

function styleHeaderRow(sheet: ExcelJS.Worksheet, rowNumber: number) {
  const row = sheet.getRow(rowNumber);
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: THEME.brand700 } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.brand50 } };
    cell.border = { bottom: { style: "thin", color: { argb: THEME.brand600 } } };
  });
  sheet.views = [{ state: "frozen", ySplit: rowNumber }];
}

function striped(sheet: ExcelJS.Worksheet, firstDataRow: number) {
  for (let i = firstDataRow; i <= sheet.rowCount; i++) {
    if ((i - firstDataRow) % 2 === 1) {
      sheet.getRow(i).eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.surfaceSoft } };
      });
    }
  }
}

// Gera planilha de orçamento pessoal (mensal, semestral ou anual) em XLSX,
// com o tema visual do app (cor da marca, verde/vermelho pra receita/despesa)
export async function reportRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/reports/export/xlsx", async (req, reply) => {
    const userId = currentUserId(req);
    const { from, to, label } = req.query as { from: string; to: string; label?: string };
    if (!from || !to) {
      return reply.code(400).send({ error: "Parâmetros 'from' e 'to' são obrigatórios" });
    }

    const transactions = await prisma.transaction.findMany({
      where: { userId, date: { gte: new Date(from), lte: new Date(to) } },
      include: { category: true },
      orderBy: { date: "asc" },
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "MyFinance";
    workbook.created = new Date();

    const periodLabel = `${dayjs(from).format("DD/MM/YYYY")} a ${dayjs(to).format("DD/MM/YYYY")}`;

    // --- Aba: Lançamentos ---
    const sheet = workbook.addWorksheet("Lançamentos");
    styleTitleRow(sheet, `MyFinance · Lançamentos (${periodLabel})`, 6);
    sheet.getRow(2).values = ["Data", "Tipo", "Categoria", "Descrição", "Forma de Pagamento", "Valor (R$)"];
    sheet.columns = [
      { key: "date", width: 14 },
      { key: "type", width: 12 },
      { key: "category", width: 20 },
      { key: "description", width: 35 },
      { key: "paymentMethod", width: 18 },
      { key: "amount", width: 15 },
    ];
    styleHeaderRow(sheet, 2);

    for (const t of transactions) {
      const row = sheet.addRow({
        date: dayjs(t.date).format("DD/MM/YYYY"),
        type: t.type === "INCOME" ? "Receita" : "Despesa",
        category: t.category?.name ?? "Sem categoria",
        description: t.description,
        paymentMethod: t.paymentMethod,
        amount: Number(t.amount),
      });
      const amountCell = row.getCell("amount");
      amountCell.font = { color: { argb: t.type === "INCOME" ? THEME.income600 : THEME.expense600 }, bold: true };
      row.getCell("type").font = { color: { argb: t.type === "INCOME" ? THEME.income600 : THEME.expense600 } };
    }
    sheet.getColumn("amount").numFmt = '"R$" #,##0.00';
    striped(sheet, 3);

    // --- Aba: Resumo por categoria ---
    const summarySheet = workbook.addWorksheet("Resumo por Categoria");
    styleTitleRow(summarySheet, `MyFinance · Resumo por Categoria (${periodLabel})`, 3);
    summarySheet.getRow(2).values = ["Categoria", "Tipo", "Total (R$)"];
    summarySheet.columns = [
      { key: "category", width: 25 },
      { key: "type", width: 12 },
      { key: "total", width: 15 },
    ];
    styleHeaderRow(summarySheet, 2);

    const byCategory = new Map<string, { type: string; total: number }>();
    for (const t of transactions) {
      const key = `${t.category?.name ?? "Sem categoria"}|${t.type}`;
      const entry = byCategory.get(key) ?? { type: t.type, total: 0 };
      entry.total += Number(t.amount);
      byCategory.set(key, entry);
    }
    for (const [key, v] of byCategory) {
      const [category] = key.split("|");
      const row = summarySheet.addRow({
        category,
        type: v.type === "INCOME" ? "Receita" : "Despesa",
        total: v.total,
      });
      const color = v.type === "INCOME" ? THEME.income600 : THEME.expense600;
      row.getCell("total").font = { color: { argb: color }, bold: true };
      row.getCell("type").font = { color: { argb: color } };
    }
    summarySheet.getColumn("total").numFmt = '"R$" #,##0.00';
    striped(summarySheet, 3);

    // --- Aba: Totais ---
    const totalsSheet = workbook.addWorksheet("Totais");
    styleTitleRow(totalsSheet, `MyFinance · Totais (${periodLabel})`, 2);
    totalsSheet.columns = [{ key: "label", width: 25 }, { key: "value", width: 22 }];
    const totalIncome = transactions
      .filter((t) => t.type === "INCOME")
      .reduce((s, t) => s + Number(t.amount), 0);
    const totalExpense = transactions
      .filter((t) => t.type === "EXPENSE")
      .reduce((s, t) => s + Number(t.amount), 0);
    const saldo = totalIncome - totalExpense;

    const rowPeriodo = totalsSheet.addRow(["Período", periodLabel]);
    const rowReceitas = totalsSheet.addRow(["Total de Receitas", totalIncome]);
    const rowDespesas = totalsSheet.addRow(["Total de Despesas", totalExpense]);
    const rowSaldo = totalsSheet.addRow(["Saldo", saldo]);

    [rowPeriodo, rowReceitas, rowDespesas, rowSaldo].forEach((row) => {
      row.getCell(1).font = { bold: true, color: { argb: THEME.brand700 } };
    });
    rowReceitas.getCell(2).numFmt = '"R$" #,##0.00';
    rowDespesas.getCell(2).numFmt = '"R$" #,##0.00';
    rowSaldo.getCell(2).numFmt = '"R$" #,##0.00';
    rowReceitas.getCell(2).font = { color: { argb: THEME.income600 }, bold: true };
    rowDespesas.getCell(2).font = { color: { argb: THEME.expense600 }, bold: true };
    rowSaldo.getCell(2).font = { color: { argb: saldo >= 0 ? THEME.income600 : THEME.expense600 }, bold: true, size: 13 };

    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `myfinance_${label ?? "relatorio"}_${dayjs().format("YYYYMMDD")}.xlsx`;

    reply
      .header(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      )
      .header("Content-Disposition", `attachment; filename="${fileName}"`)
      .send(Buffer.from(buffer));
  });

  // --------------------------------------------------------------------
  // Relatório "Despesas do mês" — lista enxuta (descrição + valor) com os
  // totais no final, igual ao resumo que as pessoas costumam montar na
  // mão pra compartilhar. Inclui despesas já lançadas + recorrências
  // ainda não geradas nesse mês (marcadas com "+" na frente). Disponível
  // em PDF (pra compartilhar/imprimir) e como aba extra no Excel.
  // ?month=YYYY-MM-01 (padrão: mês atual) & ?format=pdf|xlsx
  // --------------------------------------------------------------------
  app.get("/reports/export/month-summary", async (req, reply) => {
    const userId = currentUserId(req);
    const { month, format } = req.query as { month?: string; format?: string };
    const report = await buildMonthReport(userId, month);
    const fileBase = `myfinance_despesas_${report.month}`;

    if (format === "xlsx") {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "MyFinance";
      workbook.created = new Date();

      const sheet = workbook.addWorksheet("Despesas do Mês");
      styleTitleRow(sheet, `Despesas ${report.monthLabel}`, 2);
      sheet.columns = [
        { key: "description", width: 38 },
        { key: "amount", width: 18 },
      ];

      // Formatação uniforme pra todo item — lançado de verdade ou ainda
      // projetado de uma recorrência — pra não parecer inconsistente (antes
      // misturava negrito/cinza/itálico só pros projetados, e um "+" que
      // duplicava quando a própria descrição já começava com "+").
      for (const item of report.items) {
        const row = sheet.addRow({
          description: item.description,
          amount: item.amount,
        });
        row.getCell("amount").font = { color: { argb: THEME.expense600 } };
        row.getCell("amount").numFmt = '"R$" #,##0.00';
      }

      sheet.addRow([]);
      const rowTotalDespesas = sheet.addRow(["Total despesas", report.totalExpense]);
      const rowTotalReceita = sheet.addRow(["Total receita", report.totalIncome]);
      const rowSaldo = sheet.addRow(["Saldo final", report.balance]);
      [rowTotalDespesas, rowTotalReceita, rowSaldo].forEach((row) => {
        row.getCell(1).font = { bold: true, color: { argb: THEME.brand700 } };
        row.getCell(2).numFmt = '"R$" #,##0.00';
        row.getCell(2).font = { bold: true };
      });
      rowTotalDespesas.getCell(2).font = { bold: true, color: { argb: THEME.expense600 } };
      rowTotalReceita.getCell(2).font = { bold: true, color: { argb: THEME.income600 } };
      rowSaldo.getCell(2).font = {
        bold: true,
        size: 13,
        color: { argb: report.balance >= 0 ? THEME.income600 : THEME.expense600 },
      };

      const buffer = await workbook.xlsx.writeBuffer();
      return reply
        .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        .header("Content-Disposition", `attachment; filename="${fileBase}.xlsx"`)
        .send(Buffer.from(buffer));
    }

    // PDF (padrão)
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    const pdfReady = new Promise<Buffer>((resolve) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
    });

    doc
      .fillColor("#6e04ba")
      .fontSize(20)
      .font("Helvetica-Bold")
      .text(`Despesas ${report.monthLabel}`);
    doc.moveDown(1.2);

    // mesma formatação uniforme do xlsx — todo item com o mesmo estilo,
    // lançado de verdade ou ainda projetado de uma recorrência
    doc.fontSize(12).font("Helvetica").fillColor("#1a1625");
    for (const item of report.items) {
      doc.text(`${item.description} - ${formatBRL(item.amount)}`);
    }

    doc.moveDown(1.5);
    doc.fontSize(12).font("Helvetica-Bold");
    doc.fillColor("#e81a4a").text(`Total despesas - ${formatBRL(report.totalExpense)}`);
    doc.moveDown(0.5);
    doc.fillColor("#06b377").text(`Total receita - ${formatBRL(report.totalIncome)}`);
    doc.moveDown(0.5);
    doc
      .fontSize(13)
      .fillColor(report.balance >= 0 ? "#06b377" : "#e81a4a")
      .text(`Saldo final - ${formatBRL(report.balance)}`);

    doc.end();
    const pdfBuffer = await pdfReady;

    return reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `attachment; filename="${fileBase}.pdf"`)
      .send(pdfBuffer);
  });

  // CSV simples do período — útil pra importar em outra planilha/sistema
  // (Excel, Google Sheets, software de contabilidade) sem depender do
  // formato visual do XLSX/PDF acima.
  app.get("/reports/export/csv", async (req, reply) => {
    const userId = currentUserId(req);
    const { from, to } = req.query as { from: string; to: string };
    if (!from || !to) {
      return reply.code(400).send({ error: "Parâmetros 'from' e 'to' são obrigatórios" });
    }

    const transactions = await prisma.transaction.findMany({
      where: { userId, date: { gte: new Date(from), lte: new Date(to) } },
      include: { category: true },
      orderBy: { date: "asc" },
    });

    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const header = ["Data", "Tipo", "Descrição", "Categoria", "Valor", "Forma de pagamento"];
    const lines = [header.map(escape).join(",")];
    for (const t of transactions) {
      lines.push(
        [
          dayjs(t.date).format("DD/MM/YYYY"),
          t.type === "INCOME" ? "Receita" : "Despesa",
          escape(t.description),
          escape(t.category?.name ?? "Sem categoria"),
          Number(t.amount).toFixed(2).replace(".", ","),
          t.paymentMethod,
        ].join(",")
      );
    }
    // BOM no início — sem isso o Excel no Windows lê acentos errado
    const csv = "﻿" + lines.join("\r\n");

    return reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="myfinance_${from}_${to}.csv"`)
      .send(Buffer.from(csv, "utf-8"));
  });
}
