/**
 * Postgres REAL en memoria (PGlite) con lo mínimo de Supabase que las migraciones dan por existente
 * (roles anon/authenticated, auth.uid()/auth.jwt(), privilegios por defecto) y TODAS las migraciones
 * de supabase/migrations aplicadas. Sirve para probar el SQL y el RLS de verdad, sin Docker.
 *
 * Cada llamada de `como()` simula una petición de Supabase: abre una transacción, cambia al rol
 * `authenticated` (o `anon`) y fija el JWT; si la función falla, se revierte todo.
 */
import { PGlite } from "@electric-sql/pglite";
import { leerMigraciones, reclamosJwt, SUPABASE_MINIMO } from "@/lib/local/esquema-supabase";

export const MIGRACIONES = leerMigraciones().map(([nombre]) => nombre);

export async function crearBase(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_MINIMO);
  for (const [, sql] of leerMigraciones()) await db.exec(sql);
  return db;
}

/** Crea un usuario de auth.users y le provisiona un restaurante demo completo. Devuelve sus ids. */
export async function crearRestauranteDemo(db: PGlite, nombre: string): Promise<{ userId: string; restauranteId: string }> {
  const u = await db.query<{ id: string }>(`insert into auth.users (email) values ($1) returning id`, [
    `${nombre.toLowerCase().replace(/\W+/g, "-")}@ejemplo.test`,
  ]);
  const userId = u.rows[0].id;
  const r = await db.query<{ id: string }>(`select public.fn_provisionar_demo($1, $2, $3) as id`, [userId, nombre, `Dueño de ${nombre}`]);
  return { userId, restauranteId: r.rows[0].id };
}

/** Quién hace la petición: un usuario con sesión o nadie (rol anon). */
export type Actor = string | null;

/** Ejecuta SQL como `actor` (una petición = una transacción). Lanza si la base rechaza. */
export async function como<T extends Record<string, unknown> = Record<string, unknown>>(
  db: PGlite,
  actor: Actor,
  texto: string,
  params: unknown[] = []
): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${actor ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [reclamosJwt(actor)]);
    const res = await tx.query<T>(texto, params);
    return res.rows;
  });
}

/** Llama a una función pública como lo haría `supabase.rpc(nombre, args)`; devuelve su jsonb. */
export async function rpc<T = unknown>(db: PGlite, actor: Actor, nombre: string, args: Record<string, unknown> = {}): Promise<T> {
  const claves = Object.keys(args);
  const lista = claves
    .map((k, i) => {
      const v = args[k];
      return `${k} => $${i + 1}${v !== null && typeof v === "object" ? "::jsonb" : ""}`;
    })
    .join(", ");
  const params = claves.map((k) => {
    const v = args[k];
    return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
  });
  const filas = await como<{ data: T }>(db, actor, `select public.${nombre}(${lista}) as data`, params);
  return filas[0].data;
}
