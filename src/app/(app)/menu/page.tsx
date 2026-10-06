import { EncabezadoPantalla } from "@/components/layout/encabezado-pantalla";
import { obtenerContexto } from "@/lib/datos/inicio";
import { listarMenuAdmin } from "@/lib/datos/menu";
import { EditorMenu } from "./editor-menu";

export const metadata = { title: "Menú" };

export default async function Menu() {
  const [menu, contexto] = await Promise.all([listarMenuAdmin(), obtenerContexto()]);
  const esDueno = contexto.perfil?.rol === "dueno";
  return (
    <>
      <EncabezadoPantalla titulo="Menú" atras="/mas" />
      <main className={esDueno ? "pb-nav-accion" : "pb-nav"}>
        <EditorMenu menu={menu} esDueno={esDueno} />
      </main>
    </>
  );
}
