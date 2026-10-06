import { describe, expect, it } from "vitest";
import {
  aPesos, atajosEfectivo, calcularCierre, calcularEfectivo, diferenciaCaja, formatearMiles, formatearPesos,
  leerPesos, planDePagos, propinaSugerida, saldoFiado, subtotalLinea, totalPedido, validarAbono, validarCobro,
} from "./dinero";

describe("formato y lectura de pesos", () => {
  it("formatea con puntos de miles y símbolo", () => {
    expect(formatearPesos(0)).toBe("$ 0");
    expect(formatearPesos(950)).toBe("$ 950");
    expect(formatearPesos(12500)).toBe("$ 12.500");
    expect(formatearPesos(1284500)).toBe("$ 1.284.500");
    expect(formatearPesos(-62300)).toBe("− $ 62.300");
    expect(formatearMiles(1284500)).toBe("1.284.500");
  });

  it("nunca produce decimales: redondea a pesos enteros", () => {
    expect(aPesos(1234.6)).toBe(1235);
    expect(aPesos(NaN)).toBe(0);
    expect(aPesos(Infinity)).toBe(0);
    expect(formatearPesos(999.5)).toBe("$ 1.000");
  });

  it("lee lo que escribe el usuario, ignorando todo menos los dígitos", () => {
    expect(leerPesos("12.500")).toBe(12500);
    expect(leerPesos("$ 12 500")).toBe(12500);
    expect(leerPesos("12,500")).toBe(12500);
    expect(leerPesos("")).toBe(0);
    expect(leerPesos("abc")).toBe(0);
    expect(leerPesos("999999999999")).toBe(99999999); // tope de 8 dígitos
  });
});

describe("pedido", () => {
  it("subtotal = (precio + adiciones) × cantidad", () => {
    expect(subtotalLinea({ precio: 19000, cantidad: 1 })).toBe(19000);
    expect(subtotalLinea({ precio: 19000, cantidad: 2, adiciones: [2000, 3000] })).toBe(48000);
  });

  it("el total suma las líneas y un carrito vacío vale 0", () => {
    expect(totalPedido([])).toBe(0);
    expect(totalPedido([{ precio: 14000, cantidad: 2 }, { precio: 3500, cantidad: 1, adiciones: [500] }])).toBe(32000);
  });
});

describe("propina y efectivo", () => {
  it("la propina sugerida es 10 % redondeado a 500 y cero si no hay total", () => {
    expect(propinaSugerida(0)).toBe(0);
    expect(propinaSugerida(24000)).toBe(2500); // 2.400 -> 2.500
    expect(propinaSugerida(26500)).toBe(2500); // 2.650 -> 2.500
    expect(propinaSugerida(33000)).toBe(3500); // 3.300 -> 3.500
    expect(propinaSugerida(10000, 15)).toBe(1500);
    expect(propinaSugerida(3500)).toBe(500);
  });

  it("calcula vuelto o lo que falta", () => {
    expect(calcularEfectivo(20000, 18000)).toEqual({ vuelto: 2000, falta: 0, alcanza: true });
    expect(calcularEfectivo(18000, 18000)).toEqual({ vuelto: 0, falta: 0, alcanza: true });
    expect(calcularEfectivo(10000, 18000)).toEqual({ vuelto: 0, falta: 8000, alcanza: false });
    expect(calcularEfectivo(0, 18000)).toEqual({ vuelto: 0, falta: 18000, alcanza: false });
  });

  it("atajos de efectivo: exacto y siguientes billetes, sin repetir y ordenados", () => {
    expect(atajosEfectivo(0)).toEqual([]);
    expect(atajosEfectivo(18000)).toEqual([18000, 20000, 50000]);
    expect(atajosEfectivo(26500)).toEqual([26500, 30000, 40000, 50000]);
    expect(atajosEfectivo(20000)).toEqual([20000, 50000]);
    expect(atajosEfectivo(52000).every((a) => a >= 52000)).toBe(true);
  });
});

describe("validar cobro (igual que la base)", () => {
  it("un solo medio que cubre total + propina", () => {
    expect(validarCobro(24000, 2500, [{ medio: "efectivo", monto: 26500, recibido: 30000 }])).toEqual({ ok: true, vuelto: 3500, fiado: 0 });
    expect(validarCobro(24000, 0, [{ medio: "transferencia", monto: 24000, referencia: "NEQ1" }])).toEqual({ ok: true, vuelto: 0, fiado: 0 });
  });

  it("pago mixto: efectivo + fiado", () => {
    const r = validarCobro(32000, 0, [
      { medio: "efectivo", monto: 12000, recibido: 20000 },
      { medio: "fiado", monto: 20000, clienteId: "c1" },
    ]);
    expect(r).toEqual({ ok: true, vuelto: 8000, fiado: 20000 });
  });

  it("rechaza lo que la base rechaza", () => {
    expect(validarCobro(9000, 0, [])).toMatchObject({ ok: false });
    expect(validarCobro(9000, 0, [{ medio: "efectivo", monto: 8000 }])).toMatchObject({ ok: false, error: expect.stringContaining("suman") });
    expect(validarCobro(9000, 0, [{ medio: "efectivo", monto: 9000, recibido: 5000 }])).toMatchObject({ ok: false, error: expect.stringContaining("no alcanza") });
    expect(validarCobro(9000, 0, [{ medio: "fiado", monto: 9000 }])).toMatchObject({ ok: false, error: expect.stringContaining("a quién") });
    expect(validarCobro(9000, -1, [{ medio: "efectivo", monto: 8999 }])).toMatchObject({ ok: false, error: expect.stringContaining("propina") });
    expect(validarCobro(9000, 9001, [{ medio: "efectivo", monto: 18001 }])).toMatchObject({ ok: false, error: expect.stringContaining("propina") });
    expect(validarCobro(9000, 0, [{ medio: "efectivo", monto: 0 }])).toMatchObject({ ok: false });
  });
});

