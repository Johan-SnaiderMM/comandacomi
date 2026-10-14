import { describe, expect, it } from "vitest";
import { AREAS, inicioDe, leerVerComo, PANTALLAS, pestanasDe, puedeVer, quienEs, TEXTO_AREA, type Pantalla, type Quien } from "./areas";

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

describe("«Ver como» (el dueño mira la app como un rol)", () => {
  const cookie = (v: unknown) => JSON.stringify(v);

  it("el dueño pasa a ver solo lo de ese rol, y deja de ser «dueño» en pantalla", () => {
    const visto = quienEs({ perfil: { rol: "dueno", areas: [] } }, leerVerComo(cookie({ nombre: "Mesero", areas: ["pedidos"] })));
    expect(visto).toEqual({ areas: ["pedidos"], esDueno: false, viendoComo: "Mesero" });
    expect(puedeVer(visto, "equipo")).toBe(false);
    expect(pestanasDe(visto, false)).toEqual(["inicio", "pendientes", "tomar", "enLinea", "mas"]);
  });

  it("a alguien del equipo no le cambia nada (aunque traiga la cookie)", () => {
    const verComo = leerVerComo(cookie({ nombre: "Caja", areas: ["caja"] }));
    expect(quienEs({ perfil: { rol: "ayudante", areas: ["plancha"] } }, verComo)).toEqual({ areas: ["plancha"], esDueno: false });
  });

  it("una cookie dañada o inventada no se tiene en cuenta; áreas que no existen se ignoran", () => {
    expect(leerVerComo(undefined)).toBeNull();
    expect(leerVerComo("{no es json")).toBeNull();
    expect(leerVerComo(cookie({ nombre: "", areas: [] }))).toBeNull();
    expect(leerVerComo(cookie({ nombre: "X", areas: "caja" }))).toBeNull();
    expect(leerVerComo(cookie({ nombre: "Jefe", areas: ["caja", "menu", "todo"] }))).toEqual({ nombre: "Jefe", areas: ["caja"] });
  });
});

describe("a dónde llega cada quien", () => {
  it("la cocina, directo a la plancha; los demás, a Inicio", () => {
    expect(inicioDe(COCINA)).toBe("/plancha");
    expect(inicioDe(MESERO)).toBe("/inicio");
    expect(inicioDe(CAJA)).toBe("/inicio");
    expect(inicioDe(DUENO)).toBe("/inicio");
    expect(inicioDe(SIN_ROLES)).toBe("/inicio");
    expect(inicioDe(yo("ayudante", ["plancha", "pedidos"]))).toBe("/inicio");
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
