import { describe, expect, it } from "vitest";
import {
  abiertoPorHorario,
  HORARIO_INICIAL,
  horarioValido,
  leerHorario,
  minutosDelDia,
  momentoBogota,
  proximaApertura,
  textoFranja,
  textoHora,
  textoProximaApertura,
  type Horario,
} from "./horario";

// Bogotá es UTC-5 todo el año. El lunes 12 de octubre de 2026 a las 3:00 p. m. es 20:00 UTC.
const bogota = (dia: string, hora: string) => new Date(`${dia}T${hora}:00-05:00`);
const LUN = "2026-10-12";
const MAR = "2026-10-13";
const SAB = "2026-10-17";
const DOM = "2026-10-18";

/** Lunes a sábado de 11 a 22; domingo cerrado. */
const DIURNO: Horario = [null, ...Array.from({ length: 6 }, () => ({ abre: "11:00", cierra: "22:00" }))];
/** Local nocturno: jueves a sábado de 6 p. m. a 2 a. m. (posiciones 4, 5 y 6). */
const NOCTURNO: Horario = [null, null, null, null, { abre: "18:00", cierra: "02:00" }, { abre: "18:00", cierra: "02:00" }, { abre: "18:00", cierra: "02:00" }];

describe("leer y validar el horario", () => {
  it("minutos del día y horas mal escritas", () => {
    expect(minutosDelDia("00:00")).toBe(0);
    expect(minutosDelDia("18:30")).toBe(1110);
    expect(minutosDelDia("23:59")).toBe(1439);
    for (const mala of ["24:00", "7:30", "18:60", "18.30", "", null, undefined]) expect(minutosDelDia(mala)).toBeNull();
  });

  it("válido: siete días, cada uno cerrado o con dos horas distintas", () => {
    expect(horarioValido(DIURNO)).toBe(true);
    expect(horarioValido(NOCTURNO)).toBe(true);
    expect(horarioValido(HORARIO_INICIAL)).toBe(true);
    expect(horarioValido(DIURNO.slice(0, 6))).toBe(false);
    expect(horarioValido([...DIURNO.slice(0, 6), { abre: "11:00", cierra: "11:00" }])).toBe(false);
    expect(horarioValido([...DIURNO.slice(0, 6), { abre: "11:00" }])).toBe(false);
    expect(horarioValido([...DIURNO.slice(0, 6), "11:00-22:00"])).toBe(false);
    expect(horarioValido(null)).toBe(false);
  });

  it("lo que llega de la base: un horario bueno o nada (nunca uno a medias)", () => {
    expect(leerHorario(DIURNO)).toBe(DIURNO);
    expect(leerHorario(null)).toBeNull();
    expect(leerHorario(undefined)).toBeNull();
    expect(leerHorario({ lunes: "11-22" })).toBeNull();
  });

  it("el día y la hora salen de Bogotá, no de la zona de la máquina", () => {
    expect(momentoBogota(new Date("2026-10-12T20:00:00Z"))).toEqual({ dia: 1, minutos: 15 * 60 }); // lunes 3:00 p. m.
    expect(momentoBogota(new Date("2026-10-13T03:30:00Z"))).toEqual({ dia: 1, minutos: 22 * 60 + 30 }); // lunes 10:30 p. m.
    expect(momentoBogota(new Date("2026-10-18T05:00:00Z"))).toEqual({ dia: 0, minutos: 0 }); // domingo, medianoche
  });
});

