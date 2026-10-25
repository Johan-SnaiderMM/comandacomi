import { cn } from "@/lib/utils";

/**
 * Barra de acción fija abajo, donde llega el pulgar (`sobreNav`: encima de la barra de navegación). La pantalla que la
 * usa agrega `pb-accion` o `pb-nav-accion`, o su último contenido queda debajo.
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
