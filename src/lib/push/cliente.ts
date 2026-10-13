/**
 * Avisos push desde el navegador: pedir permiso, suscribirse y darse de baja. Nada de esto toca la base: la
 * suscripción que devuelve `activar` se guarda llamando a las acciones de src/app/acciones/avisos.ts.
 *
 * Dos alcances (cada uno con su service worker, para que el cliente NO baje la app del personal):
 *   - "personal": /sw.js con alcance "/" (el mismo que da el trabajo sin conexión).
 *   - "cliente": /sw-cliente.js con alcance "/seguimiento/" (solo recibe avisos de su pedido).
 */
import type { SuscripcionJson } from "./tipos";

export type Alcance = "personal" | "cliente";

const SCRIPT: Record<Alcance, { url: string; scope: string }> = {
  personal: { url: "/sw.js", scope: "/" },
  cliente: { url: "/sw-cliente.js", scope: "/seguimiento/" },
};

/** Llave pública VAPID (se incrusta al compilar). Vacía = los avisos no están configurados. */
const LLAVE_PUBLICA = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

/** El navegador puede recibir avisos (en iPhone solo con la app agregada a la pantalla de inicio). */
export function avisosSoportados(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** Soportado Y con la llave configurada en este despliegue. */
export function avisosDisponibles(): boolean {
  return avisosSoportados() && LLAVE_PUBLICA.length > 0;
}

export function permisoDeAvisos(): NotificationPermission | "no-soportado" {
  return typeof Notification === "undefined" ? "no-soportado" : Notification.permission;
}

/** iPhone/iPad en Safari sin instalar: ahí el navegador no ofrece avisos hasta agregar la app a la pantalla de inicio. */
export function esIosSinInstalar(): boolean {
  if (typeof navigator === "undefined") return false;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const instalada = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  return ios && !instalada;
}

function aBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const relleno = "=".repeat((4 - (base64url.length % 4)) % 4);
  const crudo = atob((base64url + relleno).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(crudo.length));
  for (let i = 0; i < crudo.length; i++) bytes[i] = crudo.charCodeAt(i);
  return bytes;
}

async function esperarActivo(registro: ServiceWorkerRegistration): Promise<void> {
  if (registro.active) return;
  const worker = registro.installing ?? registro.waiting;
  if (!worker) return;
  await new Promise<void>((resolver) => {
    const alCambiar = () => {
      if (worker.state === "activated") {
        worker.removeEventListener("statechange", alCambiar);
        resolver();
      }
    };
    worker.addEventListener("statechange", alCambiar);
    alCambiar();
  });
}

const aJson = (s: PushSubscription): SuscripcionJson => {
  const j = s.toJSON();
  return { endpoint: j.endpoint ?? s.endpoint, keys: { p256dh: j.keys?.p256dh ?? "", auth: j.keys?.auth ?? "" } };
};

/** La suscripción que ya tiene este celular (sin pedir nada), o null. */
export async function suscripcionActual(alcance: Alcance): Promise<SuscripcionJson | null> {
  if (!avisosSoportados()) return null;
  const registro = await navigator.serviceWorker.getRegistration(SCRIPT[alcance].scope);
  const s = await registro?.pushManager.getSubscription();
  return s ? aJson(s) : null;
}

/**
 * Pide permiso (llamar desde un toque), registra el service worker y suscribe. Lanza Error con un mensaje en español.
 */
export async function activarAvisos(alcance: Alcance): Promise<SuscripcionJson> {
  if (!avisosSoportados()) throw new Error("Este navegador no permite avisos.");
  if (!LLAVE_PUBLICA) throw new Error("Los avisos todavía no están configurados.");

  // El permiso va primero: algunos navegadores solo lo piden si viene directo del toque.
  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") {
    throw new Error(
      permiso === "denied"
        ? "Bloqueaste los avisos para esta página. Actívalos en la configuración del navegador (el candado junto a la dirección)."
        : "No diste permiso para los avisos."
    );
  }

  const { url, scope } = SCRIPT[alcance];
  const registro = await navigator.serviceWorker.register(url, { scope, updateViaCache: "none" });
  await esperarActivo(registro);

  const clave = aBytes(LLAVE_PUBLICA);
  let s = await registro.pushManager.getSubscription();
  if (!s) {
    s = await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: clave });
  }
  return aJson(s);
}

/** Da de baja este celular en el navegador. Devuelve el endpoint que tenía (para quitarlo también de la base). */
export async function desactivarAvisos(alcance: Alcance): Promise<string | null> {
  if (!avisosSoportados()) return null;
  const registro = await navigator.serviceWorker.getRegistration(SCRIPT[alcance].scope);
  const s = await registro?.pushManager.getSubscription();
  if (!s) return null;
  const endpoint = s.endpoint;
  await s.unsubscribe();
  return endpoint;
}
