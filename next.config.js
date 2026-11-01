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
    // estaticamente, então esses arquivos ficavam de fora do deploy.
    outputFileTracingIncludes: {
      "/api/**/*": ["./node_modules/pdfkit/js/data/**/*"],
    },
    // O webpack do Next empacota (bundla) o pdfkit junto com o código da
    // rota por padrão — isso reescreve o __dirname interno do pdfkit pra
    // dentro do bundle da rota (ex: .next/server/app/api/[[...slug]]/data/
    // Helvetica.afm), um caminho que nunca existiu, em vez do node_modules
    // de verdade onde os arquivos .afm das fontes realmente estão. Daí o
    // "ENOENT ... data/Helvetica.afm" ao gerar o PDF. Marcando como pacote
    // externo, o Next usa require() direto do node_modules em runtime (sem
    // reescrever caminhos), preservando a estrutura de arquivos do pacote.
    // (Next 14: essa opção ainda vive em "experimental"; virou estável e
    // mudou de nome pra "serverExternalPackages" só a partir do Next 15.)
    serverComponentsExternalPackages: ["pdfkit"],
  },
};

module.exports = nextConfig;
