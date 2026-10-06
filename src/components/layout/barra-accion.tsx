import { cn } from "@/lib/utils";

/**
 * Barra de acción fija en el borde inferior, donde llega el pulgar ("Enviar a cocina", "Cobrar").
 * Con `sobreNav` se apoya encima de la barra de navegación; sin ella, en el borde de la pantalla.
 * Respeta la zona segura inferior y sube con el teclado (viewport `resizes-content`).
 * Las pantallas que la usan agregan `pb-accion` / `pb-nav-accion` para que nada quede debajo.
 */
export function BarraAccion({
  children,
  sobreNav = false,
  className,
}: {
  children: React.ReactNode;
  sobreNav?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "fixed left-1/2 z-20 w-full max-w-[var(--ancho-app)] -translate-x-1/2 border-t-2 border-tinta bg-papel px-4 pt-2",
        sobreNav
          ? "bottom-[calc(var(--nav-h)+var(--seguro-abajo))] pb-2"
          : "bottom-0 pb-[calc(0.5rem+var(--seguro-abajo))]",
        className
      )}
    >
      {children}
    </div>
  );
}
