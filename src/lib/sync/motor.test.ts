import { describe, expect, it } from "vitest";
import { ID, snapshotDeEjemplo } from "@/test/sync-fixture";
import { almacenEnMemoria } from "./almacen";
import { CLAVE_COLA, CLAVE_SNAPSHOT, MAX_FALLOS_SERVIDOR, Motor, type DepsMotor } from "./motor";
import type { DatosOperacion, Operacion, RespuestaOperacion, Snapshot } from "./tipos";

type Guion = (op: Operacion, n: number) => RespuestaOperacion | Error;

/** Una "red" falsa: guarda cada llamada y contesta según el guion (un Error = se cortó la red). */
function escenario(opciones: { enLinea?: boolean; guion?: Guion; snapshot?: () => Snapshot | null | Error } = {}) {
  const almacen = almacenEnMemoria();
  const estado = { enLinea: opciones.enLinea ?? true };
  const llamadas: Operacion[] = [];
  let descargas = 0;
  const deps: DepsMotor = {
    almacen,
    enLinea: () => estado.enLinea,
    transporte: async (op) => {
      llamadas.push(op);
      const r = (opciones.guion ?? (() => ({ ok: true, datos: { ok: 1 } })))(op, llamadas.length);
      if (r instanceof Error) throw r;
      return r;
    },
    descargarSnapshot: async () => {
      descargas++;
      const s = (opciones.snapshot ?? (() => snapshotDeEjemplo()))();
      if (s instanceof Error) throw s;
      return s;
    },
    ahora: () => new Date("2026-10-06T16:00:00.000Z"),
  };
  let contador = 0;
  deps.nuevoId = () => `clave-${++contador}`;
  const nuevo = () => new Motor(deps);
  return { almacen, estado, llamadas, deps, motor: nuevo(), nuevo, descargas: () => descargas };
}

const estadoDe = (clave: string, m: Motor) => m.estado().ops.find((o) => o.clave === clave)?.estado;
const cambio = (pedidoId: string = ID.pedidoViejo, estado: DatosOperacion["cambiar_estado"]["estado"] = "entregado"): DatosOperacion["cambiar_estado"] => ({ pedidoId, estado });
const pedido = (id: string): DatosOperacion["crear_pedido"] => ({
  id,
  tipo: "llevar",
  mesaId: null,
  contactoNombre: "",
  contactoTelefono: "",
  direccion: "",
  notas: "",
  items: [{ productoId: ID.perro, cantidad: 1, adiciones: [], notas: "" }],
});

describe("con señal y la cola vacía", () => {
  it("manda la operación directo y devuelve el resultado real, sin dejar nada en la cola", async () => {
    const e = escenario({ guion: () => ({ ok: true, datos: { numero: 132 } }) });
    const r = await e.motor.ejecutar("cambiar_estado", cambio());
    expect(r).toEqual({ ok: true, pendiente: false, datos: { numero: 132 } });
    expect(e.llamadas).toHaveLength(1);
    expect(e.llamadas[0]).toMatchObject({ clave: "clave-1", tipo: "cambiar_estado", ocurridoEn: "2026-10-06T16:00:00.000Z" });
    expect(e.motor.estado().ops).toEqual([]);
  });

  it("un rechazo del servidor se devuelve como error y NO se encola", async () => {
    const e = escenario({ guion: () => ({ ok: false, error: "Este pedido ya está cobrado." }) });
    const r = await e.motor.ejecutar("cambiar_estado", cambio());
    expect(r).toEqual({ ok: false, error: "Este pedido ya está cobrado." });
    expect(e.motor.estado().ops).toEqual([]);
  });

  it("si se corta la red a mitad, se guarda con la MISMA clave y se sube después sin repetirse", async () => {
    const e = escenario({ guion: (_op, n) => (n === 1 ? new Error("Failed to fetch") : { ok: true, datos: {} }) });
    const r = await e.motor.ejecutar("cambiar_estado", cambio());
    expect(r.ok && r.pendiente).toBe(true);
    await e.motor.vaciar();
    expect(e.llamadas.map((l) => l.clave)).toEqual(["clave-1", "clave-1"]); // el reintento lleva la misma clave
    expect(estadoDe("clave-1", e.motor)).toBeUndefined(); // ya subió y la copia se refrescó: salió de la cola
  });
});

