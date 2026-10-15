/**
 * Forma de lo que devuelven las funciones SQL (supabase/migrations/*lectura.sql). Se escriben a mano porque
 * no hay generador de tipos; las pruebas de reglas-negocio verifican que el SQL devuelva estos campos.
 * Todo importe es un entero en pesos COP.
 */
import type { Area } from "@/lib/areas";
import type { MedioPago } from "@/lib/dinero";

export type TipoPedido = "mesa" | "llevar" | "domicilio";
export type EstadoPedido = "pendiente" | "listo" | "entregado";

export type Contexto = {
  restaurante: {
    id: string;
    nombre: string;
    es_demo: boolean;
    slug: string;
    pedidos_en_linea: boolean;
    /** Reiniciar la demo pide PIN (falta antes de la migración 15: no lo pide). */
    reinicio_con_pin?: boolean;
    /** Hora de Bogotá en que termina el día de trabajo (falta antes de la migración 16: se asume 4). */
    hora_corte?: number;
    /** Horario de atención de los pedidos en línea (ver lib/horario.ts); null o ausente = sin horario. */
    horario?: unknown;
  } | null;
  perfil: {
    nombre: string;
    rol: "dueno" | "ayudante";
    /** Lo que puede abrir quien entra: el dueño todas; el resto, la suma de sus roles (falta antes de la migración 19). */
    areas?: Area[];
    /** Nombres de sus roles en el local (Mesero, Caja…); el dueño puede no tener ninguno. */
    roles?: string[];
  } | null;
};

export type Inicio = {
  /** La jornada: el día al que entra lo que se registre ahora (cambia a la hora de corte o al cerrar el día a mano). */
  fecha: string;
  /** El día de trabajo ya se cerró a mano: hasta la hora de corte, lo que se registre cuenta para el siguiente. */
  jornada_adelantada?: boolean;
  /** Las cifras de plata llegan en null a quien no ve las cuentas del día (área "cierre", migración 19). */
  ventas_hoy: number | null;
  gastos_hoy: number | null;
  ganancia_hoy: number | null;
  pedidos_hoy: number;
  ventas_ayer: number | null;
  gastos_ayer: number | null;
  ganancia_ayer: number | null;
  /** Lo que deben los clientes: null para quien no maneja el fiado ni ve las cuentas. */
  por_cobrar: number | null;
  clientes_con_deuda: number | null;
  pedidos_pendientes: number;
  pedidos_sin_cobrar: number;
  /** Pedidos que hicieron clientes en línea y todavía no se aceptan (opcional: copias locales viejas no lo traen). */
  pedidos_por_confirmar?: number;
};

export type ItemPedidoResumen = {
  id: string;
  nombre: string;
  cantidad: number;
  notas: string | null;
  adiciones: { id: string; nombre: string; precio: number }[];
  /** La plancha ya lo preparó (opcional: copias locales viejas no lo traen). */
  listo?: boolean;
  /** false = no pasa por la cocina (una gaseosa): no sale en la plancha ni cuenta para "N de M platos listos". */
  se_prepara?: boolean;
};

/** De dónde vino el pedido: lo tomó el personal (mostrador) o lo hizo el cliente en línea. */
export type OrigenPedido = "mostrador" | "cliente";

export type PedidoPendiente = {
  id: string;
  numero: number;
  tipo: TipoPedido;
  estado: EstadoPedido;
  created_at: string;
  total: number;
  cobrado: boolean;
  mesa: string | null;
  contacto_nombre: string | null;
  contacto_telefono: string | null;
  direccion: string | null;
  notas: string | null;
  items: ItemPedidoResumen[];
  origen?: OrigenPedido;
  /** Código del seguimiento público (para compartirle el enlace al cliente). */
  token?: string | null;
  tiempo_estimado_min?: number | null;
};

