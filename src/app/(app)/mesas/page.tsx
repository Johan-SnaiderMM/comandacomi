import { EncabezadoPantalla } from "@/components/layout/encabezado-pantalla";
import { obtenerContexto } from "@/lib/datos/inicio";
import { listarMesasAdmin } from "@/lib/datos/menu";
import { EditorMesas } from "./editor-mesas";

export const metadata = { title: "Mesas" };

/** Mesas del local: el dueño las agrega, les cambia el nombre o las quita. Las demás pantallas solo las usan. */
export default async function Mesas() {
  const [mesas, contexto] = await Promise.all([listarMesasAdmin(), obtenerContexto()]);
  const esDueno = contexto.perfil?.rol === "dueno";
  return (
    <>
      <EncabezadoPantalla titulo="Mesas" atras="/mas" />
      <main className={esDueno ? "pb-nav-accion" : "pb-nav"}>
        <EditorMesas mesas={mesas} esDueno={esDueno} />
      </main>
    </>
  );
}
