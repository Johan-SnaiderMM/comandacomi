import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export type ErrorBD = { codigo: string; mensaje: string };
export type RespuestaBD<T> = { data: T; error: null } | { data: null; error: ErrorBD };
export type UsuarioBD = { id: string; email: string | null };

/**
 * Lo único que la app necesita de la base de datos. Hay dos implementaciones con la misma forma:
 *  - Supabase (producción y desarrollo normal).
 *  - PGlite local (DEMO_BD=local, solo fuera de producción) para desarrollar sin cuenta de Supabase.
 * Toda la app habla con la base SOLO por funciones RPC (ver supabase/migrations).
 */
export interface BaseDatos {
  rpc<T = unknown>(nombre: string, args?: Record<string, unknown>): Promise<RespuestaBD<T>>;
  /** Usuario de la sesión actual, verificado (null si no hay sesión). */
  usuario(): Promise<UsuarioBD | null>;
  /** Inicia sesión con el usuario de la demo (credenciales del servidor: DEMO_EMAIL / DEMO_PASSWORD). */
  entrarDemo(): Promise<{ error: string | null }>;
  salir(): Promise<void>;
  /**
   * Sube una foto a Storage. La ruta debe empezar por el id del restaurante. Sin `bucket` va al privado de los
   * comprobantes de gastos; las fotos de los platos van a `BUCKET_PLATOS` (público).
   */
  subirArchivo(ruta: string, datos: Uint8Array, tipo: string, bucket?: string): Promise<{ error: string | null }>;
  /** Descarga una foto con los permisos del usuario (null si no existe o no es suya). */
  leerArchivo(ruta: string, bucket?: string): Promise<{ datos: Uint8Array; tipo: string } | null>;
}

/** Bucket privado de Storage con los comprobantes de los gastos (ver migración 0007). */
export const BUCKET_FOTOS = "gastos-fotos";
/** Bucket PÚBLICO con las fotos de los platos (migración 17): las ve cualquiera que tenga el enlace del menú. */
export const BUCKET_PLATOS = "platos-fotos";
/** <restaurante_id>/<archivo>.<ext>: la única forma de ruta válida. */
export const RUTA_FOTO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

/** El modo local solo existe fuera de producción: en producción `process.env.NODE_ENV` es constante y este código se elimina. */
export function usarBdLocal(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.DEMO_BD === "local";
}

export async function abrirBD(): Promise<BaseDatos> {
  if (process.env.NODE_ENV !== "production" && usarBdLocal()) {
    const { crearBdLocal } = await import("@/lib/local/bd-local");
    return crearBdLocal();
  }
  return crearBdSupabase();
}

async function crearBdSupabase(): Promise<BaseDatos> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const llave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !llave) {
    throw new Error("Falta configurar Supabase: NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY (ver README).");
  }

  const almacen = await cookies();
  const supabase = createServerClient(url, llave, {
    cookies: {
      getAll: () => almacen.getAll(),
      setAll: (lista) => {
        try {
          for (const { name, value, options } of lista) almacen.set(name, value, options);
        } catch {
          // Desde un Server Component no se pueden escribir cookies: proxy.ts ya refresca la sesión.
        }
      },
    },
  });

  return {
    async rpc<T>(nombre: string, args: Record<string, unknown> = {}): Promise<RespuestaBD<T>> {
      const { data, error } = await supabase.rpc(nombre, args);
      if (error) return { data: null, error: { codigo: error.code ?? "", mensaje: error.message } };
      return { data: data as T, error: null };
    },

    async usuario() {
      // getClaims verifica la firma del token localmente (sin viaje a la red) y refresca si está por vencer.
      const { data } = await supabase.auth.getClaims();
      const claims = data?.claims;
      return claims?.sub ? { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null } : null;
    },

    async entrarDemo() {
      const email = process.env.DEMO_EMAIL;
      const password = process.env.DEMO_PASSWORD;
      if (!email || !password) return { error: "La demo no está configurada (faltan DEMO_EMAIL y DEMO_PASSWORD)." };
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) console.error(`[bd] entrar a la demo falló: ${error.status ?? "?"} ${error.code ?? ""} ${error.message}`);
      return { error: error ? "No se pudo entrar a la demo. Intenta de nuevo en un momento." : null };
    },

    async salir() {
      await supabase.auth.signOut();
    },

    async subirArchivo(ruta, datos, tipo, bucket = BUCKET_FOTOS) {
      const { error } = await supabase.storage.from(bucket).upload(ruta, datos, { contentType: tipo, upsert: false });
      if (error) console.error(`[bd] subir ${ruta} a ${bucket} falló: ${error.message}`);
      return { error: error ? "No se pudo subir la foto." : null };
    },

    async leerArchivo(ruta, bucket = BUCKET_FOTOS) {
      const { data, error } = await supabase.storage.from(bucket).download(ruta);
      if (error || !data) return null;
      return { datos: new Uint8Array(await data.arrayBuffer()), tipo: data.type || "image/jpeg" };
    },
  };
}
