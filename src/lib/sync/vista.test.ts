import { describe, expect, it } from "vitest";
import { ID, snapshotDeEjemplo } from "@/test/sync-fixture";
import type { Operacion, OperacionEnCola } from "./tipos";
import { aplicarOperacion, pendientesConCola, vistaDe } from "./vista";

const AHORA = "2026-10-06T16:00:00.000Z";
const NUEVO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";

const crear = (extra: Partial<Operacion<"crear_pedido">["datos"]> = {}, local = 1): Operacion<"crear_pedido"> => ({
  clave: "c1",
  tipo: "crear_pedido",
  ocurridoEn: AHORA,
  numeroLocal: local,
  datos: {
    id: NUEVO,
    tipo: "mesa",
    mesaId: ID.mesa1,
    contactoNombre: "",
    contactoTelefono: "",
    direccion: "",
    notas: "",
    items: [{ productoId: ID.perro, cantidad: 2, adiciones: [ID.queso], notas: " sin cebolla " }],
    ...extra,
  },
});

const enCola = (op: Operacion, estado: OperacionEnCola["estado"] = "pendiente"): OperacionEnCola => ({ ...op, estado, intentos: 0 }) as OperacionEnCola;

describe("crear_pedido", () => {
  it("aparece en pendientes con número provisional negativo, total con adiciones y nombre de la mesa", () => {
    const v = aplicarOperacion(snapshotDeEjemplo(), crear());
    const p = v.pendientes.find((x) => x.id === NUEVO)!;
    expect(p.numero).toBe(-1);
    expect(p.total).toBe((9000 + 2000) * 2);
    expect(p.mesa).toBe("Mesa 1");
    expect(p.estado).toBe("pendiente");
    expect(p.cobrado).toBe(false);
    expect(p.created_at).toBe(AHORA);
    expect(p.items).toEqual([
      { id: "c1:0", nombre: "Perro caliente", cantidad: 2, notas: "sin cebolla", adiciones: [{ id: ID.queso, nombre: "Queso extra", precio: 2000 }] },
    ]);
    expect(v.pendientes.at(-1)?.id).toBe(NUEVO); // los nuevos van al final, como en el servidor
  });

  it("ocupa la mesa (la hoja de destino ofrece agregar al pedido abierto)", () => {
    const v = aplicarOperacion(snapshotDeEjemplo(), crear());
    expect(v.menu.mesas.find((m) => m.id === ID.mesa1)?.pedido_abierto).toBe(NUEVO);
  });

  it("para llevar y domicilio: sin mesa; el teléfono se muestra como quedará guardado", () => {
    const v = aplicarOperacion(
      snapshotDeEjemplo(),
      crear({ tipo: "domicilio", mesaId: null, direccion: " Cra 7 #8-9 ", contactoNombre: " Marta ", contactoTelefono: "300 123 4567" })
    );
    const p = v.pendientes.find((x) => x.id === NUEVO)!;
    expect(p.mesa).toBeNull();
    expect(p.direccion).toBe("Cra 7 #8-9");
    expect(p.contacto_nombre).toBe("Marta");
    expect(p.contacto_telefono).toBe("+573001234567");
  });

  it("no se aplica dos veces y un plato que ya no existe no inventa un pedido vacío", () => {
    const una = aplicarOperacion(snapshotDeEjemplo(), crear());
    expect(aplicarOperacion(una, crear()).pendientes).toHaveLength(2);
    const sin = aplicarOperacion(snapshotDeEjemplo(), crear({ items: [{ productoId: "00000000-0000-4000-8000-000000000000", cantidad: 1, adiciones: [], notas: "" }] }));
    expect(sin.pendientes).toHaveLength(1);
  });
});

