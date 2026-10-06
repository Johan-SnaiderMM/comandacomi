/*
 * Service worker: hace que la app abra y se pueda trabajar sin señal.
 *
 *  - Estáticos (/_next/static, íconos, fuentes): primero la copia guardada y se actualiza en segundo plano.
 *  - La app sin conexión (/sc): una página estática, sin datos de nadie, que se guarda junto con todo lo que necesita
 *    para abrir. Los datos que muestra salen de la copia local del celular (localStorage), no de aquí.
 *  - Pantallas normales de la app: primero la red (8 s). Si no hay señal, en vez de mostrar una copia vieja con datos
 *    de ayer, se lleva a la persona a la app sin conexión, a la pantalla equivalente (/sc#/pedidos, etc.).
 *
 * NO toca POST (acciones del servidor: la cola de la app las reintenta con su propia clave), no guarda páginas con
 * datos del restaurante y no usa IndexedDB. Al salir de la sesión la app borra estas cachés.
 */
const VERSION = "v2";
const CACHE_ESTATICO = `estatico-${VERSION}`;
const CACHE_SC = `sc-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const SC_URL = "/sc";
const TIMEOUT_RED_MS = 8000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_ESTATICO);
      await cache.addAll([OFFLINE_URL, "/icons/icon-192.png"]);
      await precargarApp().catch(() => {}); // si no se puede ahora, se reintenta en la próxima visita
      await self.skipWaiting();
    })()
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

self.addEventListener("message", (event) => {
  if (event.data === "precargar") event.waitUntil(precargarApp().catch(() => {}));
});

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

/**
 * Guarda la app sin conexión: su HTML y todo lo estático que usa (scripts, estilos, fuentes). Las rutas salen del propio
 * HTML (incluye las del payload de React) y de los CSS. Se vuelve a correr en cada visita con señal, así una versión
 * nueva reemplaza a la anterior.
 */
async function precargarApp() {
  const res = await fetch(SC_URL, { cache: "reload", credentials: "same-origin" });
  if (!res.ok || res.redirected) return;
  const html = await res.clone().text();
  const sc = await caches.open(CACHE_SC);
  const estatico = await caches.open(CACHE_ESTATICO);

  const rutas = new Set();
  const buscar = (texto) => {
    for (const m of texto.matchAll(/static\/(?:chunks|css|media)\/[A-Za-z0-9_\-./%~]+\.(?:js|css|woff2?)/g)) rutas.add(`/_next/${m[0]}`);
  };
  buscar(html);

  // Los scripts cargan otros scripts por su cuenta (el cargador de Next/Turbopack sabe cuáles hacen falta): se leen
  // también para guardarlos, con un tope por si algo se sale de lo normal.
  const pendientes = [...rutas];
  const vistas = new Set();
  while (pendientes.length > 0 && vistas.size < 400) {
    const ruta = pendientes.pop();
    if (vistas.has(ruta)) continue;
    vistas.add(ruta);
    try {
      let r = await estatico.match(ruta);
      if (!r) {
        const bajada = await fetch(ruta, { credentials: "same-origin" });
        if (!bajada.ok) continue;
        await estatico.put(ruta, bajada.clone());
        r = bajada;
      }
      if (ruta.endsWith(".css")) {
        const css = await r.clone().text();
        for (const m of css.matchAll(/url\(\s*["']?([^"')\s]*\/_next\/static\/media\/[^"')\s]+)["']?\s*\)/g)) pendientes.push(new URL(m[1], self.location.origin).pathname);
      } else if (ruta.endsWith(".js")) {
        const js = await r.clone().text();
        for (const m of js.matchAll(/static\/(?:chunks|css|media)\/[A-Za-z0-9_\-./%~]+\.(?:js|css|woff2?)/g)) pendientes.push(`/_next/${m[0]}`);
      }
    } catch {
      // un archivo que no baja no impide guardar los demás
    }
  }
  await sc.put(SC_URL, res); // al final: solo se da por guardada si lo anterior se intentó
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

async function navegar(request) {
  const url = new URL(request.url);
  try {
    const res = await conTimeout(fetch(request), TIMEOUT_RED_MS);
    if (url.pathname === SC_URL && res.ok && !res.redirected) {
      const cache = await caches.open(CACHE_SC);
      cache.put(SC_URL, res.clone());
    }
    return res;
  } catch {
    const copia = await (await caches.open(CACHE_SC)).match(SC_URL);
    if (url.pathname === SC_URL) return copia || (await caches.match(OFFLINE_URL)) || new Response("Sin conexión", { status: 503 });
    if (copia) return Response.redirect(`${SC_URL}#${url.pathname}${url.search}`, 302);
    return (await caches.match(OFFLINE_URL)) || new Response("Sin conexión", { status: 503 });
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

  // Solo se intervienen las navegaciones (abrir la app, escribir una dirección, recargar). Los datos de navegación
  // de Next (RSC) y las precargas se dejan pasar: si fallan, Next hace una navegación completa y esa sí llega aquí.
  if (request.mode === "navigate") event.respondWith(navegar(request));
});
