import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { bd } from "@/lib/datos/bd";

export const obtenerUsuario = cache(async () => (await bd()).usuario());

/**
 * Sin sesión, a la portada. Se exige también en la capa de datos: los layouts no se repiten al navegar, así que no
 * pueden ser la única barrera (la de verdad es el RLS de la base).
 */
export async function exigirSesion() {
  const usuario = await obtenerUsuario();
  if (!usuario) redirect("/");
  return usuario;
}
