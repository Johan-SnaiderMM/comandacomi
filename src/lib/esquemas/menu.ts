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
});

export const esquemaCategoria = z.object({
  id: z.uuid().nullable().default(null),
  nombre: z.string().trim().min(1, "Escribe el nombre de la categoría.").max(40, "El nombre es muy largo (máximo 40 caracteres)."),
  icono: z.string().trim().max(8).default(""),
  activa: z.boolean().default(true),
});

export const esquemaDisponibilidad = z.object({
  productoId: z.uuid("El plato no es válido."),
  disponible: z.boolean(),
});