/** Pedido que un cliente hizo en línea y espera que el restaurante lo acepte o lo rechace. */
export type PedidoPorConfirmar = {
  id: string;
  numero: number;
  tipo: "llevar" | "domicilio";
  created_at: string;
  total: number;
  contacto_nombre: string | null;
  contacto_telefono: string | null;
  direccion: string | null;
  notas: string | null;
  token: string;
  items: { id: string; nombre: string; cantidad: number; notas: string | null; adiciones: { id: string; nombre: string; precio: number }[] }[];
};

export type ResumenPorConfirmar = {
  /** El restaurante recibe pedidos en línea (si no, la app pregunta con más calma). */
  activo: boolean;
  cantidad: number;
  recientes: { id: string; numero: number; tipo: "llevar" | "domicilio"; total: number; contacto_nombre: string | null; created_at: string }[];
};

export type ItemPlancha = {
  id: string;
  nombre: string;
  cantidad: number;
  notas: string | null;
  adiciones: { id: string; nombre: string; precio: number }[];
  listo: boolean;
};

export type PedidoPlancha = {
  id: string;
  numero: number;
  tipo: TipoPedido;
  estado: EstadoPedido;
  origen: OrigenPedido;
  created_at: string;
  confirmado_at: string | null;
  listo_at: string | null;
  mesa: string | null;
  contacto_nombre: string | null;
  notas: string | null;
  tiempo_estimado_min: number | null;
  items: ItemPlancha[];
};

export type Plancha = {
  /** Hora del servidor: las esperas se calculan contra ella, no contra el reloj del celular. */
  ahora: string;
  pedidos: PedidoPlancha[];
};

export type PedidoCobrado = {
  id: string;
  numero: number;
  tipo: TipoPedido;
  mesa: string | null;
  contacto_nombre: string | null;
  total: number;
  propina: number;
  cobrado_at: string;
  medios: MedioPago[];
};

export type MenuParaPedido = {
  /** `se_prepara: false` = sus platos no pasan por la cocina (falta en copias locales viejas: se asume que sí). */
  categorias: { id: string; nombre: string; icono: string | null; se_prepara?: boolean }[];
  productos: { id: string; categoria_id: string; nombre: string; precio: number; disponible: boolean }[];
  modificadores: { id: string; categoria_id: string | null; nombre: string; precio_extra: number }[];
  mesas: { id: string; nombre: string; pedido_abierto: string | null }[];
};

export type PedidoDetalle = {
  pedido: {
    id: string;
    numero: number;
    tipo: TipoPedido;
    estado: EstadoPedido;
    created_at: string;
    mesa: string | null;
    contacto_nombre: string | null;
    contacto_telefono: string | null;
    direccion: string | null;
    notas: string | null;
    total: number;
    propina: number;
    cobrado: boolean;
    cobrado_at: string | null;
    anulado: boolean;
  };
  items: {
    id: string;
    nombre: string;
    cantidad: number;
    precio_unitario: number;
    adiciones: { id: string; nombre: string; precio: number }[];
    adiciones_total: number;
    notas: string | null;
    subtotal: number;
  }[];
  pagos: {
    id: string;
    medio: MedioPago;
    monto: number;
    recibido: number | null;
    vuelto: number | null;
    referencia: string | null;
    cliente_id: string | null;
  }[];
};

export type ClienteFiado = {
  id: string;
  nombre: string;
  telefono: string | null;
  saldo: number;
  /** Fecha (YYYY-MM-DD) de la deuda más vieja que sigue sin pagar. */
  debe_desde: string | null;
};

export type FichaFiado = {
  cliente: { id: string; nombre: string; telefono: string | null };
  saldo: number;
  movimientos: {
    id: string;
    tipo: "cargo" | "abono";
    monto: number;
    medio: "efectivo" | "transferencia" | null;
    referencia: string | null;
    pedido_numero: number | null;
    created_at: string;
    fecha: string;
    anulado: boolean;
    anulado_motivo: string | null;
  }[];
};

export type CategoriaGasto = "carnes" | "verduras" | "pan" | "bebidas" | "gas" | "domiciliario" | "empaques" | "servicios" | "ayudante" | "otros";