describe("agregar_items y cambiar_estado", () => {
  it("agregar platos suma al total y devuelve el pedido a pendiente", () => {
    const op: Operacion<"agregar_items"> = {
      clave: "a1",
      tipo: "agregar_items",
      ocurridoEn: AHORA,
      datos: { pedidoId: ID.pedidoViejo, items: [{ productoId: ID.jugo, cantidad: 2, adiciones: [], notas: "" }] },
    };
    const v = aplicarOperacion(snapshotDeEjemplo(), op);
    const p = v.pendientes[0];
    expect(p.total).toBe(23000 + 10000);
    expect(p.estado).toBe("pendiente");
    expect(p.items).toHaveLength(3);
  });

  describe("lo que no pasa por la cocina (categoría con se_prepara: false)", () => {
    /** La copia del menú con Bebidas marcada como "no se prepara". */
    const conBebidasSinCocina = () => {
      const s = snapshotDeEjemplo();
      return { ...s, menu: { ...s.menu, categorias: s.menu.categorias.map((c) => (c.id === ID.catBebida ? { ...c, se_prepara: false } : c)) } };
    };
    const unJugo = [{ productoId: ID.jugo, cantidad: 1, adiciones: [], notas: "" }];
    const agregarJugo: Operacion<"agregar_items"> = { clave: "a2", tipo: "agregar_items", ocurridoEn: AHORA, datos: { pedidoId: ID.pedidoViejo, items: unJugo } };

    it("un pedido de solo bebidas nace listo; con un plato de cocina, pendiente", () => {
      const soloBebida = aplicarOperacion(conBebidasSinCocina(), crear({ items: unJugo }));
      const p = soloBebida.pendientes.find((x) => x.id === NUEVO)!;
      expect(p.estado).toBe("listo");
      expect(p.items[0].se_prepara).toBe(false);

      const mixto = aplicarOperacion(conBebidasSinCocina(), crear({ items: [...unJugo, { productoId: ID.perro, cantidad: 1, adiciones: [], notas: "" }] }));
      expect(mixto.pendientes.find((x) => x.id === NUEVO)!.estado).toBe("pendiente");
    });

    it("agregar solo una bebida no devuelve el pedido a la cocina; si ya estaba entregado, queda listo para entregarla", () => {
      const listo = aplicarOperacion(conBebidasSinCocina(), agregarJugo);
      expect(listo.pendientes[0]).toMatchObject({ estado: "listo", total: 23000 + 5000 });

      const entregado = aplicarOperacion(conBebidasSinCocina(), { clave: "e0", tipo: "cambiar_estado", ocurridoEn: AHORA, datos: { pedidoId: ID.pedidoViejo, estado: "entregado" } });
      expect(aplicarOperacion(entregado, agregarJugo).pendientes[0].estado).toBe("listo");
    });
  });

  it("entregado y cobrado sale de la lista; entregado sin cobrar se queda", () => {
    const entregar: Operacion<"cambiar_estado"> = { clave: "e1", tipo: "cambiar_estado", ocurridoEn: AHORA, datos: { pedidoId: ID.pedidoViejo, estado: "entregado" } };
    const v = aplicarOperacion(snapshotDeEjemplo(), entregar);
    expect(v.pendientes[0].estado).toBe("entregado");
    const cobrar: Operacion<"cobrar"> = {
      clave: "k1",
      tipo: "cobrar",
      ocurridoEn: AHORA,
      datos: { pedidoId: ID.pedidoViejo, propina: 0, pagos: [{ medio: "efectivo", monto: 23000, recibido: 25000 }] },
    };
    const w = aplicarOperacion(v, cobrar);
    expect(w.pendientes).toHaveLength(0);
    expect(w.cobrados[0]).toMatchObject({ id: ID.pedidoViejo, numero: 131, total: 23000, propina: 0, medios: ["efectivo"], cobrado_at: AHORA });
  });
});