describe("sin señal", () => {
  it("guarda en la cola, asigna número provisional a los pedidos y no toca la red", async () => {
    const e = escenario({ enLinea: false });
    const a = await e.motor.ejecutar("crear_pedido", pedido("p-1"));
    const b = await e.motor.ejecutar("crear_pedido", pedido("p-2"));
    expect(a.ok && a.pendiente && a.op.numeroLocal).toBe(1);
    expect(b.ok && b.pendiente && b.op.numeroLocal).toBe(2);
    expect(e.llamadas).toHaveLength(0);
    expect(e.motor.porSubir()).toBe(2);
  });

  it("la vista muestra lo hecho sin señal encima de la última copia", async () => {
    const e = escenario({ enLinea: false });
    e.almacen.escribir(CLAVE_SNAPSHOT, JSON.stringify(snapshotDeEjemplo()));
    const m = e.nuevo();
    await m.ejecutar("crear_pedido", pedido("p-1"));
    await m.ejecutar("cambiar_estado", cambio(ID.pedidoViejo, "entregado"));
    const v = m.vista()!;
    expect(v.pendientes.map((p) => p.numero)).toEqual([131, -1]);
    expect(v.pendientes[0].estado).toBe("entregado");
    expect(m.vista()).toBe(v); // misma referencia mientras nada cambie (sirve a useSyncExternalStore)
  });

  it("lo guardado sobrevive a cerrar la app: otro motor lee la misma cola y sigue la numeración", async () => {
    const e = escenario({ enLinea: false });
    await e.motor.ejecutar("crear_pedido", pedido("p-1"));
    const reabierto = e.nuevo();
    expect(reabierto.estado().ops.map((o) => o.clave)).toEqual(["clave-1"]);
    const sig = await reabierto.ejecutar("crear_pedido", pedido("p-2"));
    expect(sig.ok && sig.pendiente && sig.op.numeroLocal).toBe(2);
  });

  it("sin copia local la vista es null (la pantalla pide abrir la app con señal una vez)", () => {
    expect(escenario().motor.vista()).toBeNull();
  });

  it("datos dañados en el almacén se ignoran en vez de romper la app", () => {
    const e = escenario();
    e.almacen.escribir(CLAVE_COLA, "{no es json");
    e.almacen.escribir(CLAVE_SNAPSHOT, "tampoco");
    const m = e.nuevo();
    expect(m.estado().ops).toEqual([]);
    expect(m.vista()).toBeNull();
  });
});

describe("al volver la señal", () => {
  it("sube en el mismo orden en que ocurrieron", async () => {
    const e = escenario({ enLinea: false });
    await e.motor.ejecutar("crear_pedido", pedido("p-1"));
    await e.motor.ejecutar("cambiar_estado", cambio("p-1", "listo"));
    await e.motor.ejecutar("cobrar", { pedidoId: "p-1", propina: 0, pagos: [{ medio: "efectivo", monto: 9000, recibido: 10000 }] });
    e.estado.enLinea = true;
    await e.motor.vaciar();
    expect(e.llamadas.map((l) => l.tipo)).toEqual(["crear_pedido", "cambiar_estado", "cobrar"]);
    expect(e.motor.estado().ops).toEqual([]);
    expect(e.descargas()).toBe(1); // al terminar se refresca la copia
  });

  it("si la red se corta a mitad, lo que falta queda pendiente y se continúa después", async () => {
    let cortar = true;
    const e = escenario({ enLinea: false, guion: (_op, n) => (cortar && n === 2 ? new Error("Failed to fetch") : { ok: true, datos: {} }) });
    for (const id of ["a", "b", "c"]) await e.motor.ejecutar("crear_pedido", pedido(id));
    e.estado.enLinea = true;
    await e.motor.vaciar();
    expect(e.motor.porSubir()).toBe(2); // "a" subió; "b" falló por red y "c" ni se intentó
    expect(e.motor.estado().sinRed).toBe(true);
    cortar = false;
    await e.motor.vaciar();
    expect(e.motor.porSubir()).toBe(0);
    expect(e.llamadas.map((l) => (l.datos as { id: string }).id)).toEqual(["a", "b", "b", "c"]);
  });

  it("lo que el servidor rechaza queda como problema con su motivo, y lo demás sigue subiendo", async () => {
    const e = escenario({
      enLinea: false,
      guion: (op) => ((op.datos as { id?: string }).id === "malo" ? { ok: false, error: "Uno de los platos ya no existe." } : { ok: true, datos: {} }),
    });
    await e.motor.ejecutar("crear_pedido", pedido("bueno-1"));
    await e.motor.ejecutar("crear_pedido", pedido("malo"));
    await e.motor.ejecutar("crear_pedido", pedido("bueno-2"));
    e.estado.enLinea = true;
    await e.motor.vaciar();
    expect(e.llamadas).toHaveLength(3);
    const problemas = e.motor.conProblema();
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toMatchObject({ estado: "fallida", error: "Uno de los platos ya no existe." });
    expect(e.motor.estado().ops).toHaveLength(1); // los dos buenos salieron de la cola
  });

  it("una operación nueva no se salta la fila: primero se sube lo pendiente", async () => {
    const e = escenario({ enLinea: false });
    await e.motor.ejecutar("crear_pedido", pedido("p-1"));
    e.estado.enLinea = true;
    const r = await e.motor.ejecutar("cobrar", { pedidoId: "p-1", propina: 0, pagos: [{ medio: "efectivo", monto: 9000 }] });
    expect(r).toMatchObject({ ok: true, pendiente: false });
    expect(e.llamadas.map((l) => l.tipo)).toEqual(["crear_pedido", "cobrar"]);
  });

  it("si al vaciar la fila sigue sin red, la nueva operación se guarda detrás de las otras", async () => {
    const e = escenario({ enLinea: false, guion: () => new Error("Failed to fetch") });
    await e.motor.ejecutar("crear_pedido", pedido("p-1"));
    e.estado.enLinea = true; // el aparato cree que hay red, pero no es cierto
    const r = await e.motor.ejecutar("cambiar_estado", cambio("p-1", "listo"));
    expect(r.ok && r.pendiente).toBe(true);
    expect(e.motor.estado().ops.map((o) => o.tipo)).toEqual(["crear_pedido", "cambiar_estado"]);
  });

  it("dos pedidos de vaciar a la vez comparten una sola subida (nada se envía doble)", async () => {
    const e = escenario({ enLinea: false });
    await e.motor.ejecutar("crear_pedido", pedido("p-1"));
    e.estado.enLinea = true;
    await Promise.all([e.motor.vaciar(), e.motor.vaciar(), e.motor.vaciar()]);
    expect(e.llamadas).toHaveLength(1);
  });

  it("sin sesión se pausa la subida y no se marca nada como rechazado", async () => {
    const e = escenario({ enLinea: false, guion: () => ({ ok: false, error: "x", sinSesion: true }) });
    await e.motor.ejecutar("crear_pedido", pedido("p-1"));
    e.estado.enLinea = true;
    await e.motor.vaciar();
    expect(e.motor.estado().sinSesion).toBe(true);
    expect(e.motor.porSubir()).toBe(1);
    expect(e.motor.conProblema()).toHaveLength(0);
  });
});

