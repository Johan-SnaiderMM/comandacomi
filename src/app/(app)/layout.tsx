import { Suspense } from "react";
import { AlertaPedidosClientes } from "@/components/clientes/alerta-pedidos";
import { BarraNavegacion } from "@/components/layout/barra-navegacion";
import { contarPendientes } from "@/lib/datos/inicio";
import { exigirSesion } from "@/lib/sesion";

/** La insignia de "Pendientes" llega en segundo plano: la barra aparece al instante, el número después. */
async function NavegacionConPendientes() {
  const pendientes = await contarPendientes().catch(() => 0);
  return <BarraNavegacion pendientes={pendientes} />;
}

/** Pantallas con navegación inferior (Inicio, Pendientes, Fiado, Más). Exigen sesión. */
export default async function LayoutApp({ children }: LayoutProps<"/">) {
  await exigirSesion();
  return (
    <div className="columna-app">
      <AlertaPedidosClientes />
      {children}
      <Suspense fallback={<BarraNavegacion />}>
        <NavegacionConPendientes />
      </Suspense>
    </div>
  );
}
