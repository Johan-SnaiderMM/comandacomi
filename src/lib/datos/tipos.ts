/**
 * Forma de lo que devuelven las funciones SQL (supabase/migrations/*lectura.sql). Se escriben a mano porque
 * no hay generador de tipos; las pruebas de reglas-negocio verifican que el SQL devuelva estos campos.
 * Todo importe es un entero en pesos COP.
 */
import type { MedioPago } from "@/lib/dinero";

export type TipoPedido = "mesa" | "llevar" | "domicilio";
export type EstadoPedido = "pendiente" | "listo" | "entregado";

export type Contexto = {
  restaurante: { id: string; nombre: string; es_demo: boolean; slug: string; pedidos_en_linea: boolean } | null;
  perfil: { nombre: string; rol: "dueno" | "ayudante" } | null;
};

export type Inicio = {
  fecha: string;
  ventas_hoy: number;
  gastos_hoy: number;
  ganancia_hoy: number;
  pedidos_hoy: number;
  ventas_ayer: number;
  gastos_ayer: number;
  ganancia_ayer: number;
  por_cobrar: number;
  clientes_con_deuda: number;
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
    productos: { id: string; nombre: string; precio: number; disponible: boolean; orden: number }[];
  }[];
  modificadores: { id: string; categoria_id: string | null; nombre: string; precio_extra: number }[];
  /** Platos quitados del menú (se pueden volver a poner). Falta si la base todavía no tiene la migración 13. */
  quitados?: PlatoQuitado[];
};

export type PlatoQuitado = { id: string; categoria_id: string; categoria: string; nombre: string; precio: number };
