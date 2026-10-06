import { describe, expect, it } from "vitest";
import { ID, snapshotDeEjemplo } from "@/test/sync-fixture";
import { describirOperacion } from "./describir";
import type { OperacionEnCola } from "./tipos";
import { hashDeRuta, idDeCobro, parsearRuta } from "./rutas";

describe("parsearRuta", () => {
  it("sin hash es el inicio", () => {
    expect(parsearRuta("").ruta).toBe("/inicio");
    expect(parsearRuta("#").ruta).toBe("/inicio");
  });

  it("separa la ruta de la query", () => {
    const r = parsearRuta("#/pedidos?enviado=-1&pendiente=1");
    expect(r.ruta).toBe("/pedidos");
    expect(r.query.get("enviado")).toBe("-1");
    expect(r.query.get("pendiente")).toBe("1");
  });

  it("acepta una ruta sin la barra inicial", () => {
    expect(parsearRuta("#pedidos").ruta).toBe("/pedidos");
  });
});

describe("hashDeRuta", () => {
  it.each(["/inicio", "/pedidos", "/pedido/nuevo", "/pedido/nuevo?agregar=abc", "/pedidos/3f2a/cobrar", "/fiado", "/gastos/nuevo", "/gastos?guardado=5000", "/mas"])(
    "%s funciona sin conexión",
    (href) => {
      expect(hashDeRuta(href)).toBe(`#${href}`);
    }
  );

  it.each(["/cierre", "/menu", "/fiado/6a1b", "/pedidos/abc/otra-cosa"])("%s lleva a la pantalla que lo explica, recordando adónde iba", (href) => {
    const h = hashDeRuta(href);
    expect(h.startsWith("#/requiere-conexion?ruta=")).toBe(true);
    expect(decodeURIComponent(h.split("ruta=")[1])).toBe(href);
  });

  it("lo que se arma con hashDeRuta se vuelve a leer igual con parsearRuta", () => {
    const r = parsearRuta(hashDeRuta("/pedido/nuevo?agregar=77"));
    expect(r.ruta).toBe("/pedido/nuevo");
    expect(r.query.get("agregar")).toBe("77");
  });
});

describe("idDeCobro", () => {
  it("saca el id de la ruta de cobro", () => {
    expect(idDeCobro("/pedidos/abc-123/cobrar")).toBe("abc-123");
    expect(idDeCobro("/pedidos")).toBeNull();
  });
});

describe("describirOperacion", () => {
  const AHORA = "2026-10-06T16:00:00.000Z";
  const en = (op: object): OperacionEnCola => ({ estado: "pendiente", intentos: 0, ocurridoEn: AHORA, clave: "k", ...op }) as OperacionEnCola;
  const v = snapshotDeEjemplo();

  it("pedido nuevo con número provisional, mesa y cantidad de platos", () => {
    const op = en({
      tipo: "crear_pedido",
      numeroLocal: 2,
      datos: { id: "x", tipo: "mesa", mesaId: ID.mesa1, contactoNombre: "", contactoTelefono: "", direccion: "", notas: "", items: [{ productoId: ID.perro, cantidad: 2, adiciones: [], notas: "" }, { productoId: ID.jugo, cantidad: 1, adiciones: [], notas: "" }] },
    });
    expect(describirOperacion(op, v)).toBe("Pedido N2 · Mesa 1 · 3 platos");
  });

  it("cobro con fiado, abono, cliente y gasto", () => {
    expect(describirOperacion(en({ tipo: "cobrar", datos: { pedidoId: ID.pedidoViejo, propina: 0, pagos: [{ medio: "fiado", monto: 23000, clienteId: ID.cliAna }] } }), v)).toBe("Cobro de $ 23.000 (con fiado)");
    expect(describirOperacion(en({ tipo: "abonar", datos: { clienteId: ID.cliAna, monto: 5000, medio: "efectivo", referencia: "" } }), v)).toBe("Abono de $ 5.000 de Ana Ríos");
    expect(describirOperacion(en({ tipo: "crear_cliente", datos: { id: "c", nombre: "Don Hernán", telefono: "" } }), v)).toBe("Cliente nuevo: Don Hernán");
    expect(describirOperacion(en({ tipo: "gasto", datos: { monto: 7000, categoria: "gas", nota: "", deCaja: true, fotoPath: null } }), v)).toMatch(/^Gasto de \$ 7\.000 · /);
  });

  it("cambios de estado y platos agregados nombran el pedido", () => {
    expect(describirOperacion(en({ tipo: "cambiar_estado", datos: { pedidoId: ID.pedidoViejo, estado: "entregado" } }), v)).toBe("Pedido #131 marcado entregado");
    expect(describirOperacion(en({ tipo: "agregar_items", datos: { pedidoId: ID.pedidoViejo, items: [{ productoId: ID.jugo, cantidad: 1, adiciones: [], notas: "" }] } }), v)).toBe("Agregar 1 plato al pedido #131");
  });
});
