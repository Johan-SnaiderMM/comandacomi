"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { inicioDe, type Area } from "@/lib/areas";
import { bd } from "@/lib/datos/bd";
import { ejecutar } from "@/lib/datos/llamar";
import { destinoDeEntrada, destinoDesdeDireccion } from "@/lib/destinos";
import { mensajeDeError, type Resultado } from "@/lib/errores";
import { esquemaClaveNueva, esquemaEntrar } from "@/lib/esquemas/sesion";
import { codigoValido, normalizarCodigo } from "@/lib/invitaciones";
import { COOKIE_VER_COMO, obtenerQuien } from "@/lib/permisos";
import { obtenerUsuario } from "@/lib/sesion";

export type EstadoEntrada = { error: string | null };

/**
 * "Entrar a la demo": sin pedir datos. Las credenciales viven solo en variables de entorno del servidor.
 * Con un campo `ir` (de una lista cerrada, ver lib/destinos.ts) entra directo a esa pantalla.
 */
export async function entrarDemo(_anterior: EstadoEntrada, formulario?: FormData): Promise<EstadoEntrada> {
  let error: string | null;
  try {
    ({ error } = await (await bd()).entrarDemo());
  } catch (e) {
    // Lo más común: se publicó sin configurar Supabase. El detalle va al registro del servidor, no a la pantalla.
    console.error("[sesion] no se pudo abrir la base de datos:", e instanceof Error ? e.message : e);
    error = "La demo todavía no está configurada. Avisa a quien te la compartió.";
  }
  if (error) return { error };
  // El campo `ir` lo pone el navegador al leer la dirección. Si tocaron "Entrar" antes de eso, el formulario llega sin
  // él: la dirección de la portada (cabecera Referer) trae el mismo dato.
  const destino =
    destinoDeEntrada(formulario?.get("ir")?.toString()) ?? destinoDesdeDireccion((await headers()).get("referer"));
  redirect(destino ?? "/inicio");
}

/**
 * Unirse al equipo con un código de invitación (migración 20). Si el celular no tiene sesión se le abre una anónima
 * (sin correo ni contraseña) y con ella se canjea el código: desde ahí ese celular es de esa persona, con sus roles.
 */
export async function unirmeAlEquipo(_anterior: EstadoEntrada, formulario: FormData): Promise<EstadoEntrada> {
  const codigo = normalizarCodigo(formulario.get("codigo")?.toString() ?? "");
  if (!codigoValido(codigo)) return { error: "El código tiene 8 letras y números, como K7MP-2XQ9. Revísalo." };

  let base;
  try {
    base = await bd();
  } catch (e) {
    console.error("[sesion] no se pudo abrir la base de datos:", e instanceof Error ? e.message : e);
    return { error: "La app todavía no está configurada. Avísale al dueño." };
  }
  if (!(await base.usuario())) {
    const { error } = await base.entrarAnonimo();
    if (error) return { error };
  }
  // Con la MISMA conexión: la sesión recién abierta todavía no llegó al navegador.
  const { data, error } = await base.rpc<{ areas: Area[] }>("canjear_invitacion", { p_codigo: codigo });
  if (error) {
    console.error(`[bd] canjear_invitacion falló (${error.codigo}): ${error.mensaje}`);
    return { error: mensajeDeError(error) };
  }
  (await cookies()).delete(COOKIE_VER_COMO);
  revalidatePath("/", "layout");
  redirect(inicioDe({ areas: data.areas, esDueno: false }));
}

/**
 * El dueño de un restaurante de verdad entra con su correo y su contraseña (la demo, en cambio, entra con un toque).
 * Su cuenta la crea quien administra, en Supabase, y le da de alta el restaurante con `fn_crear_restaurante`.
 */
export async function entrarConClave(_anterior: EstadoEntrada, formulario: FormData): Promise<EstadoEntrada> {
  const parsed = esquemaEntrar.safeParse({ correo: formulario.get("correo")?.toString() ?? "", clave: formulario.get("clave")?.toString() ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revisa el correo y la contraseña." };
  let base;
  try {
    base = await bd();
  } catch (e) {
    console.error("[sesion] no se pudo abrir la base de datos:", e instanceof Error ? e.message : e);
    return { error: "La app todavía no está configurada." };
  }
  const { error } = await base.entrarConClave(parsed.data.correo, parsed.data.clave);
  if (error) return { error };
  (await cookies()).delete(COOKIE_VER_COMO);
  revalidatePath("/", "layout");
  redirect("/inicio");
}

/** Cambiar la contraseña propia (Más → Mi contraseña). Solo cuentas con correo: la demo y el equipo no tienen. */
export async function cambiarMiClave(entrada: unknown): Promise<Resultado> {
  const parsed = esquemaClaveNueva.safeParse(entrada);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa la contraseña." };
  const usuario = await obtenerUsuario();
  if (!usuario?.email) return { ok: false, error: "Esta cuenta no tiene contraseña propia." };
  const { contexto } = await obtenerQuien();
  if (contexto.restaurante?.es_demo) return { ok: false, error: "La contraseña de la demo no se cambia desde la app." };
  const { error } = await (await bd()).cambiarClave(parsed.data.clave);
  return error ? { ok: false, error } : { ok: true };
}

/**
 * Salir. Si el celular tenía avisos activos (campo `endpoint` del formulario) se dan de baja primero: al salir, ese
 * celular ya no es de nadie del equipo y no debe seguir recibiendo pedidos con nombres de clientes.
 */
export async function salirDemo(formulario?: FormData): Promise<void> {
  const endpoint = formulario?.get("endpoint");
  if (typeof endpoint === "string" && endpoint.length > 0 && endpoint.length <= 800) {
    await ejecutar("quitar_suscripcion_push", { p_endpoint: endpoint }); // si falla, salir sigue igual
  }
  await (await bd()).salir();
  (await cookies()).delete(COOKIE_VER_COMO);
  redirect("/");
}
