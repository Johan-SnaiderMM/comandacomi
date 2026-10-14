import { describe, expect, it } from "vitest";
import type { Inicio } from "@/lib/datos/tipos";
import { cifrasDelDia, resumenDeInicio, veredictoDelDia } from "./inicio";

describe("¿voy ganando hoy?", () => {
  it("responde según ventas y gastos", () => {
    expect(veredictoDelDia(0, 0).titulo).toBe("Día sin movimiento");
    expect(veredictoDelDia(100000, 60000)).toMatchObject({ titulo: "Hoy vas ganando", tono: "bien" });
    expect(veredictoDelDia(60000, 60000).titulo).toBe("Hoy vas parejo");
    expect(veredictoDelDia(20000, 60000)).toMatchObject({ titulo: "Aún no cubres los gastos", tono: "alerta" });
  });

  it("un día que el dueño ya cerró no es un «día sin movimiento»", () => {
    expect(veredictoDelDia(0, 0, true)).toMatchObject({ titulo: "Día cerrado", tono: "neutro" });
    // Si después de cerrar se vendió algo, vuelve la respuesta de siempre (ya es la jornada siguiente).
    expect(veredictoDelDia(15000, 0, true).titulo).toBe("Hoy vas ganando");
  });
});

const base = { fecha: "2026-10-14", jornada_adelantada: false, ventas_hoy: 80000, gastos_hoy: 30000, ganancia_hoy: 50000, pedidos_hoy: 6, ventas_ayer: 376500, gastos_ayer: 184000, ganancia_ayer: 192500 };

describe("qué día muestra Inicio", () => {
  it("normalmente, la jornada en curso", () => {
    expect(resumenDeInicio(base)).toEqual({ cerrado: false, fecha: "2026-10-14", ventas: 80000, gastos: 30000, ganancia: 50000, pedidos: 6 });
    // Un día sin movimiento que nadie ha cerrado se muestra tal cual: en ceros.
    expect(resumenDeInicio({ ...base, ventas_hoy: 0, gastos_hoy: 0, ganancia_hoy: 0, pedidos_hoy: 0 })).toMatchObject({ cerrado: false, fecha: "2026-10-14", ventas: 0 });
  });

  it("recién cerrado antes de la hora de corte: el día que se acaba de cerrar, no ceros", () => {
    const cerrado = { ...base, jornada_adelantada: true, ventas_hoy: 0, gastos_hoy: 0, ganancia_hoy: 0, pedidos_hoy: 0 };
    expect(resumenDeInicio(cerrado)).toEqual({ cerrado: true, fecha: "2026-10-13", ventas: 376500, gastos: 184000, ganancia: 192500, pedidos: null });
  });

  it("si después de cerrar se registra algo, vuelve a mostrar la jornada nueva", () => {
    expect(resumenDeInicio({ ...base, jornada_adelantada: true })).toMatchObject({ cerrado: false, fecha: "2026-10-14", ventas: 80000 });
    expect(resumenDeInicio({ ...base, jornada_adelantada: true, ventas_hoy: 0, ganancia_hoy: -7000, gastos_hoy: 7000 })).toMatchObject({ cerrado: false, gastos: 7000 });
  });

  it("el día cerrado puede ser el último del mes", () => {
    const primero = { ...base, fecha: "2026-11-01", jornada_adelantada: true, ventas_hoy: 0, gastos_hoy: 0, ganancia_hoy: 0, pedidos_hoy: 0 };
    expect(resumenDeInicio(primero).fecha).toBe("2026-10-31");
  });
});

describe("las cuentas del día solo para quien las ve", () => {
  const inicio: Inicio = { ...base, por_cobrar: 120000, clientes_con_deuda: 3, pedidos_pendientes: 2, pedidos_sin_cobrar: 1 };

  it("con las cifras, el tiquete se arma", () => {
    expect(cifrasDelDia(inicio)).toMatchObject({ ventas_hoy: 80000, ganancia_ayer: 192500, pedidos_hoy: 6 });
  });

  it("a quien no ve las cuentas la base le manda las cifras en null: no hay tiquete (ni ceros que engañen)", () => {
    const sinPlata: Inicio = { ...inicio, ventas_hoy: null, gastos_hoy: null, ganancia_hoy: null, ventas_ayer: null, gastos_ayer: null, ganancia_ayer: null };
    expect(cifrasDelDia(sinPlata)).toBeNull();
    // Basta con que falte una.
    expect(cifrasDelDia({ ...inicio, gastos_ayer: null })).toBeNull();
  });
});
