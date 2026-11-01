// Service worker mínimo do MyFinance — cache "app shell" (estático) para abrir
// rápido/offline-ish; dados da API sempre vão à rede (nunca cacheados aqui,
// pra não mostrar saldo/lançamento desatualizado).
const CACHE_NAME = "myfinance-shell-v2";
const SHELL_URLS = ["/", "/manifest.json", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Nunca intercepta chamadas de API — sempre busca direto na rede.
  if (url.pathname.startsWith("/api/")) return;

  // Network-first: tenta a rede primeiro, pra sempre pegar a versão mais
  // nova depois de um deploy, e só cai pro cache se estiver offline/a rede
  // falhar. Antes era cache-first (servia o que tinha em cache na hora e só
  // atualizava o cache em segundo plano, pra DA PRÓXIMA VEZ) — isso fazia o
  // app sempre ficar uma versão atrasado em relação ao que estava realmente
  // no ar: a tela/texto de um deploy antigo junto com dados de API já
  // recalculados pelo backend novo (a API nunca é cacheada), parecendo
  // "quebrado" mesmo logo depois de uma correção já estar no ar.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
