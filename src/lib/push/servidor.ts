import "server-only";
import webpush from "web-push";
import type { Aviso, Destino } from "./tipos";

/**
 * Envío de avisos push (solo servidor). La llave PRIVADA (VAPID_PRIVATE_KEY) vive únicamente en las variables de
 * entorno del servidor; la pública (NEXT_PUBLIC_VAPID_PUBLIC_KEY) la usa el navegador para suscribirse.
 * Si falta alguna, los avisos simplemente no se mandan: la app sigue funcionando con la alerta en pantalla.
 */

let configurado: boolean | null = null;

export function avisosConfigurados(): boolean {
  if (configurado !== null) return configurado;
  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privada = process.env.VAPID_PRIVATE_KEY;
  if (!publica || !privada) {
    configurado = false;
    return false;
  }
  try {
    // El "asunto" identifica a quien envía ante el servicio de avisos del navegador (un enlace o un mailto:).
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://comandacomi.com", publica, privada);
    configurado = true;
  } catch (e) {
    console.error("[avisos] las llaves VAPID no son válidas:", e instanceof Error ? e.message : e);
    configurado = false;
  }
  return configurado;
}

export type ResultadoEnvio = { enviados: number; caducados: string[] };

/**
 * Manda el aviso a cada celular. Nunca lanza: un celular que ya no existe (404/410) se reporta en `caducados` para
 * limpiarlo; cualquier otro fallo solo queda en el registro del servidor.
 */
export async function enviarAviso(destinos: Destino[], aviso: Aviso): Promise<ResultadoEnvio> {
  const vacio: ResultadoEnvio = { enviados: 0, caducados: [] };
  if (destinos.length === 0 || !avisosConfigurados()) return vacio;

  const carga = JSON.stringify(aviso);
  const resultado: ResultadoEnvio = { enviados: 0, caducados: [] };
  await Promise.all(
    destinos.map(async (d) => {
      try {
        await webpush.sendNotification({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } }, carga, {
          TTL: 60 * 60, // si el celular está apagado, el aviso vale una hora
          urgency: "high",
          timeout: 8_000,
        });
        resultado.enviados++;
      } catch (e) {
        const estado = (e as { statusCode?: number }).statusCode;
        if (estado === 404 || estado === 410) resultado.caducados.push(d.endpoint);
        else console.error(`[avisos] no se pudo avisar (${estado ?? "sin respuesta"}):`, e instanceof Error ? e.message : e);
      }
    })
  );
  return resultado;
}