describe("con la señal mala (el aparato dice que hay red, pero el servidor no contesta)", () => {
  it("solo el primer toque espera: mientras la red siga caída, lo nuevo se guarda de inmediato", async () => {
    // La 1.ª llamada falla rápido; las siguientes se quedan colgadas para siempre (como una red que no responde).
    const e = escenario();
    let llamadas = 0;
    e.deps.transporte = (op) => {
      e.llamadas.push(op);
      return ++llamadas === 1 ? Promise.reject(new Error("Failed to fetch")) : new Promise(() => {});
    };
    const m = e.nuevo();

    const primera = await m.ejecutar("crear_pedido", pedido("p-1"));
    expect(primera.ok && primera.pendiente).toBe(true);
    expect(m.estado().sinRed).toBe(true);

    // Hay una subida colgada por detrás. Antes, este toque se quedaba esperándola; ahora responde ya.
    const segunda = await m.ejecutar("cambiar_estado", cambio("p-1", "listo"));
    const tercera = await m.ejecutar("cobrar", { pedidoId: "p-1", propina: 0, pagos: [{ medio: "efectivo", monto: 9000 }] });
    expect(segunda.ok && segunda.pendiente).toBe(true);
    expect(tercera.ok && tercera.pendiente).toBe(true);
    expect(m.estado().ops.map((o) => o.tipo)).toEqual(["crear_pedido", "cambiar_estado", "cobrar"]); // en orden
  });

  it("cuando una subida vuelve a salir bien, todo regresa al modo directo", async () => {
    let caida = true;
    const e = escenario({ guion: () => (caida ? new Error("Failed to fetch") : { ok: true, datos: { numero: 7 } }) });
    await e.motor.ejecutar("crear_pedido", pedido("p-1"));
    await e.motor.vaciar();
    expect(e.motor.estado().sinRed).toBe(true);

    caida = false;
    const guardada = await e.motor.ejecutar("cambiar_estado", cambio("p-1", "listo")); // todavía no sabe que volvió
    expect(guardada.ok && guardada.pendiente).toBe(true);
    await e.motor.vaciar(); // la subida de fondo sale bien
    expect(e.motor.estado().sinRed).toBe(false);
    expect(e.motor.estado().ops).toEqual([]);

    const directa = await e.motor.ejecutar("cambiar_estado", cambio("p-1", "entregado"));
    expect(directa).toEqual({ ok: true, pendiente: false, datos: { numero: 7 } });
  });

  it("lo que se guarda mientras hay una subida en marcha sale en esa misma subida, en orden", async () => {
    const e = escenario({ enLinea: false });
    await e.motor.ejecutar("crear_pedido", pedido("a"));
    let soltar: () => void = () => {};
    const lenta = new Promise<void>((r) => (soltar = r));
    e.deps.transporte = async (op) => {
      e.llamadas.push(op);
      if (e.llamadas.length === 1) await lenta; // la primera subida tarda
      return { ok: true, datos: {} };
    };
    const m = e.nuevo();
    e.estado.enLinea = true;
    const subida = m.vaciar();
    await new Promise((r) => setTimeout(r, 5));
    e.estado.enLinea = false;
    await m.ejecutar("crear_pedido", pedido("b")); // llega mientras "a" sube
    e.estado.enLinea = true;
    soltar();
    await subida;
    expect(e.llamadas.map((l) => (l.datos as { id: string }).id)).toEqual(["a", "b"]);
    expect(m.porSubir()).toBe(0);
  });
});

