import { z } from "zod";

export const esquemaProducto = z.object({
  /** null = plato nuevo. */
  id: z.uuid().nullable().default(null),
  categoriaId: z.uuid("Elige una categoría."),
  nombre: z.string().trim().min(1, "Escribe el nombre del plato.").max(60, "El nombre es muy largo (máximo 60 caracteres)."),
  precio: z.number().int("El precio debe ser un número entero de pesos.").min(0, "El precio no es válido.").max(10_000_000, "El precio es demasiado alto."),
  disponible: z.boolean().default(true),
  /** false = quitar del menú (se archiva; los pedidos viejos lo conservan). */
  activo: z.boolean().default(true),
  /** Texto corto para el menú del cliente. Sin enviar (undefined) no cambia; "" lo quita. */
  descripcion: z.string().trim().max(160, "La descripción es muy larga (máximo 160 caracteres).").optional(),
  /** Ruta de la foto ya subida (<restaurante_id>/<archivo>). Sin enviar no cambia; "" la quita. */
  fotoPath: z.string().trim().max(200, "La foto no es válida.").optional(),
});

/** Foto de un plato: ya llega comprimida del celular (~60 KB); el tope es el del bucket. */
export const FOTO_PLATO_MAX_BYTES = 500_000;

export const esquemaCategoria = z.object({
  id: z.uuid().nullable().default(null),
  nombre: z.string().trim().min(1, "Escribe el nombre de la categoría.").max(40, "El nombre es muy largo (máximo 40 caracteres)."),
  icono: z.string().trim().max(8).default(""),
  activa: z.boolean().default(true),
  /** false = sus platos no pasan por la cocina (bebidas): no salen en la plancha. */
  sePrepara: z.boolean().default(true),
});

/** Adición ("queso extra + $ 2.000"). `categoriaId: null` = vale para cualquier plato. `activo: false` la quita. */
export const esquemaAdicion = z.object({
  id: z.uuid().nullable().default(null),
  categoriaId: z.uuid("La categoría no es válida.").nullable().default(null),
  nombre: z.string().trim().min(1, "Escribe el nombre de la adición.").max(40, "El nombre es muy largo (máximo 40 caracteres)."),
  precioExtra: z.number().int("El precio debe ser un número entero de pesos.").min(0, "El precio no es válido.").max(1_000_000, "El precio es demasiado alto."),
  activo: z.boolean().default(true),
});

/** Mesa. `activa: false` la quita (los pedidos de antes conservan su mesa). */
export const esquemaMesa = z.object({
  id: z.uuid().nullable().default(null),
  nombre: z.string().trim().min(1, "Escribe el nombre de la mesa.").max(30, "El nombre es muy largo (máximo 30 caracteres)."),
  activa: z.boolean().default(true),
});

/** PIN para reiniciar la demo (lo define quien administra la base). Vacío = no se envió. */
export const esquemaPin = z.string().trim().regex(/^[0-9]{0,8}$/, "El PIN son solo números.");

/** Nombre del restaurante al reiniciar la demo. */
export const esquemaNombreRestaurante = z.string().trim().min(1, "Escribe el nombre del restaurante.").max(60, "El nombre es muy largo (máximo 60 caracteres).");

export const esquemaDisponibilidad = z.object({
  productoId: z.uuid("El plato no es válido."),
  disponible: z.boolean(),
});
