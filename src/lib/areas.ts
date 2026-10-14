/**
 * Las áreas del local: lo que un rol del equipo puede abrir. El dueño las abre todas.
 * La misma lista vive en la base (`fn_areas`, migración 19), que es la que de verdad pone el candado. Aquí se decide
 * solo qué se MUESTRA (pestañas, botones, pantallas), para que nadie se tope con algo que la base le va a rechazar.
 * `src/test/permisos-por-area.test.ts` verifica que las dos listas sean iguales.
 */
export const AREAS = ["pedidos", "plancha", "caja", "fiado", "gastos", "cierre"] as const;

export type Area = (typeof AREAS)[number];

/** Cómo se le explica cada área al dueño cuando arma los roles (Más → Equipo). */
export const TEXTO_AREA: Record<Area, { titulo: string; detalle: string }> = {
  pedidos: { titulo: "Tomar pedidos", detalle: "Tomar, entregar y anular pedidos, y aceptar los pedidos en línea" },
  plancha: { titulo: "Plancha", detalle: "Ver lo que hay que cocinar y marcar los platos listos" },
  caja: { titulo: "Cobrar", detalle: "Cobrar (también fiado) y deshacer un cobro" },
  fiado: { titulo: "Fiado", detalle: "Ver quién debe y recibir abonos" },
  gastos: { titulo: "Gastos", detalle: "Anotar y anular gastos" },
  cierre: { titulo: "Cuentas del día", detalle: "Ventas, ganancia y cierre de caja" },
};

/** Quien usa la app: qué áreas abre y si es el dueño (el menú, las mesas y el equipo son solo suyos). */
export type Quien = { areas: Area[]; esDueno: boolean };

/**
 * Quién es, a partir del perfil de la sesión. El dueño, todo. Si el perfil no trae áreas (la base todavía no tiene la
 * migración 19, o es una copia guardada sin conexión de antes) queda como era antes: todo abierto.
 */
export function quienEs(contexto: { perfil: { rol: string; areas?: readonly string[] } | null }): Quien {
  const perfil = contexto.perfil;
  if (!perfil) return { areas: [], esDueno: false };
  const esDueno = perfil.rol === "dueno";
  if (esDueno || !perfil.areas) return { areas: [...AREAS], esDueno };
  return { areas: AREAS.filter((a) => perfil.areas!.includes(a)), esDueno };
}

/** ¿Abre ALGUNA de estas áreas? */
export function abre(quien: Quien, ...areas: readonly Area[]): boolean {
  return areas.some((a) => quien.areas.includes(a));
}

type Regla = { ruta: string; titulo: string; pide: readonly Area[] | "dueno"; accion: string };

/**
 * Qué pide cada pantalla del personal (Inicio y Más son de todos). `pide`: alguna de esas áreas, o "dueno" = solo él.
 * Cada página lo revisa con `revisarPermiso` (lib/permisos.ts); una prueba verifica que ninguna se quede sin hacerlo.
 */
export const PANTALLAS = {
  pendientes: { ruta: "/pedidos", titulo: "Pendientes", pide: ["pedidos", "caja"], accion: "ver los pedidos pendientes" },
  tomar: { ruta: "/pedido/nuevo", titulo: "Tomar pedido", pide: ["pedidos"], accion: "tomar pedidos" },
  cobrar: { ruta: "/pedidos/[id]/cobrar", titulo: "Cobrar", pide: ["caja"], accion: "cobrar" },
  enLinea: { ruta: "/pedidos-en-linea", titulo: "Pedidos en línea", pide: ["pedidos"], accion: "ver los pedidos en línea" },
  qr: { ruta: "/qr", titulo: "Cartel QR", pide: ["pedidos"], accion: "imprimir el cartel del QR" },
  plancha: { ruta: "/plancha", titulo: "Plancha", pide: ["plancha"], accion: "usar la plancha" },
  fiado: { ruta: "/fiado", titulo: "Fiado", pide: ["fiado"], accion: "ver el fiado" },
  gastos: { ruta: "/gastos", titulo: "Gastos", pide: ["gastos"], accion: "ver y anotar gastos" },
  cierre: { ruta: "/cierre", titulo: "Cierre del día", pide: ["cierre"], accion: "ver el cierre del día" },
  // Al menú entra también quien toma pedidos o cocina: para marcar lo que se acabó. Cambiarlo es solo del dueño.
  menu: { ruta: "/menu", titulo: "Menú", pide: ["pedidos", "plancha"], accion: "ver el menú" },
  mesas: { ruta: "/mesas", titulo: "Mesas", pide: "dueno", accion: "cambiar las mesas" },
  equipo: { ruta: "/equipo", titulo: "Equipo", pide: "dueno", accion: "armar el equipo" },
} as const satisfies Record<string, Regla>;

export type Pantalla = keyof typeof PANTALLAS;

export function puedeVer(quien: Quien, pantalla: Pantalla): boolean {
  if (quien.esDueno) return true;
  const pide: Regla["pide"] = PANTALLAS[pantalla].pide;
  return pide !== "dueno" && abre(quien, ...pide);
}

export type Pestana = "inicio" | "pendientes" | "tomar" | "enLinea" | "plancha" | "fiado" | "mas";

/**
 * Las pestañas de la barra de abajo, en orden: Inicio y Más siempre; en medio, hasta tres de las que le sirven a quien
 * entra. Para el dueño y el mesero quedan como siempre (Pendientes, Tomar en el centro, En línea). Sin conexión no hay
 * pedidos en línea ni plancha (necesitan señal): la cuarta es Fiado.
 */
export function pestanasDe(quien: Quien, sinConexion: boolean): Pestana[] {
  const candidatas: (Pestana & Pantalla)[] = sinConexion ? ["pendientes", "tomar", "fiado"] : ["pendientes", "tomar", "enLinea", "plancha", "fiado"];
  const enMedio = candidatas.filter((p) => puedeVer(quien, p)).slice(0, 3);
  return ["inicio", ...enMedio, "mas"];
}
