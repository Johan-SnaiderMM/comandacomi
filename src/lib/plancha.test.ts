import { describe, expect, it } from "vitest";
import type { PedidoPlancha, ResumenPorConfirmar } from "@/lib/datos/tipos";
import { formatearPesos } from "./dinero";
import {
  destinoDePedido,
  idsNuevos,
  minutosDeEspera,
  platosNuevos,
  progresoDePedido,
  separarPlancha,
  textoDeAviso,
  textoDeEspera,
  urgenciaDeEspera,
} from "./plancha";

function pedido(extra: Partial<PedidoPlancha> & { id: string }): PedidoPlancha {
  return {
    numero: 1,
    tipo: "llevar",
    estado: "pendiente",
    origen: "mostrador",
    created_at: "2026-10-12T15:00:00.000Z",
    confirmado_at: null,
    listo_at: null,
    mesa: null,
    contacto_nombre: null,
    notas: null,
    tiempo_estimado_min: null,
    items: [],
    ...extra,
  };
}

describe("cómo se llama cada pedido en la plancha", () => {
  it("mesa, domicilio y para llevar", () => {
    expect(destinoDePedido({ tipo: "mesa", mesa: "Mesa 3", contacto_nombre: null, origen: "mostrador" })).toBe("Mesa 3");
    expect(destinoDePedido({ tipo: "domicilio", mesa: null, contacto_nombre: " Yeison ", origen: "mostrador" })).toBe("Domicilio · Yeison");
    expect(destinoDePedido({ tipo: "domicilio", mesa: null, contacto_nombre: null, origen: "cliente" })).toBe("Domicilio");
    expect(destinoDePedido({ tipo: "llevar", mesa: null, contacto_nombre: null, origen: "mostrador" })).toBe("Para llevar");
  });

  it("si lo pidió el cliente en línea para llevar, él pasa a recogerlo", () => {
    expect(destinoDePedido({ tipo: "llevar", mesa: null, contacto_nombre: "Marta", origen: "cliente" })).toBe("Recoge · Marta");
    expect(destinoDePedido({ tipo: "llevar", mesa: null, contacto_nombre: null, origen: "cliente" })).toBe("Recoge en el local");
  });
});

describe("espera", () => {
  it("minutos enteros contra la hora del servidor, nunca negativos", () => {
    expect(minutosDeEspera("2026-10-12T15:00:00Z", "2026-10-12T15:07:59Z")).toBe(7);
    expect(minutosDeEspera("2026-10-12T15:10:00Z", "2026-10-12T15:00:00Z")).toBe(0);
    expect(minutosDeEspera("no es fecha", "2026-10-12T15:00:00Z")).toBe(0);
  });

  it("urgencia sin tiempo estimado: 8 y 15 minutos", () => {
    expect(urgenciaDeEspera(7)).toBe("normal");
    expect(urgenciaDeEspera(8)).toBe("atencion");
    expect(urgenciaDeEspera(14)).toBe("atencion");
    expect(urgenciaDeEspera(15)).toBe("urgente");
  });

  it("urgencia con tiempo estimado: rojo al pasarlo, amarillo desde el 60 %", () => {
    expect(urgenciaDeEspera(5, 30)).toBe("normal");
    expect(urgenciaDeEspera(18, 30)).toBe("atencion");
    expect(urgenciaDeEspera(30, 30)).toBe("urgente");
    // estimaciones muy cortas no hacen que todo sea urgente de inmediato
    expect(urgenciaDeEspera(2, 1)).toBe("normal");
  });

  it("texto corto del reloj", () => {
    expect(textoDeEspera(0)).toBe("Recién");
    expect(textoDeEspera(7)).toBe("7 min");
    expect(textoDeEspera(60)).toBe("1 h");
    expect(textoDeEspera(65)).toBe("1 h 5 min");
  });
});

