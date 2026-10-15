import { describe, expect, it } from "vitest";
import { pasosDe } from "./primeros-pasos";

const vacio = { platos: 0, mesas: 0, personas: 0, invitaciones: 0, pedidos: 0, en_linea: false };

describe("primeros pasos de un local nuevo", () => {
  it("un local recién creado: nada hecho, en el orden en que conviene hacerlo", () => {
    const p = pasosDe(vacio);
    expect(p.map((x) => x.titulo)).toEqual(["Arma tu menú", "Agrega tus mesas", "Invita a tu equipo", "Toma tu primer pedido", "Recibe pedidos por internet"]);
    expect(p.every((x) => !x.hecho)).toBe(true);
    expect(p.map((x) => x.href)).toEqual(["/menu", "/mesas", "/equipo", "/pedido/nuevo", "/pedidos-en-linea"]);
  });

  it("cada paso se marca con lo que ya hay, y lo dice", () => {
    const p = pasosDe({ platos: 12, mesas: 1, personas: 2, invitaciones: 0, pedidos: 1, en_linea: true });
    expect(p.every((x) => x.hecho)).toBe(true);
    expect(p.map((x) => x.detalle)).toEqual(["12 platos", "1 mesa", "2 personas en el equipo", "Listo", "Encendido: comparte tu enlace o el QR"]);
  });

  it("una invitación sin usar todavía no cuenta como equipo, pero se nota", () => {
    const equipo = pasosDe({ ...vacio, invitaciones: 1 }).find((x) => x.clave === "equipo")!;
    expect(equipo).toMatchObject({ hecho: false, detalle: "Invitación lista: falta que entren" });
  });
});
