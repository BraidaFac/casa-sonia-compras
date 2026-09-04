const STATIC_CACHE = "cs-static-v1";
const DYNAMIC_CACHE = "cs-dynamic-v1";

// Assets con hash de contenido — nunca cambian para la misma URL
const IMMUTABLE_PATTERNS = [/\/_next\/static\//];

// Assets públicos sin hash — cachear pero revalidar
const STATIC_PATTERNS = [/\/fonts\//, /\.(?:png|svg|ico|webp)$/];

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== STATIC_CACHE && k !== DYNAMIC_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // Solo GET, mismo origen
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // API y rutas de Next internos → siempre red
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_next/data/")) return;

  // /_next/static/ → cache-first, inmutable (content-hashed)
  if (IMMUTABLE_PATTERNS.some((p) => p.test(url.pathname))) {
    e.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            const clone = res.clone();
            caches.open(STATIC_CACHE).then((c) => c.put(request, clone));
            return res;
          })
      )
    );
    return;
  }

  // Fonts e imágenes → cache-first, stale-while-revalidate
  if (STATIC_PATTERNS.some((p) => p.test(url.pathname))) {
    e.respondWith(
      caches.match(request).then((cached) => {
        const fetchAndUpdate = fetch(request).then((res) => {
          caches.open(STATIC_CACHE).then((c) => c.put(request, res.clone()));
          return res;
        });
        return cached || fetchAndUpdate;
      })
    );
    return;
  }

  // Páginas → network-first, fallback a caché
  e.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          caches.open(DYNAMIC_CACHE).then((c) => c.put(request, res.clone()));
        }
        return res;
      })
      .catch(() => caches.match(request))
  );
});