describe("¿a esta hora se atiende?", () => {
  it("sin horario siempre se atiende (manda solo el interruptor)", () => {
    expect(abiertoPorHorario(null, bogota(DOM, "03:00"))).toBe(true);
    expect(abiertoPorHorario(undefined, bogota(DOM, "03:00"))).toBe(true);
  });

  it("horario de día: abre a la hora en punto y cierra justo a la hora de cerrar", () => {
    expect(abiertoPorHorario(DIURNO, bogota(LUN, "10:59"))).toBe(false);
    expect(abiertoPorHorario(DIURNO, bogota(LUN, "11:00"))).toBe(true);
    expect(abiertoPorHorario(DIURNO, bogota(LUN, "21:59"))).toBe(true);
    expect(abiertoPorHorario(DIURNO, bogota(LUN, "22:00"))).toBe(false);
    expect(abiertoPorHorario(DIURNO, bogota(DOM, "15:00"))).toBe(false); // domingo no se atiende
  });

  it("horario nocturno: la madrugada pertenece a la franja del día anterior", () => {
    expect(abiertoPorHorario(NOCTURNO, bogota(SAB, "17:59"))).toBe(false);
    expect(abiertoPorHorario(NOCTURNO, bogota(SAB, "18:00"))).toBe(true);
    expect(abiertoPorHorario(NOCTURNO, bogota(SAB, "23:59"))).toBe(true);
    expect(abiertoPorHorario(NOCTURNO, bogota(DOM, "01:44"))).toBe(true); // domingo 1:44 a. m.: sigue la del sábado
    expect(abiertoPorHorario(NOCTURNO, bogota(DOM, "02:00"))).toBe(false);
    expect(abiertoPorHorario(NOCTURNO, bogota(DOM, "20:00"))).toBe(false); // el domingo no abre
    expect(abiertoPorHorario(NOCTURNO, bogota("2026-10-15", "01:00"))).toBe(false); // jueves 1 a. m.: el miércoles no abrió
  });
});

describe("cuándo vuelve a abrir", () => {
  it("más tarde hoy, mañana o el próximo día que atienda", () => {
    expect(textoProximaApertura(DIURNO, bogota(LUN, "08:00"))).toBe("Abre hoy a las 11:00 a. m.");
    expect(textoProximaApertura(DIURNO, bogota(LUN, "22:30"))).toBe("Abre mañana a las 11:00 a. m.");
    expect(textoProximaApertura(DIURNO, bogota(SAB, "23:00"))).toBe("Abre el lunes a las 11:00 a. m."); // el domingo no atiende
    expect(textoProximaApertura(NOCTURNO, bogota(DOM, "03:00"))).toBe("Abre el jueves a las 6:00 p. m.");
    expect(textoProximaApertura(NOCTURNO, bogota(MAR, "12:00"))).toBe("Abre el jueves a las 6:00 p. m.");
    expect(textoProximaApertura(NOCTURNO, bogota("2026-10-15", "12:00"))).toBe("Abre hoy a las 6:00 p. m.");
  });

  it("si solo atiende un día y ya pasó, es el de la semana siguiente", () => {
    const soloLunes: Horario = [null, { abre: "08:00", cierra: "12:00" }, null, null, null, null, null];
    expect(proximaApertura(soloLunes, bogota(LUN, "13:00"))).toEqual({ enDias: 7, dia: 1, hora: "08:00" });
    expect(textoProximaApertura(soloLunes, bogota(LUN, "13:00"))).toBe("Abre el lunes a las 8:00 a. m.");
  });

  it("sin horario o sin ningún día de atención no dice nada", () => {
    expect(textoProximaApertura(null, bogota(LUN, "08:00"))).toBe("");
    expect(textoProximaApertura([null, null, null, null, null, null, null], bogota(LUN, "08:00"))).toBe("");
  });
});

describe("cómo se lee", () => {
  it("las horas, como en un reloj de 12", () => {
    expect(textoHora("00:00")).toBe("12:00 a. m.");
    expect(textoHora("11:00")).toBe("11:00 a. m.");
    expect(textoHora("12:00")).toBe("12:00 p. m.");
    expect(textoHora("18:30")).toBe("6:30 p. m.");
    expect(textoHora("no es hora")).toBe("no es hora");
  });

  it("la franja de un día", () => {
    expect(textoFranja({ abre: "18:00", cierra: "02:00" })).toBe("6:00 p. m. – 2:00 a. m.");
    expect(textoFranja(null)).toBe("Cerrado");
  });
});
