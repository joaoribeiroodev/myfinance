/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  experimental: {
    // Evita que o Router Cache do Next reaproveite páginas client-side
    // já renderizadas (ex: Dashboard) ao navegar de volta, o que mostrava
    // dados desatualizados após criar/excluir lançamentos em outra tela.
    staleTimes: {
      dynamic: 0,
      static: 180,
    },
    // Com output: "standalone", o Next só copia pro bundle final os
    // arquivos que consegue rastrear estaticamente a partir dos imports.
    // O pdfkit carrega as métricas das fontes padrão (Helvetica etc.) em
    // tempo de execução via fs.readFileSync com um caminho montado
    // dinamicamente (path.join(__dirname, ...)) — isso não é rastreável
    // estaticamente, então esses arquivos ficavam de fora do deploy e o
    // PDFDocument quebrava no ar (ENOENT), gerando um PDF corrompido/vazio
    // que o navegador não conseguia abrir. Força a inclusão manual.
    outputFileTracingIncludes: {
      "/api/**/*": ["./node_modules/pdfkit/js/data/**/*"],
    },
  },
};

module.exports = nextConfig;