describe("cuando el servidor no puede atender (fallo pasajero, no un rechazo)", () => {
  const pasajero: RespuestaOperacion = { ok: false, error: "No se pudo completar. Revisa la señal e intenta de nuevo.", reintentable: true };

  it("directo: no se muestra como error; se guarda y se reintenta sola", async () => {
    let caida = true;
    const e = escenario({ guion: () => (caida ? pasajero : { ok: true, datos: {} }) });
    const r = await e.motor.ejecutar("cobrar", { pedidoId: ID.pedidoViejo, propina: 0, pagos: [{ medio: "efectivo", monto: 23000 }] });
    expect(r.ok && r.pendiente).toBe(true);
    await e.motor.vaciar();
    expect(e.motor.conProblema()).toHaveLength(0);
    expect(e.motor.porSubir()).toBe(1);
    expect(e.motor.estado().sinRed).toBe(true);

    caida = false;
    await e.motor.vaciar();
    expect(e.motor.estado().ops).toEqual([]);
    expect(new Set(e.llamadas.map((l) => l.clave)).size).toBe(1); // siempre la misma clave: nunca se cobra dos veces
  });

  it("en la cola: la subida se detiene ahí (no marca nada como rechazado ni se salta el orden)", async () => {
    let caida = true;
    const e = escenario({ enLinea: false, guion: () => (caida ? pasajero : { ok: true, datos: {} }) });
    await e.motor.ejecutar("crear_pedido", pedido("a"));
    await e.motor.ejecutar("cobrar", { pedidoId: "a", propina: 0, pagos: [{ medio: "efectivo", monto: 9000 }] });
    e.estado.enLinea = true;
    await e.motor.vaciar();
    expect(e.llamadas).toHaveLength(1); // el cobro ni se intentó: depende del pedido
    expect(e.motor.estado().ops.map((o) => o.estado)).toEqual(["pendiente", "pendiente"]);

    caida = false;
    await e.motor.vaciar();
    expect(e.llamadas.map((l) => l.tipo)).toEqual(["crear_pedido", "crear_pedido", "cobrar"]);
    expect(e.motor.estado().ops).toEqual([]);
  });

  it("si nunca se compone, al rato queda como problema para revisar (no tranca la fila para siempre)", async () => {
    const e = escenario({ enLinea: false, guion: (op) => ((op.datos as { id?: string }).id === "terca" ? pasajero : { ok: true, datos: {} }) });
    await e.motor.ejecutar("crear_pedido", pedido("terca"));
    await e.motor.ejecutar("crear_pedido", pedido("buena"));
    e.estado.enLinea = true;
    for (let i = 0; i < MAX_FALLOS_SERVIDOR; i++) await e.motor.vaciar();
    const problemas = e.motor.conProblema();
    expect(problemas.map((o) => (o.datos as { id: string }).id)).toEqual(["terca"]);
    expect(problemas[0].error).toMatch(/No se pudo completar/);
    expect(e.motor.porSubir()).toBe(0); // la que venía detrás ya subió
  });

  it("un rechazo de verdad sigue siendo definitivo", async () => {
    const e = escenario({ guion: () => ({ ok: false, error: "Este pedido ya está cobrado." }) });
    const r = await e.motor.ejecutar("cambiar_estado", cambio());
    expect(r).toEqual({ ok: false, error: "Este pedido ya está cobrado." });
    expect(e.motor.estado().sinRed).toBe(false);
  });
});

