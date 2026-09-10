// ─── Version ────────────────────────────────────────────────────────────────
const SW_VERSION = "v2";
const STATIC_CACHE = `cs-static-${SW_VERSION}`;
const RUNTIME_CACHE = `cs-runtime-${SW_VERSION}`;
const KNOWN_CACHES = [STATIC_CACHE, RUNTIME_CACHE];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function isNavigationRequest(req) {
  return req.mode === "navigate";
}

function isStaticAsset(req) {
  const url = new URL(req.url);
  return /\.(js|css|png|jpg|jpeg|svg|ico|woff2?|ttf)$/.test(url.pathname);
}

function isApiRequest(req) {
  return new URL(req.url).pathname.startsWith("/api/");
}

async function cacheResponse(cacheName, req, res) {
  if (!res || res.status !== 200 || res.type === "opaque") return;
  const cache = await caches.open(cacheName);
  cache.put(req, res.clone());
}

// ─── Install ─────────────────────────────────────────────────────────────────
self.addEventListener("install", (e) => {
  e.waitUntil(self.skipWaiting());
});

// ─── Activate ────────────────────────────────────────────────────────────────
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !KNOWN_CACHES.includes(k))
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ─── Fetch ───────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (e) => {
  const { request } = e;

  // Solo GET
  if (request.method !== "GET") return;

  // Solo http/https — ignorar chrome-extension://, data:, etc.
  if (!request.url.startsWith("http")) return;

  if (isNavigationRequest(request)) {
    e.respondWith(networkFirstNavigation(request));
  } else if (isStaticAsset(request)) {
    e.respondWith(cacheFirstStatic(request));
  } else if (isApiRequest(request)) {
    // API siempre a red — nunca interceptar auth ni datos frescos
    return;
  }
  // Todo lo demás: deja pasar sin interceptar
});

// ─── Estrategias ─────────────────────────────────────────────────────────────

async function networkFirstNavigation(request) {
  try {
    const res = await fetch(request);
    return res;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response("Sin conexión", { status: 503 });
  }
}

async function cacheFirstStatic(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const res = await fetch(request);
    await cacheResponse(STATIC_CACHE, request, res);
    return res;
  } catch {
    return new Response("Asset no disponible", { status: 503 });
  }
}
