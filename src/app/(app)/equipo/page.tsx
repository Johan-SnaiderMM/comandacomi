import { EncabezadoPantalla } from "@/components/layout/encabezado-pantalla";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { listarEquipo } from "@/lib/datos/equipo";
import { revisarPermiso } from "@/lib/permisos";
import { EditorEquipo } from "./editor-equipo";

export const metadata = { title: "Equipo" };

/** Más → Equipo: los roles del local, qué abre cada uno, quién tiene cuál y cómo sumar a alguien. Solo el dueño. */
export default async function Equipo() {
  const { contexto, permitido } = await revisarPermiso("equipo");
  if (!permitido) return <SinPermiso pantalla="equipo" />;
  const equipo = await listarEquipo();
  return (
    <>
      <EncabezadoPantalla titulo="Equipo" atras="/mas" />
      <main className="pb-nav-accion">
        <EditorEquipo equipo={equipo} restaurante={contexto.restaurante?.nombre ?? "el restaurante"} />
      </main>
    </>
  );
}
