import { describe, expect, it } from "vitest";
import { MotorPulso, type Pulso } from "./pulso";
import { RITMO_AVISO, RITMO_AVISO_EN_CALMA, RITMO_PENDIENTES, RITMO_PLANCHA } from "./ritmo";

/** Un reloj de mentiras: los relojes del pulso solo corren cuando la prueba avanza el tiempo. */
function escenario() {
  let t = 0;
  let siguienteId = 1;
  const relojes = new Map<number, { cuando: number; fn: () => void }>();
  let visible = true;
  let respuesta: Pulso | "sin-sesion" | Error = { huella: "a", porConfirmar: null };
  const consultas: number[] = [];

  const motor = new MotorPulso({
    consultar: async () => {
      consultas.push(t);
      if (respuesta instanceof Error) throw respuesta;
      return respuesta;
    },
    visible: () => visible,
    ahora: () => t,
    programar: (fn, ms) => {
      const id = siguienteId++;
      relojes.set(id, { cuando: t + ms, fn });
      return id;
    },
    cancelar: (id) => void relojes.delete(id),
  });

  const soltar = () => new Promise((r) => setTimeout(r, 0));
  /** Avanza el reloj de a un milisegundo-evento: dispara cada reloj que se venza y deja terminar su consulta. */
  async function avanzar(ms: number) {
    const fin = t + ms;
    for (;;) {
      const proximo = [...relojes.entries()].sort((a, b) => a[1].cuando - b[1].cuando)[0];
      if (!proximo || proximo[1].cuando > fin) break;
      t = proximo[1].cuando;
      relojes.delete(proximo[0]);
      proximo[1].fn();
      await soltar();
    }
    t = fin;
  }

  return {
    motor,
    consultas,
    avanzar,
    soltar,
    ahora: () => t,
    responder: (r: Pulso | "sin-sesion" | Error) => (respuesta = r),
    ocultar: () => (visible = false),
    mostrar: () => (visible = true),
    relojesActivos: () => relojes.size,
  };
}

const pulso = (huella: string): Pulso => ({ huella, porConfirmar: null });

