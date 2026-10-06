"use server";

import { revalidatePath } from "next/cache";
import { bd, } from "@/lib/datos/bd";
import { obtenerContexto } from "@/lib/datos/inicio";
import { ejecutar } from "@/lib/datos/llamar";
import { MENSAJE_GENERICO, type Resultado } from "@/lib/errores";
import { FOTO_MAX_BYTES, FOTO_TIPOS } from "@/lib/esquemas/gasto";
import { esquemaAnulacion } from "@/lib/esquemas/pedido";
import { exigirSesion } from "@/lib/sesion";

/**
 * Sube la foto (ya comprimida en el celular, ~300 KB) a la carpeta del restaurante.
 * Devuelve la ruta para guardarla con el gasto. La foto es opcional: si falla, el gasto igual se puede guardar.
 */
export async function subirFotoGasto(formData: FormData): Promise<Resultado<{ ruta: string }>> {
  await exigirSesion();
  const foto = formData.get("foto");
  if (!(foto instanceof File) || foto.size === 0) return { ok: false, error: "No llegó la foto." };
  if (foto.size > FOTO_MAX_BYTES) return { ok: false, error: "La foto es muy pesada. Toma otra." };
  if (!(FOTO_TIPOS as readonly string[]).includes(foto.type)) return { ok: false, error: "La foto debe ser JPG, PNG o WebP." };

  const restaurante = (await obtenerContexto()).restaurante;
  if (!restaurante) return { ok: false, error: MENSAJE_GENERICO };

  const ext = foto.type === "image/png" ? "png" : foto.type === "image/webp" ? "webp" : "jpg";
  const ruta = `${restaurante.id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await (await bd()).subirArchivo(ruta, new Uint8Array(await foto.arrayBuffer()), foto.type);
  if (error) return { ok: false, error };
  return { ok: true, datos: { ruta } };
}

export async function anularGasto(id: string, motivo: string): Promise<Resultado> {
  const parsed = esquemaAnulacion.safeParse({ id, motivo });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const r = await ejecutar("anular_gasto", { p_gasto_id: parsed.data.id, p_motivo: parsed.data.motivo });
  if (!r.ok) return r;
  revalidatePath("/", "layout");
  return { ok: true };
}
