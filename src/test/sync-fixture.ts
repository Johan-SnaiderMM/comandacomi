/** Datos de ejemplo para probar el trabajo sin conexión (sin base de datos). */
import type { Snapshot } from "@/lib/sync/tipos";

export const ID = {
  perro: "11111111-1111-4111-8111-111111111111",
  hamburguesa: "22222222-2222-4222-8222-222222222222",
  jugo: "33333333-3333-4333-8333-333333333333",
  queso: "44444444-4444-4444-8444-444444444444",
  mesa1: "55555555-5555-4555-8555-555555555551",
  mesa2: "55555555-5555-4555-8555-555555555552",
  cliAna: "66666666-6666-4666-8666-666666666661",
  cliLuis: "66666666-6666-4666-8666-666666666662",
  pedidoViejo: "77777777-7777-4777-8777-777777777771",
  catComida: "88888888-8888-4888-8888-888888888881",
  catBebida: "88888888-8888-4888-8888-888888888882",
} as const;

export function snapshotDeEjemplo(): Snapshot {
  return {
    version: 1,
    guardadoEn: "2026-10-06T15:00:00.000Z",
    contexto: {
      restaurante: { id: "99999999-9999-4999-8999-999999999999", nombre: "Picnic Delicias", es_demo: true },
      perfil: { nombre: "Administrador", rol: "dueno" },
    },
    menu: {
      categorias: [
        { id: ID.catComida, nombre: "Comida", icono: "🍔" },
        { id: ID.catBebida, nombre: "Bebidas", icono: "🍹" },
      ],
      productos: [
        { id: ID.perro, categoria_id: ID.catComida, nombre: "Perro caliente", precio: 9000, disponible: true },
        { id: ID.hamburguesa, categoria_id: ID.catComida, nombre: "Hamburguesa sencilla", precio: 14000, disponible: true },
        { id: ID.jugo, categoria_id: ID.catBebida, nombre: "Jugo en agua", precio: 5000, disponible: true },
      ],
      modificadores: [{ id: ID.queso, categoria_id: ID.catComida, nombre: "Queso extra", precio_extra: 2000 }],
      mesas: [
        { id: ID.mesa1, nombre: "Mesa 1", pedido_abierto: null },
        { id: ID.mesa2, nombre: "Mesa 2", pedido_abierto: ID.pedidoViejo },
      ],
    },
    pendientes: [
      {
        id: ID.pedidoViejo,
        numero: 131,
        tipo: "mesa",
        estado: "listo",
        created_at: "2026-10-06T14:00:00.000Z",
        total: 23000,
        cobrado: false,
        mesa: "Mesa 2",
        contacto_nombre: null,
        contacto_telefono: null,
        direccion: null,
        notas: null,
        items: [
          { id: "i1", nombre: "Hamburguesa sencilla", cantidad: 1, notas: null, adiciones: [] },
          { id: "i2", nombre: "Perro caliente", cantidad: 1, notas: null, adiciones: [] },
        ],
      },
    ],
    cobrados: [],
    clientes: [
      { id: ID.cliAna, nombre: "Ana Ríos", telefono: "+573001112233", saldo: 30000, debe_desde: "2026-10-01" },
      { id: ID.cliLuis, nombre: "Luis Gómez", telefono: null, saldo: 0, debe_desde: null },
    ],
  };
}
