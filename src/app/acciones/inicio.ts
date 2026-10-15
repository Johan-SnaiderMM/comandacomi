"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { COOKIE_PRIMEROS_PASOS } from "@/lib/primeros-pasos";

/** "Ya no mostrar" de los primeros pasos (en este celular): el dueño ya sabe por dónde va. */
export async function ocultarPrimerosPasos(): Promise<void> {
  (await cookies()).set(COOKIE_PRIMEROS_PASOS, "ocultos", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/inicio");
}