describe("progreso y orden de la plancha", () => {
  it("cuenta los platos listos de un pedido", () => {
    const items = [
      { id: "a", nombre: "Hamburguesa", cantidad: 1, notas: null, adiciones: [], listo: true },
      { id: "b", nombre: "Papas", cantidad: 1, notas: null, adiciones: [], listo: false },
    ];
    expect(progresoDePedido({ items })).toEqual({ listos: 1, total: 2, completo: false });
    expect(progresoDePedido({ items: items.map((i) => ({ ...i, listo: true })) })).toEqual({ listos: 2, total: 2, completo: true });
    expect(progresoDePedido({ items: [] }).completo).toBe(false);
  });

  it("por preparar: el más viejo primero; listos: el más reciente primero", () => {
    const { porPreparar, listos } = separarPlancha([
      pedido({ id: "c", numero: 3, created_at: "2026-10-12T15:10:00Z" }),
      pedido({ id: "a", numero: 1, created_at: "2026-10-12T15:00:00Z" }),
      pedido({ id: "b", numero: 2, created_at: "2026-10-12T15:00:00Z" }),
      pedido({ id: "l1", numero: 4, estado: "listo", listo_at: "2026-10-12T15:20:00Z" }),
      pedido({ id: "l2", numero: 5, estado: "listo", listo_at: "2026-10-12T15:25:00Z" }),
    ]);
    expect(porPreparar.map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(listos.map((p) => p.id)).toEqual(["l2", "l1"]);
  });
});

describe("aviso de pedidos nuevos", () => {
  it("detecta solo los ids que antes no estaban", () => {
    expect(idsNuevos(new Set(["a", "b"]), [{ id: "b" }, { id: "c" }, { id: "d" }])).toEqual(["c", "d"]);
    expect(idsNuevos(new Set(), [])).toEqual([]);
  });

  it("texto: un pedido con sus datos; varios, con la cuenta", () => {
    const uno: ResumenPorConfirmar = {
      activo: true,
      atiende: true,
      cantidad: 1,
      recientes: [{ id: "a", numero: 137, tipo: "domicilio", total: 34500, contacto_nombre: "Marta", created_at: "2026-10-12T15:00:00Z" }],
    };
    // el espacio entre "$" y la cifra es no separable ( ) para que el importe no se parta en dos renglones
    expect(textoDeAviso(uno, formatearPesos)).toBe("Pedido #137 · Domicilio · $ 34.500");
    expect(textoDeAviso({ ...uno, recientes: [{ ...uno.recientes[0], tipo: "llevar" }] }, formatearPesos)).toBe(
      "Pedido #137 · Recoger en el local · $ 34.500"
    );
    expect(textoDeAviso({ ...uno, cantidad: 3 }, formatearPesos)).toBe("3 pedidos de clientes por confirmar");
    expect(textoDeAviso({ ...uno, cantidad: 0, recientes: [] }, formatearPesos)).toBe("");
  });
});

describe("trabajo nuevo para la cocina (plato por plato)", () => {
  const plato = (id: string, listo = false) => ({ id, nombre: "Plato", cantidad: 1, notas: null, adiciones: [], listo });

  it("un pedido que acaba de llegar: todos sus platos son nuevos", () => {
    const r = platosNuevos(new Set(), [pedido({ id: "p1", items: [plato("a"), plato("b")] })]);
    expect(r).toEqual([{ pedidoId: "p1", items: ["a", "b"] }]);
  });

  it("a un pedido que ya estaba le agregan platos: solo cuentan los agregados", () => {
    const vistos = new Set(["a", "b"]);
    const r = platosNuevos(vistos, [pedido({ id: "p1", items: [plato("a"), plato("b", true), plato("c")] }), pedido({ id: "p2", items: [plato("x")] })]);
    expect(r).toEqual([
      { pedidoId: "p1", items: ["c"] },
      { pedidoId: "p2", items: ["x"] },
    ]);
  });

  it("sin nada nuevo no hay aviso: ni al desmarcar un plato ya visto, ni con pedidos que llegan ya listos", () => {
    expect(platosNuevos(new Set(["a"]), [pedido({ id: "p1", items: [plato("a")] })])).toEqual([]); // se desmarcó: ya se había visto
    expect(platosNuevos(new Set(), [pedido({ id: "p9", estado: "listo", items: [plato("z", true)] })])).toEqual([]); // lo marcaron listo en otra pantalla
    expect(platosNuevos(new Set(), [])).toEqual([]);
  });
});