export type GastosDelDia = {
  fecha: string;
  total: number;
  gastos: {
    id: string;
    monto: number;
    categoria: CategoriaGasto;
    nota: string | null;
    foto_path: string | null;
    de_caja: boolean;
    created_at: string;
    anulado: boolean;
    anulado_motivo: string | null;
  }[];
};

export type ResumenDia = {
  fecha: string;
  pedidos: number;
  ventas: number;
  propinas: number;
  cobrado_efectivo: number;
  cobrado_transferencia: number;
  fiado_nuevo: number;
  abonos_efectivo: number;
  abonos_transferencia: number;
  gastos: number;
  gastos_caja: number;
  ganancia: number;
  base_caja: number;
  efectivo_esperado: number;
};

export type CierreDia = {
  id: string;
  fecha: string;
  ventas: number;
  gastos: number;
  ganancia: number;
  base_caja: number;
  efectivo_esperado: number;
  efectivo_contado: number;
  diferencia: number;
  notas: string | null;
  created_at: string;
};

export type CierreReciente = Pick<
  CierreDia,
  "id" | "fecha" | "ventas" | "gastos" | "ganancia" | "base_caja" | "efectivo_esperado" | "efectivo_contado" | "diferencia"
>;

export type CierreDelDia = {
  resumen: ResumenDia;
  cierre: CierreDia | null;
  /** A qué día entra lo que se registre ahora; si el de `resumen` ya se cerró, es el siguiente. Falta antes de la migración 16. */
  jornada?: string;
  /** Un día anterior con movimiento que quedó sin cerrar (YYYY-MM-DD), si no es el que se mira. Falta antes de la migración 21. */
  sin_cerrar?: string | null;
  cierres_recientes: CierreReciente[];
};

export type MenuAdmin = {
  categorias: {
    id: string;
    nombre: string;
    icono: string | null;
    orden: number;
    activa: boolean;
    /** false = sus platos no pasan por la cocina (bebidas): no salen en la plancha. Falta antes de la migración 14. */
    se_prepara?: boolean;
    productos: {
      id: string;
      nombre: string;
      precio: number;
      disponible: boolean;
      orden: number;
      /** Texto corto para el menú del cliente. Falta antes de la migración 17. */
      descripcion?: string | null;
      /** Ruta de la foto en Storage (<restaurante_id>/<archivo>). */
      foto_path?: string | null;
      /** Dirección lista para un <img>; la arma el servidor al cargar la pantalla (no viene de la base). */
      foto_url?: string | null;
    }[];
  }[];
  modificadores: { id: string; categoria_id: string | null; nombre: string; precio_extra: number }[];
  /** Platos quitados del menú (se pueden volver a poner). Falta si la base todavía no tiene la migración 13. */
  quitados?: PlatoQuitado[];
};

export type PlatoQuitado = { id: string; categoria_id: string; categoria: string; nombre: string; precio: number };

export type Adicion = MenuAdmin["modificadores"][number];

/** Una mesa activa. `ocupada` = tiene un pedido sin cobrar (no se puede quitar). */
export type MesaAdmin = { id: string; nombre: string; orden: number; ocupada: boolean };

/** Un rol del equipo del local (Mesero, Cocina, Caja…) y cuántas personas lo tienen. */
export type RolEquipo = { id: string; nombre: string; areas: Area[]; personas: number };

/** Una persona del equipo: sus roles (ids) y lo que abre con ellos (el dueño, todo). */
export type PersonaEquipo = { user_id: string; nombre: string; rol: "dueno" | "ayudante"; yo: boolean; roles: string[]; areas: Area[] };

/** Una invitación que espera a que la canjeen (con su código: solo la ve el dueño). */
export type InvitacionEquipo = { id: string; nombre: string; codigo: string; expira_at: string; roles: string[] };

/** Más → Equipo (listar_equipo, solo el dueño). `invitaciones` falta antes de la migración 20. */
export type Equipo = { areas: Area[]; roles: RolEquipo[]; personas: PersonaEquipo[]; invitaciones?: InvitacionEquipo[] };
