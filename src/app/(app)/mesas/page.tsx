import { EncabezadoPantalla } from "@/components/layout/encabezado-pantalla";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { listarMesasAdmin } from "@/lib/datos/menu";
import { revisarPermiso } from "@/lib/permisos";
import { EditorMesas } from "./editor-mesas";

export const metadata = { title: "Mesas" };

/** Mesas del local: el dueño las agrega, les cambia el nombre o las quita. Las demás pantallas solo las usan. */
export default async function Mesas() {
  const { quien, permitido } = await revisarPermiso("mesas");
  if (!permitido) return <SinPermiso pantalla="mesas" />;
  const mesas = await listarMesasAdmin();
  return (
    <>
      <EncabezadoPantalla titulo="Mesas" atras="/mas" />
      <main className={quien.esDueno ? "pb-nav-accion" : "pb-nav"}>
        <EditorMesas mesas={mesas} esDueno={quien.esDueno} />
      </main>
    </>
  );
}
