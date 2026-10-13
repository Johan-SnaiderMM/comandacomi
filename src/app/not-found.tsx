import type { Metadata } from "next";
import { PantallaNoExiste } from "@/components/no-existe";

export const metadata: Metadata = { title: "No existe" };

/**
 * La pantalla de "no existe" de toda la app: atiende las direcciones que no llevan a ninguna parte y también los
 * `notFound()` de las páginas (un enlace de restaurante que ya no está, un pedido que no se encuentra). El texto cambia
 * según a quién le habla: ver `components/no-existe.tsx`.
 */
export default function NoEncontrada() {
  return <PantallaNoExiste />;
}
