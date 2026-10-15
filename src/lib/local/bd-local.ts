import "server-only";
import fs from "node:fs";
import path from "node:path";
import { cookies } from "next/headers";
import { PGlite } from "@electric-sql/pglite";
import { BUCKET_FOTOS, BUCKET_PLATOS, RUTA_FOTO, type BaseDatos, type RespuestaBD } from "@/lib/supabase/servidor";
import { huellaMigraciones, leerMigraciones, reclamosJwt, SUPABASE_MINIMO } from "./esquema-supabase";

/**
 * MODO LOCAL DE DESARROLLO (DEMO_BD=local): las mismas migraciones y funciones de supabase/, corriendo en
 * un Postgres embebido (PGlite) guardado en .local/. Permite desarrollar y probar la app completa sin
 * cuenta de Supabase. Nunca se usa en producción (ver abrirBD). La "sesión" es una cookie con el id del
 * usuario: solo para desarrollo.
 */

const CORREO_LOCAL = "demo@local.test";
const COOKIE = "bd_local_uid";
// DEMO_BD_DIR (solo desarrollo) permite tener otra base local aparte, por ejemplo para la prueba de punta a punta.
const DIR = path.resolve(process.cwd(), process.env.DEMO_BD_DIR || ".local");
const DIR_BD = path.join(DIR, "pglite");
const DIR_FOTOS = path.join(DIR, "fotos");
const DIR_FOTOS_PLATOS = path.join(DIR, "fotos-platos");
const ARCHIVO_HUELLA = path.join(DIR, "huella.txt");

declare global {
  var __bdLocal: Promise<PGlite> | undefined;
}

async function iniciar(): Promise<PGlite> {
  const huella = huellaMigraciones();
  const anterior = fs.existsSync(ARCHIVO_HUELLA) ? fs.readFileSync(ARCHIVO_HUELLA, "utf8") : null;
  // Si cambiaron las migraciones, la base local se recrea (son datos de ejemplo).
  if (anterior !== huella && fs.existsSync(DIR_BD)) fs.rmSync(DIR_BD, { recursive: true, force: true });
  fs.mkdirSync(DIR, { recursive: true });

  const db = new PGlite(DIR_BD);
  await db.waitReady;
  const existe = await db.query<{ t: string | null }>(`select to_regclass('public.pedidos')::text as t`);
  if (!existe.rows[0].t) {
    await db.exec(SUPABASE_MINIMO);
    for (const [, sql] of leerMigraciones()) await db.exec(sql);
    const u = await db.query<{ id: string }>(`insert into auth.users (email) values ($1) returning id`, [CORREO_LOCAL]);
    await db.query(`select public.fn_provisionar_demo($1, 'Picnic Delicias', 'Administrador')`, [u.rows[0].id]);
  }
  fs.writeFileSync(ARCHIVO_HUELLA, huella);
  return db;
}

function baseLocal(): Promise<PGlite> {
  globalThis.__bdLocal ??= iniciar();
  return globalThis.__bdLocal;
}

export async function crearBdLocal(): Promise<BaseDatos> {
  const almacen = await cookies();
  const db = await baseLocal();
  // Quien entró en ESTA petición (la cookie nueva recién se manda al navegador): así `rpc` ya va con esa sesión.
  let recienEntrado: string | undefined;

  const usuarioId = async (): Promise<string | null> => {
    const id = recienEntrado ?? almacen.get(COOKIE)?.value;
    if (!id || !/^[0-9a-f-]{36}$/.test(id)) return null;
    const r = await db.query(`select 1 from auth.users where id = $1`, [id]);
    return r.rows.length ? id : null;
  };
  const abrirSesion = (id: string) => {
    recienEntrado = id;
    almacen.set(COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  };

  return {
    async rpc<T>(nombre: string, args: Record<string, unknown> = {}): Promise<RespuestaBD<T>> {
      const claves = Object.keys(args);
      const lista = claves
        .map((k, i) => `${k} => $${i + 1}${args[k] !== null && typeof args[k] === "object" ? "::jsonb" : ""}`)
        .join(", ");
      const params = claves.map((k) => (args[k] !== null && typeof args[k] === "object" ? JSON.stringify(args[k]) : args[k]));
      const actor = await usuarioId();
      try {
        const filas = await db.transaction(async (tx) => {
          await tx.exec(`set local role ${actor ? "authenticated" : "anon"}`);
          await tx.query(`select set_config('request.jwt.claims', $1, true)`, [reclamosJwt(actor)]);
          const res = await tx.query<{ data: T }>(`select public.${nombre}(${lista}) as data`, params);
          return res.rows;
        });
        return { data: filas[0].data, error: null };
      } catch (e) {
        const err = e as { code?: string; message?: string };
        return { data: null, error: { codigo: err.code ?? "", mensaje: err.message ?? "Error" } };
      }
    },

    async usuario() {
      const id = await usuarioId();
      if (!id) return null;
      const r = await db.query<{ email: string | null }>(`select email from auth.users where id = $1`, [id]);
      return { id, email: r.rows[0]?.email ?? null };
    },

    async entrarDemo() {
      const r = await db.query<{ id: string }>(`select id from auth.users where email = $1`, [CORREO_LOCAL]);
      abrirSesion(r.rows[0].id);
      return { error: null };
    },

    // Como la sesión anónima de Supabase: un usuario nuevo, sin correo.
    async entrarAnonimo() {
      const r = await db.query<{ id: string }>(`insert into auth.users (email) values (null) returning id`);
      abrirSesion(r.rows[0].id);
      return { error: null };
    },

    // Solo desarrollo: aquí no hay contraseñas guardadas. Basta con que exista un usuario con ese correo (y que no sea
    // el de la demo, que entra con su botón).
    async entrarConClave(correo) {
      const r = await db.query<{ id: string }>(`select id from auth.users where lower(email) = lower($1) and email <> $2`, [correo, CORREO_LOCAL]);
      if (!r.rows[0]) return { error: "El correo o la contraseña no coinciden. Revísalos." };
      abrirSesion(r.rows[0].id);
      return { error: null };
    },

    async cambiarClave() {
      return { error: null };
    },

    async salir() {
      recienEntrado = undefined;
      almacen.delete(COOKIE);
    },

    // Las fotos locales viven en .local/fotos/<restaurante_id>/<archivo> (nunca en el repositorio); las de los platos,
    // en su propia carpeta (.local/fotos-platos).
    async subirArchivo(ruta, datos, _tipo, bucket = BUCKET_FOTOS) {
      if (!RUTA_FOTO.test(ruta)) return { error: "La ruta de la foto no es válida." };
      const destino = path.join(carpetaDe(bucket), ruta);
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      fs.writeFileSync(destino, datos);
      return { error: null };
    },

    async leerArchivo(ruta, bucket = BUCKET_FOTOS) {
      return leerFotoLocal(ruta, bucket);
    },
  };
}

const carpetaDe = (bucket: string) => (bucket === BUCKET_PLATOS ? DIR_FOTOS_PLATOS : DIR_FOTOS);

/** Lee una foto guardada por el modo local (null si no existe). No mira la sesión: quien llama decide quién puede verla. */
export function leerFotoLocal(ruta: string, bucket: string): { datos: Uint8Array; tipo: string } | null {
  if (!RUTA_FOTO.test(ruta)) return null;
  const origen = path.join(carpetaDe(bucket), ruta);
  if (!fs.existsSync(origen)) return null;
  const ext = path.extname(ruta).slice(1);
  return { datos: new Uint8Array(fs.readFileSync(origen)), tipo: ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg" };
}