describe("cobrar", () => {
  it("cobrado pero sin entregar sigue en pendientes marcado como cobrado, y libera la mesa", () => {
    const cobrar: Operacion<"cobrar"> = {
      clave: "k1",
      tipo: "cobrar",
      ocurridoEn: AHORA,
      datos: { pedidoId: ID.pedidoViejo, propina: 2000, pagos: [{ medio: "transferencia", monto: 25000 }] },
    };
    const v = aplicarOperacion(snapshotDeEjemplo(), cobrar);
    expect(v.pendientes[0].cobrado).toBe(true);
    expect(v.menu.mesas.find((m) => m.id === ID.mesa2)?.pedido_abierto).toBeNull();
    expect(v.cobrados[0].propina).toBe(2000);
  });

  it("fiado suma a la deuda del cliente (y marca desde cuándo debe si estaba al día)", () => {
    const cobrar: Operacion<"cobrar"> = {
      clave: "k2",
      tipo: "cobrar",
      ocurridoEn: AHORA,
      datos: {
        pedidoId: ID.pedidoViejo,
        propina: 0,
        pagos: [
          { medio: "efectivo", monto: 3000, recibido: 3000 },
          { medio: "fiado", monto: 20000, clienteId: ID.cliLuis },
        ],
      },
    };
    const v = aplicarOperacion(snapshotDeEjemplo(), cobrar);
    const luis = v.clientes.find((c) => c.id === ID.cliLuis)!;
    expect(luis.saldo).toBe(20000);
    expect(luis.debe_desde).toBe("2026-10-06");
    expect(v.cobrados[0].medios).toEqual(["efectivo", "fiado"]);
    expect(v.clientes.map((c) => c.id)).toEqual([ID.cliAna, ID.cliLuis]); // ordenados por lo que deben
  });

  it("un pedido ya cobrado o inexistente no se cobra de nuevo", () => {
    const cobrar: Operacion<"cobrar"> = {
      clave: "k3",
      tipo: "cobrar",
      ocurridoEn: AHORA,
      datos: { pedidoId: ID.pedidoViejo, propina: 0, pagos: [{ medio: "efectivo", monto: 23000 }] },
    };
    const una = aplicarOperacion(snapshotDeEjemplo(), cobrar);
    expect(aplicarOperacion(una, cobrar).cobrados).toHaveLength(1);
    expect(aplicarOperacion(snapshotDeEjemplo(), { ...cobrar, datos: { ...cobrar.datos, pedidoId: NUEVO } }).cobrados).toHaveLength(0);
  });
});

describe("clientes y abonos", () => {
  it("cliente nuevo queda al día y se puede usar enseguida", () => {
    const op: Operacion<"crear_cliente"> = { clave: "n1", tipo: "crear_cliente", ocurridoEn: AHORA, datos: { id: NUEVO, nombre: " Don Hernán ", telefono: "310 444 5566" } };
    const v = aplicarOperacion(snapshotDeEjemplo(), op);
    expect(v.clientes.find((c) => c.id === NUEVO)).toEqual({ id: NUEVO, nombre: "Don Hernán", telefono: "+573104445566", saldo: 0, debe_desde: null });
  });

  it("el abono baja la deuda sin pasarse de cero", () => {
    const abono = (monto: number): Operacion<"abonar"> => ({
      clave: "b" + monto,
      tipo: "abonar",
      ocurridoEn: AHORA,
      datos: { clienteId: ID.cliAna, monto, medio: "efectivo", referencia: "" },
    });
    const parcial = aplicarOperacion(snapshotDeEjemplo(), abono(10000));
    expect(parcial.clientes.find((c) => c.id === ID.cliAna)?.saldo).toBe(20000);
    const total = aplicarOperacion(parcial, abono(99999));
    const ana = total.clientes.find((c) => c.id === ID.cliAna)!;
    expect(ana.saldo).toBe(0);
    expect(ana.debe_desde).toBeNull();
  });

  it("un gasto no cambia lo que se ve", () => {
    const s = snapshotDeEjemplo();
    const gasto: Operacion<"gasto"> = { clave: "g1", tipo: "gasto", ocurridoEn: AHORA, datos: { monto: 5000, categoria: "gas", nota: "", deCaja: true, fotoPath: null } };
    expect(aplicarOperacion(s, gasto)).toBe(s);
  });
});

