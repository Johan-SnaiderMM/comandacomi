import { EncabezadoPantalla } from "@/components/layout/encabezado-pantalla";
import { DemoHoja } from "./demo-hoja";

// Marcador de posición del paso 1: se reemplaza por la pantalla de Inicio real en el paso 3.
export default function Inicio() {
  return (
    <>
      <EncabezadoPantalla titulo="Inicio" />
      <main className="pb-nav space-y-4 px-4 pt-4">
        <section className="tiquete border-2 border-b-0 border-tinta px-4 pt-4 pb-5">
          <p className="text-sm font-bold uppercase tracking-wide text-tinta-2">Cimientos listos</p>
          <p className="cifra mt-2 text-5xl">$ 1.284.500</p>
          <hr className="separador-punteado my-3" />
          <p className="text-lg">Navegación inferior, barra de acción, hoja inferior y tokens táctiles.</p>
        </section>
        <DemoHoja />
      </main>
    </>
  );
}
