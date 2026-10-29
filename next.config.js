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
  },
};

module.exports = nextConfig;