describe("vistaDe", () => {
  it("aplica la cola en orden y se salta lo rechazado", () => {
    const cobrar: Operacion<"cobrar"> = {
      clave: "k1",
      tipo: "cobrar",
      ocurridoEn: AHORA,
      datos: { pedidoId: NUEVO, propina: 0, pagos: [{ medio: "efectivo", monto: 22000, recibido: 22000 }] },
    };
    const v = vistaDe(snapshotDeEjemplo(), [enCola(crear()), enCola(cobrar)]);
    expect(v.cobrados.map((c) => c.id)).toEqual([NUEVO]);

    const sinCrear = vistaDe(snapshotDeEjemplo(), [enCola(crear(), "fallida"), enCola(cobrar)]);
    expect(sinCrear.cobrados).toHaveLength(0); // sin el pedido no hay qué cobrar
    expect(sinCrear.pendientes).toHaveLength(1);
  });

  it("no modifica la copia original", () => {
    const s = snapshotDeEjemplo();
    const antes = JSON.stringify(s);
    vistaDe(s, [enCola(crear())]);
    expect(JSON.stringify(s)).toBe(antes);
  });
});

describe("pendientes de la app normal con la cola encima", () => {
  const estado = (pedidoId: string, a: "pendiente" | "listo" | "entregado", clave = "e1"): Operacion<"cambiar_estado"> => ({
    clave,
    tipo: "cambiar_estado",
    ocurridoEn: AHORA,
    datos: { pedidoId, estado: a },
  });
  const cobro = (pedidoId: string): Operacion<"cobrar"> => ({
    clave: "k9",
    tipo: "cobrar",
    ocurridoEn: AHORA,
    datos: { pedidoId, propina: 0, pagos: [{ medio: "efectivo", monto: 23000 }] },
  });

  it("un cambio de estado por subir se sigue viendo hecho", () => {
    const lista = snapshotDeEjemplo().pendientes; // el pedido viejo está "listo"
    const v = pendientesConCola(lista, [enCola(estado(ID.pedidoViejo, "entregado"))]);
    expect(v[0].estado).toBe("entregado");
    expect(lista[0].estado).toBe("listo"); // no toca la lista original
  });

  it("cobrado y entregado por subir: sale de la lista, como pasará en el servidor", () => {
    const lista = snapshotDeEjemplo().pendientes;
    expect(pendientesConCola(lista, [enCola(cobro(ID.pedidoViejo))])[0].cobrado).toBe(true);
    expect(pendientesConCola(lista, [enCola(estado(ID.pedidoViejo, "entregado")), enCola(cobro(ID.pedidoViejo))])).toEqual([]);
  });

  it("lo rechazado no cuenta, y sin nada que aplicar devuelve la misma lista", () => {
    const lista = snapshotDeEjemplo().pendientes;
    expect(pendientesConCola(lista, [enCola(estado(ID.pedidoViejo, "entregado"), "fallida")])).toBe(lista);
    expect(pendientesConCola(lista, [])).toBe(lista);
    expect(pendientesConCola(lista, [enCola(estado(ID.pedidoViejo, "listo"))])).toBe(lista); // ya estaba listo
    expect(pendientesConCola(lista, [enCola(crear())])).toBe(lista); // los pedidos nuevos no se pintan aquí
  });

  it("aplicarla dos veces da lo mismo (la app sin conexión ya trae la cola puesta)", () => {
    const ops = [enCola(estado(ID.pedidoViejo, "pendiente", "e1")), enCola(estado(ID.pedidoViejo, "entregado", "e2"))];
    const una = pendientesConCola(snapshotDeEjemplo().pendientes, ops);
    expect(pendientesConCola(una, ops)).toEqual(una);
  });
});
