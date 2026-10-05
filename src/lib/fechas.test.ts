import { describe, expect, it } from "vitest";
import { diasEntre, fechaCorta, fechaLarga, fechaRelativa, hoyBogota, minutosDesde, textoDias, textoEspera } from "./fechas";

describe("fechas en hora de Colombia", () => {
  it("hoyBogota usa la zona horaria de Bogotá, no la del servidor", () => {
    // 2026-10-06 03:30 UTC es todavía 5 de octubre (22:30) en Bogotá (UTC-5)
    expect(hoyBogota(new Date("2026-10-06T03:30:00Z"))).toBe("2026-10-05");
    expect(hoyBogota(new Date("2026-10-06T05:00:00Z"))).toBe("2026-10-06");
  });

  it("formatea en español", () => {
    expect(fechaLarga("2026-10-05")).toBe("Lunes 5 de octubre");
    expect(fechaCorta("2026-10-05")).toMatch(/^lun 5 oct/);
  });

  it("fechaRelativa: Hoy, Ayer o la fecha corta", () => {
    expect(fechaRelativa("2026-10-05", "2026-10-05")).toBe("Hoy");
    expect(fechaRelativa("2026-10-04", "2026-10-05")).toBe("Ayer");
    expect(fechaRelativa("2026-10-01", "2026-10-05")).toMatch(/^jue 1 oct/);
  });

  it("diasEntre cruza fin de mes y año", () => {
    expect(diasEntre("2026-09-29", "2026-10-05")).toBe(6);
    expect(diasEntre("2026-12-31", "2027-01-01")).toBe(1);
    expect(diasEntre("2026-10-05", "2026-10-05")).toBe(0);
  });

  it("espera: minutos desde un instante, nunca negativos", () => {
    const ahora = new Date("2026-10-05T15:00:00Z").getTime();
    expect(minutosDesde("2026-10-05T14:56:00Z", ahora)).toBe(4);
    expect(minutosDesde("2026-10-05T15:30:00Z", ahora)).toBe(0);
    expect(textoEspera(4)).toBe("4 min");
    expect(textoEspera(65)).toBe("1 h 05 min");
    expect(textoEspera(120)).toBe("2 h 00 min");
  });

  it("textoDias", () => {
    expect(textoDias(0)).toBe("hoy");
    expect(textoDias(1)).toBe("ayer");
    expect(textoDias(6)).toBe("hace 6 días");
  });
});
