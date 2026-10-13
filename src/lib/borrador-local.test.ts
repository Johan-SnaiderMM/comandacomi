import { describe, expect, it } from "vitest";
import { crearAlmacenBorrador } from "./borrador-local";
import { DESTINO_INICIAL, leerDestino, type Destino } from "./pedido-borrador";
import { almacenEnMemoria } from "./sync/almacen";

const CLAVE = "borrador:pedido:nuevo";
const MEDIA_HORA = 30 * 60_000;
const burger = { id: "p1", nombre: "Hamburguesa doble", precio: 19000 };
const mesa2: Destino = { ...DESTINO_INICIAL, mesaId: "mesa-2" };

/** Un celular de mentiras: su almacenamiento y su reloj. `abrir()` es abrir la pantalla (o recargar la app). */
function celular() {
  const disco = almacenEnMemoria();
  const reloj = { ahora: 1_000_000 };
  const abrir = () => crearAlmacenBorrador<Destino>({ clave: CLAVE, extraInicial: DESTINO_INICIAL, vigenciaMs: MEDIA_HORA, leerExtra: leerDestino, almacen: disco, ahora: () => reloj.ahora });
  return { disco, reloj, abrir };
}

describe("el pedido a medio tomar se guarda en el celular", () => {
  it("empieza vacío y devuelve el mismo estado mientras nada cambie", () => {
    const a = celular().abrir();
    expect(a.leer()).toBe(a.vacio);
    expect(a.leer().borrador.lineas).toEqual([]);
    a.despachar({ tipo: "agregar", producto: burger });
    const uno = a.leer();
    expect(a.leer()).toBe(uno);
    expect(uno.borrador.lineas[0]).toMatchObject({ productoId: "p1", cantidad: 1 });
  });

  it("sobrevive a salir de la pantalla y a recargar la app: platos y para quién es", () => {
    const c = celular();
    const a = c.abrir();
    a.ponerExtra(mesa2);
    a.despachar({ tipo: "agregar", producto: burger });
    a.despachar({ tipo: "agregar", producto: burger, notas: "Sin cebolla" });

    const despues = c.abrir(); // otra pestaña / app reabierta: lee lo guardado
    expect(despues.leer().borrador.lineas.map((l) => l.cantidad)).toEqual([1, 1]);
    expect(despues.leer().extra).toEqual(mesa2);
  });

  it("avisa a quien lo esté mirando en cada cambio", () => {
    const a = celular().abrir();
    let avisos = 0;
    const dejar = a.suscribir(() => avisos++);
    a.despachar({ tipo: "agregar", producto: burger });
    a.ponerExtra(mesa2);
    a.despachar({ tipo: "cambiar", clave: "no-existe", delta: 1 }); // no cambia nada: no avisa
    expect(avisos).toBe(2);
    dejar();
  });

  it("al enviar el pedido se olvida todo, también en el celular", () => {
    const c = celular();
    const a = c.abrir();
    a.ponerExtra(mesa2);
    a.despachar({ tipo: "agregar", producto: burger });
    a.olvidar();
    expect(a.leer()).toBe(a.vacio);
    expect(c.disco.leer(CLAVE)).toBeNull();
    expect(c.abrir().leer().borrador.lineas).toEqual([]);
  });

  it("se vence: pasada la vigencia desde el último toque, un pedido viejo no aparece solo", () => {
    const c = celular();
    const a = c.abrir();
    a.despachar({ tipo: "agregar", producto: burger });

    c.reloj.ahora += MEDIA_HORA - 1;
    expect(c.abrir().leer().borrador.lineas).toHaveLength(1); // todavía vale
    a.despachar({ tipo: "agregar", producto: burger }); // tocarlo renueva el plazo
    c.reloj.ahora += MEDIA_HORA - 1;
    expect(a.leer().borrador.lineas[0].cantidad).toBe(2);

    c.reloj.ahora += 2;
    expect(a.leer()).toBe(a.vacio); // con la app abierta en otra pantalla
    expect(c.abrir().leer().borrador.lineas).toEqual([]); // y al reabrirla
    expect(c.disco.leer(CLAVE)).toBeNull();
  });

  it("un destino elegido SIN platos no se arrastra al pedido siguiente", () => {
    const c = celular();
    const a = c.abrir();
    const dejar = a.suscribir(() => {});
    a.ponerExtra(mesa2); // eligió la mesa y salió de la pantalla sin agregar nada
    expect(a.leer().extra).toEqual(mesa2);
    dejar();
    expect(a.leer()).toBe(a.vacio);
    expect(c.abrir().leer().extra).toBe(DESTINO_INICIAL);
  });

  it("con platos, el destino sí se conserva al salir de la pantalla", () => {
    const a = celular().abrir();
    const dejar = a.suscribir(() => {});
    a.ponerExtra(mesa2);
    a.despachar({ tipo: "agregar", producto: burger });
    dejar();
    expect(a.leer().extra).toEqual(mesa2);
  });

  it("vaciar el pedido deja el destino mientras se siga en la pantalla", () => {
    const a = celular().abrir();
    const dejar = a.suscribir(() => {});
    a.ponerExtra(mesa2);
    a.despachar({ tipo: "agregar", producto: burger });
    a.despachar({ tipo: "vaciar" });
    expect(a.leer().borrador.lineas).toEqual([]);
    expect(a.leer().extra).toEqual(mesa2);
    dejar();
  });

  it("lo guardado dañado o de otra forma se ignora en vez de romper la pantalla", () => {
    const linea = { clave: "p1||", productoId: "p1", nombre: "Hamburguesa", precio: 19000, cantidad: 1, adiciones: [], notas: "" };
    const casos = [
      "{no es json",
      JSON.stringify({ v: 2, at: 1_000_000, lineas: [linea], extra: mesa2 }), // otra versión
      JSON.stringify({ v: 1, at: 1_000_000, lineas: [{ ...linea, precio: "gratis" }] }),
      JSON.stringify({ v: 1, at: 1_000_000, lineas: [{ ...linea, cantidad: 500 }] }),
      JSON.stringify({ v: 1, at: 1_000_000, lineas: [{ ...linea, adiciones: [{ id: "m1" }] }] }),
      JSON.stringify({ v: 1, at: 1_000_000, lineas: "muchas" }),
      JSON.stringify({ v: 1, at: 1_000_000, lineas: [] }),
    ];
    for (const crudo of casos) {
      const c = celular();
      c.disco.escribir(CLAVE, crudo);
      expect(c.abrir().leer().borrador.lineas, crudo).toEqual([]);
      expect(c.disco.leer(CLAVE), crudo).toBeNull(); // y se limpia
    }
  });

  it("un destino guardado que no sirve se cambia por el inicial, sin perder los platos", () => {
    const c = celular();
    const linea = { clave: "p1||", productoId: "p1", nombre: "Hamburguesa", precio: 19000, cantidad: 2, adiciones: [], notas: "" };
    c.disco.escribir(CLAVE, JSON.stringify({ v: 1, at: c.reloj.ahora, lineas: [linea], extra: { tipo: "avión" } }));
    const a = c.abrir();
    expect(a.leer().borrador.lineas[0].cantidad).toBe(2);
    expect(a.leer().extra).toBe(DESTINO_INICIAL);
  });

  it("si el celular no deja guardar, el pedido sigue en pantalla (solo no sobrevive a recargar)", () => {
    const a = crearAlmacenBorrador<null>({
      clave: CLAVE,
      extraInicial: null,
      vigenciaMs: MEDIA_HORA,
      almacen: { leer: () => null, escribir: () => {}, borrar: () => {} },
    });
    a.despachar({ tipo: "agregar", producto: burger });
    expect(a.leer().borrador.lineas).toHaveLength(1);
  });
});
