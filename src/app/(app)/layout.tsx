import { BarraNavegacion } from "@/components/layout/barra-navegacion";

/** Pantallas con navegación inferior (Inicio, Pendientes, Fiado, Más). */
export default function LayoutApp({ children }: LayoutProps<"/">) {
  return (
    <div className="columna-app">
      {children}
      <BarraNavegacion />
    </div>
  );
}
