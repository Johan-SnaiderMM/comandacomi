import { describe, expect, it } from "vitest";
import { AREAS, PANTALLAS, pestanasDe, puedeVer, quienEs, TEXTO_AREA, type Pantalla, type Quien } from "./areas";

const yo = (rol: "dueno" | "ayudante", areas?: string[]) => quienEs({ perfil: { rol, areas } });
const DUENO = yo("dueno", []);
const MESERO = yo("ayudante", ["pedidos"]);
const COCINA = yo("ayudante", ["plancha"]);
const CAJA = yo("ayudante", ["caja", "fiado"]);
const MESERO_Y_CAJA = yo("ayudante", ["fiado", "pedidos", "caja"]);
const SIN_ROLES = yo("ayudante", []);

/** Las pantallas que abre alguien, en el orden de PANTALLAS. */
const pantallas = (q: Quien) => (Object.keys(PANTALLAS) as Pantalla[]).filter((p) => puedeVer(q, p));

describe("quién es", () => {
  it("el dueño lo abre todo, tenga o no roles", () => {
    expect(DUENO).toEqual({ areas: [...AREAS], esDueno: true });
  });

  it("alguien del equipo abre lo de sus roles, en el orden de siempre y sin áreas inventadas", () => {
    expect(MESERO_Y_CAJA).toEqual({ areas: ["pedidos", "caja", "fiado"], esDueno: false });
    expect(yo("ayudante", ["menu", "plancha"]).areas).toEqual(["plancha"]);
    expect(SIN_ROLES.areas).toEqual([]);
  });

  it("si la base todavía no manda áreas (sin la migración 19), todo queda como antes: abierto", () => {
    expect(yo("ayudante")).toEqual({ areas: [...AREAS], esDueno: false });
  });

  it("sin perfil no abre nada", () => {
    expect(quienEs({ perfil: null })).toEqual({ areas: [], esDueno: false });
  });

  it("cada área tiene cómo explicársela al dueño", () => {
    for (const a of AREAS) expect(TEXTO_AREA[a].titulo.length).toBeGreaterThan(0);
  });
});

describe("qué pantallas ve cada quien", () => {
  it("el dueño, todas (también mesas y equipo)", () => {
    expect(pantallas(DUENO)).toEqual(Object.keys(PANTALLAS));
  });

  it("el mesero: pendientes, tomar, en línea, el cartel y el menú (para marcar agotados); nada de plata ni plancha", () => {
    expect(pantallas(MESERO)).toEqual(["pendientes", "tomar", "enLinea", "qr", "menu"]);
  });

  it("la cocina: la plancha y el menú", () => {
    expect(pantallas(COCINA)).toEqual(["plancha", "menu"]);
  });

  it("la caja: pendientes (para cobrar), cobrar y fiado", () => {
    expect(pantallas(CAJA)).toEqual(["pendientes", "cobrar", "fiado"]);
  });

  it("con dos roles, la suma", () => {
    expect(pantallas(MESERO_Y_CAJA)).toEqual(["pendientes", "tomar", "cobrar", "enLinea", "qr", "fiado", "menu"]);
  });

  it("sin roles, ninguna; y lo que es del dueño no se abre con ningún rol", () => {
    expect(pantallas(SIN_ROLES)).toEqual([]);
    const todoMenosDueno = yo("ayudante", [...AREAS]);
    expect(puedeVer(todoMenosDueno, "mesas")).toBe(false);
    expect(puedeVer(todoMenosDueno, "equipo")).toBe(false);
  });
});

describe("la barra de abajo", () => {
  it("al dueño y al mesero les queda como siempre: Tomar en el centro", () => {
    expect(pestanasDe(DUENO, false)).toEqual(["inicio", "pendientes", "tomar", "enLinea", "mas"]);
    expect(pestanasDe(MESERO, false)).toEqual(["inicio", "pendientes", "tomar", "enLinea", "mas"]);
    expect(pestanasDe(MESERO_Y_CAJA, false)).toEqual(["inicio", "pendientes", "tomar", "enLinea", "mas"]);
  });

  it("sin conexión, la cuarta es Fiado (si la abre)", () => {
    expect(pestanasDe(DUENO, true)).toEqual(["inicio", "pendientes", "tomar", "fiado", "mas"]);
    expect(pestanasDe(MESERO, true)).toEqual(["inicio", "pendientes", "tomar", "mas"]);
  });

  it("la cocina tiene su plancha a un toque; la caja, pendientes y fiado", () => {
    expect(pestanasDe(COCINA, false)).toEqual(["inicio", "plancha", "mas"]);
    expect(pestanasDe(CAJA, false)).toEqual(["inicio", "pendientes", "fiado", "mas"]);
  });

  it("nunca más de cinco, e Inicio y Más siempre", () => {
    for (const q of [DUENO, MESERO, COCINA, CAJA, MESERO_Y_CAJA, SIN_ROLES, yo("ayudante", [...AREAS])]) {
      for (const sc of [false, true]) {
        const p = pestanasDe(q, sc);
        expect(p.length).toBeLessThanOrEqual(5);
        expect(p[0]).toBe("inicio");
        expect(p.at(-1)).toBe("mas");
      }
    }
    expect(pestanasDe(SIN_ROLES, false)).toEqual(["inicio", "mas"]);
  });
});
