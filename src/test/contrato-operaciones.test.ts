/**
 * Contrato entre el celular y la base: lo que la app guarda en la cola (DatosOperacion), una vez validado por
 * argumentosDeOperacion, lo acepta aplicar_operacion tal cual. Si cambia uno de los dos lados sin el otro,
 * esta prueba lo avisa.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { argumentosDeOperacion } from "@/lib/esquemas/operacion";
import type { DatosOperacion, TipoOperacion } from "@/lib/sync/tipos";
import { crearBase, crearRestauranteDemo, rpc } from "./base-datos";

type Menu = {
  productos: { id: string; nombre: string; precio: number }[];
  modificadores: { id: string; categoria_id: string | null; nombre: string }[];
  mesas: { id: string; pedido_abierto: string | null }[];
};

let db: PGlite;
let U: string;
let menu: Menu;

const uuid = () => crypto.randomUUID();

async function aplicar<T extends TipoOperacion>(tipo: T, datos: DatosOperacion[T], ocurrido = new Date().toISOString()) {
  const a = argumentosDeOperacion(tipo, datos);
  if (!a.ok) throw new Error(`argumentos rechazados: ${a.error}`);
  return rpc<Record<string, unknown>>(db, U, "aplicar_operacion", { p_clave: uuid(), p_tipo: tipo, p_args: a.args, p_ocurrido_en: ocurrido });
}

beforeAll(async () => {
  db = await crearBase();
  ({ userId: U } = await crearRestauranteDemo(db, "Contrato"));
  menu = await rpc<Menu>(db, U, "obtener_menu_para_pedido");
});
afterAll(() => db.close());

describe("lo que guarda la cola lo acepta la base", () => {
  it("un pedido de mesa, con adiciones y notas, cobrado en dos medios (efectivo + fiado a un cliente nuevo)", async () => {
    const perro = menu.productos.find((p) => p.nombre === "Perro caliente")!;
    const jugo = menu.productos.find((p) => p.nombre === "Jugo en agua") ?? menu.productos.at(-1)!;
    const adicion = menu.modificadores.find((m) => m.categoria_id === null) ?? menu.modificadores[0];
    const mesa = menu.mesas.find((m) => !m.pedido_abierto)!;
    const pedidoId = uuid();

    const creado = (await aplicar("crear_pedido", {
      id: pedidoId,
      tipo: "mesa",
      mesaId: mesa.id,
      contactoNombre: "",
      contactoTelefono: "",
      direccion: "",
      notas: "",
      items: [{ productoId: perro.id, cantidad: 2, adiciones: adicion ? [adicion.id] : [], notas: "sin cebolla" }],
    })) as { id: string; total: number };
    expect(creado.id).toBe(pedidoId);

    const mas = (await aplicar("agregar_items", { pedidoId, items: [{ productoId: jugo.id, cantidad: 1, adiciones: [], notas: "" }] })) as { total: number };
    expect(mas.total).toBeGreaterThan(creado.total);

    await aplicar("cambiar_estado", { pedidoId, estado: "listo" });
    await aplicar("cambiar_estado", { pedidoId, estado: "entregado" });

    const clienteId = uuid();
    const cli = (await aplicar("crear_cliente", { id: clienteId, nombre: "Doña Nubia", telefono: "320 111 2233" })) as { id: string; telefono: string };
    expect(cli).toMatchObject({ id: clienteId, telefono: "+573201112233" });

    const cobro = (await aplicar("cobrar", {
      pedidoId,
      propina: 0,
      pagos: [
        { medio: "efectivo", monto: 5000, recibido: 10000 },
        { medio: "fiado", monto: mas.total - 5000, clienteId },
      ],
    })) as { vuelto: number; fiado: number; cobrado: number };
    expect(cobro).toMatchObject({ vuelto: 5000, fiado: mas.total - 5000, cobrado: mas.total });

    const ab = (await aplicar("abonar", { clienteId, monto: 1000, medio: "transferencia", referencia: " M99 " })) as { saldo: number };
    expect(ab.saldo).toBe(mas.total - 5000 - 1000);

    const g = await aplicar("gasto", { monto: 7000, categoria: "gas", nota: "", deCaja: false, fotoPath: null });
    expect(typeof g.id).toBe("string");
  });

  it("para llevar y domicilio: la dirección viaja solo en domicilio y la mesa nunca", async () => {
    const perro = menu.productos[0];
    const base = { contactoNombre: "Marta", contactoTelefono: "300 123 4567", notas: "", items: [{ productoId: perro.id, cantidad: 1, adiciones: [], notas: "" }] };
    const llevar = (await aplicar("crear_pedido", { id: uuid(), tipo: "llevar", mesaId: menu.mesas[0].id, direccion: "Cra 1", ...base })) as { id: string };
    const dom = (await aplicar("crear_pedido", { id: uuid(), tipo: "domicilio", mesaId: null, direccion: "Cra 7 #8-9", ...base })) as { id: string };
    const filas = await db.query<{ id: string; mesa_id: string | null; direccion: string | null; contacto_telefono: string | null }>(
      `select id, mesa_id, direccion, contacto_telefono from public.pedidos where id = any($1)`,
      [[llevar.id, dom.id]]
    );
    const l = filas.rows.find((f) => f.id === llevar.id)!;
    const d = filas.rows.find((f) => f.id === dom.id)!;
    expect(l.mesa_id).toBeNull();
    expect(l.direccion).toBeNull();
    expect(d.direccion).toBe("Cra 7 #8-9");
    expect(d.contacto_telefono).toBe("+573001234567");
  });
});

describe("argumentosDeOperacion rechaza lo que está mal formado (antes de tocar la base)", () => {
  const rechaza = (tipo: TipoOperacion, datos: unknown, patron: RegExp) => {
    const r = argumentosDeOperacion(tipo, datos);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(patron);
  };

  it("pedido sin platos, sin mesa, domicilio sin dirección o con id inválido", () => {
    const ok = { id: uuid(), tipo: "llevar", mesaId: null, contactoNombre: "", contactoTelefono: "", direccion: "", notas: "", items: [{ productoId: uuid(), cantidad: 1, adiciones: [], notas: "" }] };
    expect(argumentosDeOperacion("crear_pedido", ok).ok).toBe(true);
    rechaza("crear_pedido", { ...ok, items: [] }, /al menos un plato/i);
    rechaza("crear_pedido", { ...ok, tipo: "mesa" }, /Elige la mesa/);
    rechaza("crear_pedido", { ...ok, tipo: "domicilio" }, /dirección/);
    rechaza("crear_pedido", { ...ok, id: "no-es-uuid" }, /pedido no es válido/);
    rechaza("crear_pedido", null, /./);
  });

  it("cantidades fuera de rango, estado inventado, montos no enteros o negativos", () => {
    rechaza("agregar_items", { pedidoId: uuid(), items: [{ productoId: uuid(), cantidad: 100, adiciones: [], notas: "" }] }, /máxima/i);
    rechaza("cambiar_estado", { pedidoId: uuid(), estado: "volando" }, /estado/i);
    rechaza("cobrar", { pedidoId: uuid(), propina: 0, pagos: [{ medio: "efectivo", monto: 10.5 }] }, /entero/i);
    rechaza("cobrar", { pedidoId: uuid(), propina: -1, pagos: [{ medio: "efectivo", monto: 10 }] }, /propina/i);
    rechaza("abonar", { clienteId: uuid(), monto: 0, medio: "efectivo", referencia: "" }, /mayor que cero/i);
    rechaza("abonar", { clienteId: uuid(), monto: 10, medio: "cheque", referencia: "" }, /efectivo o por transferencia/i);
    rechaza("gasto", { monto: 0, categoria: "gas", nota: "", deCaja: true, fotoPath: null }, /cuánto fue/i);
    rechaza("gasto", { monto: 10, categoria: "lujos", nota: "", deCaja: true, fotoPath: null }, /categoría/i);
    rechaza("crear_cliente", { id: uuid(), nombre: "   ", telefono: "" }, /nombre/i);
  });

  it("la ruta de una foto ajena la rechaza la base (cada restaurante, su carpeta)", async () => {
    const r = argumentosDeOperacion("gasto", { monto: 100, categoria: "gas", nota: "", deCaja: true, fotoPath: `${uuid()}/${uuid()}.jpg` });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    await expect(rpc(db, U, "aplicar_operacion", { p_clave: uuid(), p_tipo: "gasto", p_args: r.args })).rejects.toThrow(/foto no es válida/);
  });
});
