/**
 * Las áreas del local: lo que un rol del equipo puede abrir. El dueño las abre todas.
 * La misma lista vive en la base (`fn_areas`, migración 19), que es la que de verdad pone el candado;
 * `src/test/permisos-por-area.test.ts` verifica que las dos sean iguales.
 */
export const AREAS = ["pedidos", "plancha", "caja", "fiado", "gastos", "cierre"] as const;

export type Area = (typeof AREAS)[number];