describe("el pulso", () => {
  it("quien pide consultas arranca preguntando de una vez; quien solo escucha, no", async () => {
    const e = escenario();
    e.motor.escuchar({ ritmo: () => null });
    await e.soltar();
    expect(e.consultas).toEqual([]);
    expect(e.relojesActivos()).toBe(0);

    e.motor.escuchar({ ritmo: () => RITMO_PLANCHA });
    await e.soltar();
    expect(e.consultas).toEqual([0]);
  });

  it("si nada cambia se espacia hasta el tope; un cambio lo vuelve rápido", async () => {
    const e = escenario();
    e.motor.escuchar({ ritmo: () => RITMO_PLANCHA });
    await e.soltar();
    await e.avanzar(60_000);
    // 0 → +4 → +6 → +9 → +10 → +10…
    expect(e.consultas.slice(0, 6)).toEqual([0, 4_000, 10_000, 19_000, 29_000, 39_000]);

    e.responder(pulso("b"));
    const antes = e.consultas.length;
    await e.avanzar(10_000); // la próxima trae el cambio
    await e.avanzar(4_000); // y después vuelve al mínimo
    const nuevas = e.consultas.slice(antes);
    expect(nuevas[1] - nuevas[0]).toBe(4_000);
  });

  it("varias partes comparten UNA consulta, al ritmo de la más exigente", async () => {
    const e = escenario();
    const vistos: string[] = [];
    e.motor.escuchar({ ritmo: () => RITMO_AVISO, alPulso: (p) => vistos.push("aviso " + p.huella) });
    e.motor.escuchar({ ritmo: () => RITMO_PLANCHA, alPulso: (p) => vistos.push("plancha " + p.huella) });
    e.motor.escuchar({ ritmo: () => null, alPulso: (p) => vistos.push("copia " + p.huella) });
    await e.soltar();
    expect(e.consultas).toEqual([0]);
    expect(vistos).toEqual(["aviso a", "plancha a", "copia a"]);
    await e.avanzar(4_000);
    expect(e.consultas).toEqual([0, 4_000]); // el mínimo de la plancha, no el del aviso
  });

  it("el ritmo puede depender de lo último que se supo (el aviso en calma pregunta cada minuto)", async () => {
    const e = escenario();
    e.responder({ huella: "a", porConfirmar: { activo: false, atiende: false, cantidad: 0, recientes: [] } });
    e.motor.escuchar({ ritmo: (u) => (u?.porConfirmar && !u.porConfirmar.atiende && u.porConfirmar.cantidad === 0 ? RITMO_AVISO_EN_CALMA : RITMO_AVISO) });
    await e.soltar();
    await e.avanzar(59_999);
    expect(e.consultas).toEqual([0]);
    await e.avanzar(1);
    expect(e.consultas).toEqual([0, 60_000]);
  });

  it("alguien toca la pantalla: la próxima consulta se adelanta al mínimo, sin preguntar de más", async () => {
    const e = escenario();
    e.motor.escuchar({ ritmo: () => RITMO_PENDIENTES });
    await e.soltar();
    await e.avanzar(60_000); // ya va en el tope de 20 s
    const ultima = e.consultas.at(-1)!;
    e.motor.actividad();
    expect(e.consultas.at(-1)).toBe(ultima); // tocar no pregunta en ese instante
    await e.avanzar(RITMO_PENDIENTES.minMs);
    expect(e.consultas.at(-1)).toBe(e.ahora());
  });

  it("con la pestaña oculta no pregunta; al volver, pregunta de una vez", async () => {
    const e = escenario();
    e.motor.escuchar({ ritmo: () => RITMO_AVISO });
    await e.soltar();
    e.ocultar();
    await e.avanzar(5 * 60_000);
    expect(e.consultas).toEqual([0]);
    e.mostrar();
    e.motor.alVolver();
    await e.soltar();
    expect(e.consultas).toEqual([0, 5 * 60_000]);
  });

  it("sin nadie que pida consultas, se detiene", async () => {
    const e = escenario();
    const dejar = e.motor.escuchar({ ritmo: () => RITMO_AVISO });
    await e.soltar();
    dejar();
    await e.avanzar(5 * 60_000);
    expect(e.consultas).toEqual([0]);
    expect(e.relojesActivos()).toBe(0);
  });

  it("sin señal avisa y sigue intentando; sin sesión avisa y no insiste", async () => {
    const e = escenario();
    const fallos: string[] = [];
    e.responder(new Error("sin red"));
    e.motor.escuchar({ ritmo: () => RITMO_PLANCHA, alFallar: (f) => fallos.push(f) });
    await e.soltar();
    await e.avanzar(4_000);
    expect(fallos).toEqual(["sin-senal", "sin-senal"]);

    e.responder("sin-sesion");
    await e.avanzar(10_000);
    expect(fallos.at(-1)).toBe("sin-sesion");
    const n = e.consultas.length;
    await e.avanzar(5 * 60_000);
    e.motor.revisarYa();
    await e.soltar();
    expect(e.consultas.length).toBe(n);
  });

  it("si piden revisar mientras hay una consulta en camino, se pregunta otra vez al terminar", async () => {
    const e = escenario();
    e.motor.escuchar({ ritmo: () => RITMO_PENDIENTES });
    e.motor.revisarYa(); // llega mientras la primera va en camino
    await e.soltar();
    await e.soltar();
    expect(e.consultas).toEqual([0, 0]);
  });

  it("guarda lo último para quien llega después (el aviso al cambiar de pantalla)", async () => {
    const e = escenario();
    e.motor.escuchar({ ritmo: () => RITMO_AVISO });
    await e.soltar();
    expect(e.motor.ultimo()).toEqual(pulso("a"));
  });
});
