/*
 * Service worker: solo el "cascarón" de la PWA para que la app abra aunque la señal sea mala.
 *
 *  - Estáticos (/_next/static, íconos): primero la copia guardada y se actualiza en segundo plano.
 *  - Pantallas (HTML y datos RSC de la navegación): primero la red (4 s); si tarda o falla, la última
 *    versión vista; si no hay copia, /offline.html.
 *
 * NO hace (a propósito, la demo no lleva cola sin conexión): no toca POST (acciones del servidor),
 * no guarda nada que no sea de esta app, no usa IndexedDB. Al salir de la demo la app borra estas cachés.
 */
const VERSION = "v1";
const CACHE_ESTATICO = `estatico-${VERSION}`;
// HTML y payloads RSC en cachés separadas: una petición RSC nunca recibe un HTML guardado ni al revés.
const CACHE_PAGINAS = `paginas-${VERSION}`;
const CACHE_RSC = `rsc-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const MAX_PAGINAS = 60;
const TIMEOUT_RED_MS = 4000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_ESTATICO)
      .then((cache) => cache.addAll([OFFLINE_URL, "/icons/icon-192.png"]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const clave of await caches.keys()) {
        if (!clave.endsWith(VERSION)) await caches.delete(clave);
      }
      await self.clients.claim();
    })()
  );
});

/** Recorta la caché a las entradas más recientes. */
async function recortar(cache) {
  const claves = await cache.keys();
  for (let i = 0; i < claves.length - MAX_PAGINAS; i++) await cache.delete(claves[i]);
}

function conTimeout(promesa, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promesa.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

async function estatico(request) {
  const cache = await caches.open(CACHE_ESTATICO);
  const guardado = await cache.match(request);
  const actualizar = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  return guardado || (await actualizar) || Response.error();
}

async function paginas(request, esRsc) {
  const cache = await caches.open(esRsc ? CACHE_RSC : CACHE_PAGINAS);
  try {
    const res = await conTimeout(fetch(request), TIMEOUT_RED_MS);
    // Solo respuestas reales de la pantalla: nada de redirecciones ni errores.
    if (res.ok && !res.redirected && res.type === "basic") {
      cache.put(request, res.clone()).then(() => recortar(cache));
    }
    return res;
  } catch {
    // RSC: la URL trae un parámetro _rsc variable y cabeceras Vary que cambian; se ignoran para servir la última copia.
    const copia = await cache.match(request, esRsc ? { ignoreSearch: true, ignoreVary: true } : undefined);
    if (copia) return copia;
    if (request.mode === "navigate") {
      const offline = await caches.match(OFFLINE_URL);
      if (offline) return offline;
    }
    return new Response("Sin conexión", { status: 503, statusText: "Sin conexión" });
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const ruta = url.pathname;
  if (ruta === "/sw.js" || ruta.startsWith("/api/")) return;

  if (ruta.startsWith("/_next/static/") || ruta.startsWith("/icons/") || /\.(?:png|jpe?g|webp|svg|ico|woff2?)$/.test(ruta)) {
    event.respondWith(estatico(request));
    return;
  }

  // Precargas de enlaces: se dejan pasar (podrían ser payloads parciales).
  if (request.headers.get("Next-Router-Prefetch") || request.headers.get("Purpose") === "prefetch") return;

  const esRsc = request.headers.get("RSC") === "1" || url.searchParams.has("_rsc");
  if (request.mode === "navigate" || esRsc) {
    event.respondWith(paginas(request, esRsc));
  }
});
