/**
 * Lo que ve el cliente sin cuenta (panel de pedidos en línea y seguimiento). Forma de lo que devuelven
 * publico_menu y publico_ver_pedido (migración 0010). Solo tipos: los usa el navegador.
 */

export type MenuPublico = {
  restaurante: {
    nombre: string;
    slug: string;
    es_demo: boolean;
    /** Se pueden enviar pedidos AHORA: el interruptor está encendido y es hora de atención. */
    abierto: boolean;
    /** Solo el interruptor (falta antes de la migración 17: entonces `abierto` es el interruptor). */
    recibe?: boolean;
    /** Horario de atención tal cual viene de la base (ver lib/horario.ts); null = sin horario. */
    horario?: unknown;
  };
  categorias: { id: string; nombre: string; icono: string | null }[];
  productos: {
    id: string;
    categoria_id: string;
    nombre: string;
    precio: number;
    disponible: boolean;
    descripcion?: string | null;
    /** Ruta de la foto en Storage, como la guarda la base. */
    foto?: string | null;
    /** Dirección lista para un <img>; la arma el servidor al cargar la página. */
    foto_url?: string | null;
  }[];
  modificadores: { id: string; categoria_id: string | null; nombre: string; precio_extra: number }[];
};

export type EtapaPedido = "por_confirmar" | "preparando" | "listo" | "entregado" | "cancelado";

export type SeguimientoPublico = {
  /** Hora del servidor (para calcular el tiempo restante sin depender del reloj del celular del cliente). */
  ahora: string;
  restaurante: { nombre: string; slug: string };
  pedido: {
    numero: number;
    tipo: "mesa" | "llevar" | "domicilio";
    origen: "mostrador" | "cliente";
    etapa: EtapaPedido;
    created_at: string;
    confirmado_at: string | null;
    listo_at: string | null;
    entregado_at: string | null;
    tiempo_estimado_min: number | null;
    total: number;
    contacto_nombre: string | null;
    direccion: string | null;
    /** Solo viene si el restaurante rechazó el pedido antes de aceptarlo. */
    motivo: string | null;
  };
  items: { nombre: string; cantidad: number; notas: string | null; adiciones: string[]; listo: boolean }[];
};
