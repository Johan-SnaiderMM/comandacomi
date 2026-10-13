/*
 * Service worker del CLIENTE (quien pide desde el enlace del restaurante): SOLO recibe avisos de su pedido.
 * No guarda nada, no intercepta peticiones y no baja la app del personal. Alcance: /seguimiento/.
 */
self.addEventListener("install", (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let datos = {};
  try {
    datos = event.data ? event.data.json() : {};
  } catch {
    datos = { titulo: "Tu pedido", cuerpo: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(datos.titulo || "Tu pedido", {
      body: datos.cuerpo || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: datos.etiqueta || undefined,
      renotify: Boolean(datos.etiqueta),
      data: { url: datos.url || "/" },
      vibrate: datos.urgente ? [300, 150, 300, 150, 600] : [150, 80, 150],
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const v of ventanas) {
        if (new URL(v.url).origin !== self.location.origin) continue;
        await v.focus();
        try {
          if (v.url !== url && "navigate" in v) await v.navigate(url);
        } catch {
          // si no se puede navegar, igual queda enfocada
        }
        return;
      }
      await self.clients.openWindow(url);
    })()
  );
});
