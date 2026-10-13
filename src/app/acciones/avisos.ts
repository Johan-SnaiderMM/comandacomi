"use server";

import { z } from "zod";
import { ejecutar, ejecutarPublico } from "@/lib/datos/llamar";
import type { Resultado } from "@/lib/errores";
import { esquemaCanales, esquemaSuscripcion } from "@/lib/esquemas/push";
import { esquemaTokenSeguimiento } from "@/lib/esquemas/publico";
import { avisoDePrueba } from "@/lib/push/mensajes";
import { avisosConfigurados, enviarAviso } from "@/lib/push/servidor";
import type { CanalPersonal } from "@/lib/push/tipos";
import { obtenerUsuario } from "@/lib/sesion";

// Avisos push: el celular se suscribe con el permiso del navegador y aquí solo se guarda a dónde mandarle el aviso.

const primerError = (e: z.ZodError, vacio: string) => e.issues[0]?.message ?? vacio;

/** Guarda (o actualiza) los avisos de ESTE celular del personal. */
export async function guardarAvisos(suscripcion: unknown, canales: unknown): Promise<Resultado<{ canales: CanalPersonal[] }>> {
  const s = esquemaSuscripcion.safeParse(suscripcion);
  if (!s.success) return { ok: false, error: primerError(s.error, "Este celular no pudo activar los avisos.") };
  const c = esquemaCanales.safeParse(canales);
  if (!c.success) return { ok: false, error: primerError(c.error, "Elige qué avisos quieres recibir.") };
  const r = await ejecutar<{ canales: CanalPersonal[] }>("guardar_suscripcion_push", {
    p_endpoint: s.data.endpoint,
    p_p256dh: s.data.keys.p256dh,
    p_auth: s.data.keys.auth,
    p_canales: c.data,
    p_agente: null,
  });
  return r;
}

/** Desactiva los avisos de este celular. */
export async function quitarAvisos(endpoint: unknown): Promise<Resultado> {
  const e = z.string().max(800).safeParse(endpoint);
  if (!e.success) return { ok: false, error: "Este celular no tiene avisos activos." };
  const r = await ejecutar("quitar_suscripcion_push", { p_endpoint: e.data });
  return r.ok ? { ok: true } : r;
}

/** ¿Este celular ya tiene avisos y de qué canales? */
export async function estadoAvisos(endpoint: unknown): Promise<Resultado<{ activa: boolean; canales: CanalPersonal[] }>> {
  const e = z.string().max(800).safeParse(endpoint);
  if (!e.success) return { ok: true, datos: { activa: false, canales: [] } };
  return ejecutar<{ activa: boolean; canales: CanalPersonal[] }>("estado_suscripcion_push", { p_endpoint: e.data });
}

/** Manda un aviso de prueba SOLO a este celular (pide sesión: no es un envío abierto). */
export async function probarAviso(suscripcion: unknown): Promise<Resultado<{ enviado: boolean }>> {
  if (!(await obtenerUsuario())) return { ok: false, error: "Vuelve a entrar para probar los avisos." };
  if (!avisosConfigurados()) return { ok: false, error: "Los avisos todavía no están configurados en el servidor." };
  const s = esquemaSuscripcion.safeParse(suscripcion);
  if (!s.success) return { ok: false, error: primerError(s.error, "Este celular no pudo activar los avisos.") };
  const r = await enviarAviso([{ endpoint: s.data.endpoint, p256dh: s.data.keys.p256dh, auth: s.data.keys.auth }], avisoDePrueba());
  if (r.enviados === 0) return { ok: false, error: "No se pudo mandar el aviso de prueba. Desactiva y vuelve a activar los avisos." };
  return { ok: true, datos: { enviado: true } };
}

/** Cliente sin cuenta: que le avisen de SU pedido (con el código de seguimiento). */
export async function guardarAvisoCliente(token: unknown, suscripcion: unknown): Promise<Resultado> {
  const t = esquemaTokenSeguimiento.safeParse(token);
  if (!t.success) return { ok: false, error: "El código del pedido no es válido." };
  const s = esquemaSuscripcion.safeParse(suscripcion);
  if (!s.success) return { ok: false, error: primerError(s.error, "Este celular no pudo activar los avisos.") };
  const r = await ejecutarPublico("publico_guardar_push_cliente", {
    p_token: t.data,
    p_endpoint: s.data.endpoint,
    p_p256dh: s.data.keys.p256dh,
    p_auth: s.data.keys.auth,
  });
  return r.ok ? { ok: true } : r;
}
