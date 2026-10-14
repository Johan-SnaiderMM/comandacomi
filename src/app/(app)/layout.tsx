import { Suspense } from "react";
import { AlertaPedidosClientes } from "@/components/clientes/alerta-pedidos";
import { BarraNavegacion } from "@/components/layout/barra-navegacion";
import { abre, quienEs, type Quien } from "@/lib/areas";
import { contarPendientes, obtenerContexto } from "@/lib/datos/inicio";
import { exigirSesion } from "@/lib/sesion";

/** La insignia de "Pendientes" llega en segundo plano: la barra aparece al instante, el número después. */
async function NavegacionConPendientes({ quien }: { quien: Quien }) {
  const pendientes = await contarPendientes().catch(() => 0);
  return <BarraNavegacion pendientes={pendientes} quien={quien} />;
}

/**
 * Pantallas con navegación inferior (Inicio, Pendientes, En línea, Más y lo que cuelga de Más). Exigen sesión. La barra
 * y el aviso de pedidos de clientes dependen de lo que abre quien entra (el aviso, solo a quien toma pedidos).
 */
export default async function LayoutApp({ children }: LayoutProps<"/">) {
  await exigirSesion();
  const quien = quienEs(await obtenerContexto());
  return (
    <div className="columna-app">
      {abre(quien, "pedidos") && <AlertaPedidosClientes />}
      {children}
      <Suspense fallback={<BarraNavegacion quien={quien} />}>
        <NavegacionConPendientes quien={quien} />
      </Suspense>
    </div>
  );
}
