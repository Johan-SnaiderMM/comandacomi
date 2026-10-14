import { EncabezadoPantalla } from "@/components/layout/encabezado-pantalla";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { listarMenuAdmin } from "@/lib/datos/menu";
import type { MenuAdmin } from "@/lib/datos/tipos";
import { urlFotoPlato } from "@/lib/fotos";
import { revisarPermiso } from "@/lib/permisos";
import { EditorMenu } from "./editor-menu";

export const metadata = { title: "Menú" };

/** A cada plato con foto se le arma aquí, en el servidor, la dirección para mostrarla. */
function conFotos(menu: MenuAdmin): MenuAdmin {
  return { ...menu, categorias: menu.categorias.map((c) => ({ ...c, productos: c.productos.map((p) => ({ ...p, foto_url: urlFotoPlato(p.foto_path) })) })) };
}

/** El dueño cambia el menú; quien toma pedidos o cocina entra solo a marcar lo que se acabó. */
export default async function Menu() {
  const { quien, permitido } = await revisarPermiso("menu");
  if (!permitido) return <SinPermiso pantalla="menu" />;
  const menu = await listarMenuAdmin();
  return (
    <>
      <EncabezadoPantalla titulo="Menú" atras="/mas" />
      <main className={quien.esDueno ? "pb-nav-accion" : "pb-nav"}>
        <EditorMenu menu={conFotos(menu)} esDueno={quien.esDueno} />
      </main>
    </>
  );
}
