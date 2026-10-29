/**
 * Marca configurable por variables de entorno (la marca final aún no está decidida).
 * Solo variables NEXT_PUBLIC_: se leen igual en servidor y navegador.
 */
export const MARCA = {
  nombre: process.env.NEXT_PUBLIC_MARCA_NOMBRE || "Comanda",
  lema: process.env.NEXT_PUBLIC_MARCA_LEMA || "Pedidos, fiado y cierre del día en tu celular",
  /** WhatsApp de quien vende la app, en E.164 sin "+". Vacío = no se muestra el botón. */
  contactoWhatsapp: (process.env.NEXT_PUBLIC_CONTACTO_WHATSAPP || "").replace(/\D/g, ""),
} as const;

/** Color de la barra del sistema y del lienzo de la PWA (mismo gris que el fondo de la app). */
export const COLOR_TEMA = "#e8eaec";
/** Lo mismo en modo oscuro (`fondo` oscuro de globals.css). */
export const COLOR_TEMA_OSCURO = "#121110";
/** Amarillo de marca (íconos y pantalla de carga). */
export const COLOR_MARCA = "#ffc20e";
