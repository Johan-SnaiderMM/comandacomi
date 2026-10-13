/**
 * Páginas públicas (el cliente pide y sigue su pedido): sin sesión, sin barra de navegación del personal.
 * Solo la columna de la app; el resto lo pone cada página.
 */
export default function LayoutPublico({ children }: LayoutProps<"/">) {
  return <div className="columna-app">{children}</div>;
}
