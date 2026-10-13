import { describe, expect, it } from "vitest";
import { diasEntre, fechaCorta, fechaLarga, fechaRelativa, hoyBogota, hoyDeTrabajo, minutosDesde, textoDias, textoEspera, textoHoraCorte } from "./fechas";

describe("el día de trabajo no cambia a medianoche sino a la hora de corte", () => {
  // Bogotá es UTC-5: la 1:44 a. m. del martes 13 de octubre es 06:44 UTC.
  it("a la 1:44 a. m. del martes todavía es lunes; a las 4:00 ya es martes", () => {
    expect(hoyDeTrabajo(new Date("2026-10-13T06:44:00Z"))).toBe("2026-10-12");
    expect(hoyDeTrabajo(new Date("2026-10-13T08:59:59Z"))).toBe("2026-10-12");
    expect(hoyDeTrabajo(new Date("2026-10-13T09:00:00Z"))).toBe("2026-10-13");
    expect(hoyBogota(new Date("2026-10-13T06:44:00Z"))).toBe("2026-10-13"); // la fecha del calendario sí cambió
  });

  it("respeta la hora de corte del restaurante (0 = medianoche, como antes)", () => {
    expect(hoyDeTrabajo(new Date("2026-10-13T06:44:00Z"), 0)).toBe("2026-10-13");
    expect(hoyDeTrabajo(new Date("2026-10-13T10:30:00Z"), 6)).toBe("2026-10-12");
    expect(hoyDeTrabajo(new Date("2026-10-13T06:44:00Z"), undefined)).toBe("2026-10-12"); // sin dato: 4 a. m.
  });

  it("dice la hora de corte como se lee en un reloj", () => {
    expect(textoHoraCorte()).toBe("4:00 a. m.");
    expect(textoHoraCorte(0)).toBe("12:00 a. m.");
    expect(textoHoraCorte(12)).toBe("12:00 p. m.");
  });
});

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
