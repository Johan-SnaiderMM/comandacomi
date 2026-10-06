/**
 * Tipos del trabajo sin conexión: la copia local de los datos (Snapshot), las operaciones que se hacen sin señal
 * y la cola que las guarda hasta poder subirlas. Solo tipos (sin Zod ni código de servidor): los usa el navegador.
 */
import type {
  CategoriaGasto,
  ClienteFiado,
  Contexto,
  EstadoPedido,
  MenuParaPedido,
  PedidoCobrado,
  PedidoPendiente,
  TipoPedido,
} from "@/lib/datos/tipos";
import type { MedioAbono, MedioPago } from "@/lib/dinero";

/** Lo que el celular sabe del restaurante la última vez que hubo señal. */
export type Snapshot = {
  version: 1;
  /** Cuándo se guardó (ISO). */
  guardadoEn: string;
  contexto: Contexto;
  menu: MenuParaPedido;
  pendientes: PedidoPendiente[];
  cobrados: PedidoCobrado[];
  clientes: ClienteFiado[];
};

export type ItemEnvio = { productoId: string; cantidad: number; adiciones: string[]; notas: string };

export type PagoOperacion = {
  medio: MedioPago;
  monto: number;
  recibido?: number;
  referencia?: string;
  clienteId?: string;
};

/** Datos de cada tipo de operación. Los ids de pedido y cliente nuevos los elige el celular. */
export type DatosOperacion = {
  crear_pedido: {
    id: string;
    tipo: TipoPedido;
    mesaId: string | null;
    contactoNombre: string;
    contactoTelefono: string;
    direccion: string;
    notas: string;
    items: ItemEnvio[];
  };
  agregar_items: { pedidoId: string; items: ItemEnvio[] };
  cambiar_estado: { pedidoId: string; estado: EstadoPedido };
  cobrar: { pedidoId: string; propina: number; pagos: PagoOperacion[] };
  crear_cliente: { id: string; nombre: string; telefono: string };
  abonar: { clienteId: string; monto: number; medio: MedioAbono; referencia: string };
  gasto: { monto: number; categoria: CategoriaGasto; nota: string; deCaja: boolean };
};

export type TipoOperacion = keyof DatosOperacion;

export type Operacion<T extends TipoOperacion = TipoOperacion> = {
  [K in T]: {
    /** Identifica la operación para siempre: reintentar con la misma clave nunca la repite. */
    clave: string;
    tipo: K;
    datos: DatosOperacion[K];
    /** Cuándo ocurrió, según el reloj del celular (ISO). */
    ocurridoEn: string;
    /** Solo crear_pedido: número provisional (N1, N2…) hasta que el servidor asigne el definitivo. */
    numeroLocal?: number;
  };
}[T];

/**
 *  - pendiente: falta subirla.
 *  - enviada: el servidor ya la aplicó; se conserva hasta que la copia local se refresque con ella incluida.
 *  - fallida: el servidor la rechazó (con su motivo); espera que alguien la revise.
 */
export type EstadoOperacion = "pendiente" | "enviada" | "fallida";
export type OperacionEnCola = Operacion & { estado: EstadoOperacion; error?: string; intentos: number };

export type EstadoCola = { version: 1; siguienteLocal: number; ops: OperacionEnCola[] };

/** Lo que el servidor contesta al aplicar una operación. */
export type RespuestaOperacion = { ok: true; datos: unknown } | { ok: false; error: string; sinSesion?: boolean };