describe("refrescar la copia", () => {
  it("una operación aceptada sigue viéndose hasta que llega la copia que la incluye (sin parpadeos)", async () => {
    const e = escenario({ enLinea: false });
    e.almacen.escribir(CLAVE_SNAPSHOT, JSON.stringify(snapshotDeEjemplo()));
    const m = e.nuevo();
    await m.ejecutar("cambiar_estado", cambio(ID.pedidoViejo, "entregado"));
    e.estado.enLinea = true;

    const vistas: string[] = [];
    m.suscribir(() => vistas.push(m.vista()?.pendientes[0]?.estado ?? "vacío"));
    await m.vaciar();
    expect(vistas.every((v) => v === "entregado" || v === "listo")).toBe(true);
    expect(m.estado().ops).toEqual([]);
  });

  it("si no hay red para refrescar, lo aceptado se conserva", async () => {
    let fallar = true;
    const e = escenario({ enLinea: false, snapshot: () => (fallar ? new Error("sin red") : snapshotDeEjemplo()) });
    await e.motor.ejecutar("cambiar_estado", cambio());
    e.estado.enLinea = true;
    await e.motor.vaciar();
    expect(estadoDe("clave-1", e.motor)).toBe("enviada");
    fallar = false;
    await e.motor.refrescar();
    expect(e.motor.estado().ops).toEqual([]);
  });

  it("lo que se agrega mientras se descarga la copia no se pierde", async () => {
    const e = escenario({ enLinea: false });
    await e.motor.ejecutar("cambiar_estado", cambio());
    e.estado.enLinea = true;
    let liberar: () => void = () => {};
    const pausa = new Promise<void>((r) => (liberar = r));
    e.deps.descargarSnapshot = async () => {
      await pausa;
      return snapshotDeEjemplo();
    };
    const m = e.nuevo(); // misma cola guardada, descarga lenta
    const subida = m.vaciar();
    await new Promise((r) => setTimeout(r, 5));
    e.estado.enLinea = false;
    await m.ejecutar("cambiar_estado", cambio(ID.pedidoViejo, "listo")); // llega durante la descarga
    liberar();
    await subida;
    expect(m.estado().ops.map((o) => o.estado)).toEqual(["pendiente"]);
  });
});

describe("dos pestañas", () => {
  it("lo que una guarda lo ve la otra al recargar, sin pisarse", async () => {
    const e = escenario({ enLinea: false });
    const otra = e.nuevo(); // segunda pestaña, mismo almacén
    await e.motor.ejecutar("crear_pedido", pedido("p-1"));
    expect(otra.estado().ops).toHaveLength(0); // todavía no se enteró
    otra.recargarDesdeAlmacen();
    expect(otra.estado().ops.map((o) => o.clave)).toEqual(["clave-1"]);
    await e.motor.ejecutar("crear_pedido", pedido("p-2"));
    otra.recargarDesdeAlmacen();
    expect(otra.estado().ops).toHaveLength(2);
    expect(otra.estado().ops.map((o) => o.numeroLocal)).toEqual([1, 2]);
  });
});

describe("revisar lo que falló", () => {
  it("reintentar vuelve a ponerla pendiente y la sube; descartar la quita", async () => {
    let aceptar = false;
    const e = escenario({ enLinea: false, guion: () => (aceptar ? { ok: true, datos: {} } : { ok: false, error: "No se pudo." }) });
    await e.motor.ejecutar("crear_pedido", pedido("a"));
    await e.motor.ejecutar("crear_pedido", pedido("b"));
    e.estado.enLinea = true;
    await e.motor.vaciar();
    expect(e.motor.conProblema()).toHaveLength(2);

    aceptar = true;
    e.motor.reintentar("clave-1");
    await e.motor.vaciar();
    expect(e.motor.conProblema().map((o) => o.clave)).toEqual(["clave-2"]);

    e.motor.descartar("clave-2");
    expect(e.motor.estado().ops).toEqual([]);
  });

  it("limpiarTodo borra la cola y la copia (al cerrar sesión)", async () => {
    const e = escenario({ enLinea: false });
    e.almacen.escribir(CLAVE_SNAPSHOT, JSON.stringify(snapshotDeEjemplo()));
    const m = e.nuevo();
    await m.ejecutar("crear_pedido", pedido("a"));
    m.limpiarTodo();
    expect(m.vista()).toBeNull();
    expect(e.almacen.leer(CLAVE_COLA)).toBeNull();
    expect(e.almacen.leer(CLAVE_SNAPSHOT)).toBeNull();
  });
});