describe("plan de pagos según lo elegido en pantalla", () => {
  const base = { aCobrar: 26500, recibido: 0, referencia: "", clienteId: null, pagaAhora: 0 };

  it("efectivo: un pago con lo recibido", () => {
    const plan = planDePagos({ ...base, medio: "efectivo", recibido: 30000 });
    expect(plan).toEqual([{ medio: "efectivo", monto: 26500, recibido: 30000 }]);
    expect(validarCobro(24000, 2500, plan)).toEqual({ ok: true, vuelto: 3500, fiado: 0 });
  });

  it("transferencia: referencia opcional, sin espacios sobrantes", () => {
    expect(planDePagos({ ...base, medio: "transferencia", referencia: "  NEQ99 " })).toEqual([{ medio: "transferencia", monto: 26500, referencia: "NEQ99" }]);
    expect(planDePagos({ ...base, medio: "transferencia" })[0].referencia).toBeUndefined();
  });

  it("fiado: todo a la cuenta, o una parte en efectivo y el resto a fiado", () => {
    expect(planDePagos({ ...base, medio: "fiado", clienteId: "c1" })).toEqual([{ medio: "fiado", monto: 26500, clienteId: "c1" }]);
    const mixto = planDePagos({ ...base, medio: "fiado", clienteId: "c1", pagaAhora: 10000 });
    expect(mixto).toEqual([
      { medio: "efectivo", monto: 10000, recibido: 10000 },
      { medio: "fiado", monto: 16500, clienteId: "c1" },
    ]);
    expect(validarCobro(24000, 2500, mixto)).toEqual({ ok: true, vuelto: 0, fiado: 16500 });
  });

  it("fiado sin cliente, o pagando todo ahora, no pasa la validación", () => {
    expect(validarCobro(24000, 2500, planDePagos({ ...base, medio: "fiado" }))).toMatchObject({ ok: false, error: expect.stringContaining("a quién") });
    expect(validarCobro(24000, 2500, planDePagos({ ...base, medio: "fiado", clienteId: "c1", pagaAhora: 26500 }))).toMatchObject({ ok: false });
  });
});

describe("fiado", () => {
  it("el saldo es cargos − abonos y no cuenta lo anulado", () => {
    expect(saldoFiado([])).toBe(0);
    expect(
      saldoFiado([
        { tipo: "cargo", monto: 30000 },
        { tipo: "cargo", monto: 20000, anulado: true },
        { tipo: "abono", monto: 10000 },
        { tipo: "abono", monto: 5000, anulado: true },
      ])
    ).toBe(20000);
  });

  it("un abono no puede pasarse de la deuda", () => {
    expect(validarAbono(20000, 5000)).toEqual({ ok: true, saldoNuevo: 15000 });
    expect(validarAbono(20000, 20000)).toEqual({ ok: true, saldoNuevo: 0 });
    expect(validarAbono(20000, 20001)).toMatchObject({ ok: false });
    expect(validarAbono(20000, 0)).toMatchObject({ ok: false });
  });
});

describe("cierre del día", () => {
  const datos = {
    base: 50000,
    pedidos: [
      { total: 24000, propina: 2500 },
      { total: 14000, propina: 0 },
      { total: 32000, propina: 0 },
      { total: 99999, propina: 0, anulado: true },
    ],
    pagos: [
      { medio: "efectivo" as const, monto: 26500 },
      { medio: "transferencia" as const, monto: 14000 },
      { medio: "fiado" as const, monto: 32000 },
      { medio: "efectivo" as const, monto: 99999, anulado: true },
    ],
    abonos: [
      { medio: "efectivo" as const, monto: 10000 },
      { medio: "transferencia" as const, monto: 5000 },
    ],
    gastos: [
      { monto: 60000, deCaja: false },
      { monto: 20000, deCaja: true },
      { monto: 7777, deCaja: true, anulado: true },
    ],
  };

  it("ventas − gastos = ganancia; las ventas incluyen lo fiado y excluyen anulados y propina", () => {
    const r = calcularCierre(datos);
    expect(r.ventas).toBe(70000);
    expect(r.propinas).toBe(2500);
    expect(r.gastos).toBe(80000);
    expect(r.ganancia).toBe(-10000); // puede ser negativa
    expect(r.pedidos).toBe(3);
  });

  it("efectivo esperado = base + efectivo cobrado + abonos en efectivo − gastos de caja", () => {
    const r = calcularCierre(datos);
    expect(r.cobradoEfectivo).toBe(26500);
    expect(r.cobradoTransferencia).toBe(14000);
    expect(r.fiadoNuevo).toBe(32000);
    expect(r.abonosEfectivo).toBe(10000);
    expect(r.abonosTransferencia).toBe(5000);
    expect(r.gastosCaja).toBe(20000);
    expect(r.efectivoEsperado).toBe(50000 + 26500 + 10000 - 20000);
  });

  it("un día sin movimiento solo tiene la base", () => {
    const r = calcularCierre({ base: 30000, pedidos: [], pagos: [], abonos: [], gastos: [] });
    expect(r).toMatchObject({ ventas: 0, gastos: 0, ganancia: 0, efectivoEsperado: 30000 });
  });

  it("la diferencia de caja es contado − esperado", () => {
    expect(diferenciaCaja(46500, 46500)).toBe(0);
    expect(diferenciaCaja(44500, 46500)).toBe(-2000);
    expect(diferenciaCaja(50000, 46500)).toBe(3500);
  });
});
