/**
 * Lo que ve el cliente sin cuenta (panel de pedidos en línea y seguimiento). Forma de lo que devuelven
 * publico_menu y publico_ver_pedido (migración 0010). Solo tipos: los usa el navegador.
 */

export type MenuPublico = {
  restaurante: { nombre: string; slug: string; es_demo: boolean; abierto: boolean };
  categorias: { id: string; nombre: string; icono: string | null }[];
  productos: { id: string; categoria_id: string; nombre: string; precio: number; disponible: boolean }[];
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
