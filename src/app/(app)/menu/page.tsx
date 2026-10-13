import { EncabezadoPantalla } from "@/components/layout/encabezado-pantalla";
import { obtenerContexto } from "@/lib/datos/inicio";
import { listarMenuAdmin } from "@/lib/datos/menu";
import type { MenuAdmin } from "@/lib/datos/tipos";
import { urlFotoPlato } from "@/lib/fotos";
import { EditorMenu } from "./editor-menu";

export const metadata = { title: "Menú" };

/** A cada plato con foto se le arma aquí, en el servidor, la dirección para mostrarla. */
function conFotos(menu: MenuAdmin): MenuAdmin {
  return { ...menu, categorias: menu.categorias.map((c) => ({ ...c, productos: c.productos.map((p) => ({ ...p, foto_url: urlFotoPlato(p.foto_path) })) })) };
}

export default async function Menu() {
  const [menu, contexto] = await Promise.all([listarMenuAdmin(), obtenerContexto()]);
  const esDueno = contexto.perfil?.rol === "dueno";
  return (
    <>
      <EncabezadoPantalla titulo="Menú" atras="/mas" />
      <main className={esDueno ? "pb-nav-accion" : "pb-nav"}>
        <EditorMenu menu={conFotos(menu)} esDueno={esDueno} />
      </main>
    </>
  );
}
