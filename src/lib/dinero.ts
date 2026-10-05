/**
 * ÚNICO lugar donde se calcula dinero en la interfaz: totales, propina, vuelto, fiado y cierre del día.
 *
 * Reglas:
 *  - COP no usa decimales: todo es un número ENTERO de pesos. Nada de floats ni de "centavos".
 *  - Estos cálculos son para MOSTRAR y dar respuesta inmediata al tocar. El servidor (funciones SQL)
 *    vuelve a calcular todo desde la base y es la verdad; una prueba compara ambos para que no se contradigan.
 *  - Redondeos siempre al peso o a múltiplos de 500/1.000 con Math.round/ceil sobre enteros.
 */

export type Pesos = number;

export type MedioPago = "efectivo" | "transferencia" | "fiado";
export type MedioAbono = "efectivo" | "transferencia";

export const ETIQUETA_MEDIO: Record<MedioPago, string> = {
  efectivo: "Efectivo",
  transferencia: "Nequi / transferencia",
  fiado: "Fiado",
};

// ---------------------------------------------------------------------
// Formato y lectura
// ---------------------------------------------------------------------

/** Convierte cualquier número a pesos enteros (redondea; descarta NaN/Infinity). */
export function aPesos(n: number): Pesos {
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/** 12500 -> "$ 12.500"; negativos: "− $ 12.500" (signo menos tipográfico, se lee bien al sol). */
export function formatearPesos(n: Pesos): string {
  const v = aPesos(n);
  const miles = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${v < 0 ? "− " : ""}$ ${miles}`;
}

/** Igual que formatearPesos pero sin el símbolo (para el teclado numérico y campos). */
export function formatearMiles(n: Pesos): string {
  return formatearPesos(Math.abs(n)).replace("$ ", "");
}

/** "12.500", "$ 12 500", "12,500" -> 12500. Solo cuenta los dígitos; vacío -> 0. Tope: 99.999.999. */
export function leerPesos(texto: string): Pesos {
  const digitos = texto.replace(/\D/g, "").slice(0, 8);
  return digitos ? Number(digitos) : 0;
}

// ---------------------------------------------------------------------
// Pedido
// ---------------------------------------------------------------------

export type LineaPedido = {
  precio: Pesos;
  cantidad: number;
  /** Precios extra de las adiciones elegidas (por unidad). */
  adiciones?: Pesos[];
};

export function sumar(valores: Pesos[]): Pesos {
  return valores.reduce((a, b) => a + b, 0);
}

/** (precio + adiciones) × cantidad. Mismo cálculo que el constraint chk_item_subtotal de la base. */
export function subtotalLinea(l: LineaPedido): Pesos {
  return (l.precio + sumar(l.adiciones ?? [])) * l.cantidad;
}

export function totalPedido(lineas: LineaPedido[]): Pesos {
  return sumar(lineas.map(subtotalLinea));
}

// ---------------------------------------------------------------------
// Cobro
// ---------------------------------------------------------------------

/** Propina sugerida (por defecto 10 %), redondeada al múltiplo de 500 más cercano. Es SIEMPRE opcional. */
export function propinaSugerida(total: Pesos, porcentaje = 10): Pesos {
  if (total <= 0) return 0;
  return Math.round((total * porcentaje) / 100 / 500) * 500;
}

export type ResultadoEfectivo = {
  /** Lo que se devuelve al cliente (0 si no alcanza). */
  vuelto: Pesos;
  /** Lo que falta si el efectivo recibido no alcanza (0 si alcanza). */
  falta: Pesos;
  alcanza: boolean;
};

/** Efectivo recibido vs. lo que se cobra: vuelto o lo que falta. */
export function calcularEfectivo(recibido: Pesos, aCobrar: Pesos): ResultadoEfectivo {
  const dif = recibido - aCobrar;
  return { vuelto: Math.max(dif, 0), falta: Math.max(-dif, 0), alcanza: dif >= 0 };
}

/**
 * Atajos de efectivo para el teclado: el valor exacto y los billetes/múltiplos que lo cubren
 * (siguiente múltiplo de 5.000, 10.000, 20.000 y 50.000), sin repetir y en orden creciente.
 */
export function atajosEfectivo(aCobrar: Pesos): Pesos[] {
  if (aCobrar <= 0) return [];
  const paso = [5000, 10000, 20000, 50000].map((p) => Math.ceil(aCobrar / p) * p);
  return [...new Set([aCobrar, ...paso])].sort((a, b) => a - b).slice(0, 4);
}

export type PagoPlan = {
  medio: MedioPago;
  monto: Pesos;
  /** Solo efectivo: lo que entregó el cliente. */
  recibido?: Pesos;
  referencia?: string;
  clienteId?: string;
};

export type ValidacionCobro = { ok: true; vuelto: Pesos; fiado: Pesos } | { ok: false; error: string };

/** Valida un cobro igual que cobrar_pedido en la base: los pagos deben sumar total + propina. */
export function validarCobro(total: Pesos, propina: Pesos, pagos: PagoPlan[]): ValidacionCobro {
  if (propina < 0 || propina > total) return { ok: false, error: "La propina no es válida." };
  if (pagos.length === 0) return { ok: false, error: "Elige cómo se paga." };
  const debido = total + propina;
  let vuelto = 0;
  let fiado = 0;
  for (const p of pagos) {
    if (p.monto <= 0) return { ok: false, error: "El valor de cada pago debe ser mayor que cero." };
    if (p.medio === "efectivo") {
      const recibido = p.recibido ?? p.monto;
      if (recibido < p.monto) return { ok: false, error: `El efectivo recibido (${formatearPesos(recibido)}) no alcanza.` };
      vuelto += recibido - p.monto;
    }
    if (p.medio === "fiado") {
      if (!p.clienteId) return { ok: false, error: "Elige a quién se le fía." };
      fiado += p.monto;
    }
  }
  const suma = sumar(pagos.map((p) => p.monto));
  if (suma !== debido) return { ok: false, error: `Los pagos suman ${formatearPesos(suma)} y el total a cobrar es ${formatearPesos(debido)}.` };
  return { ok: true, vuelto, fiado };
}

// ---------------------------------------------------------------------
// Fiado
// ---------------------------------------------------------------------

export type MovimientoFiado = { tipo: "cargo" | "abono"; monto: Pesos; anulado?: boolean };

/** Saldo = cargos − abonos, sin contar anulados. */
export function saldoFiado(movimientos: MovimientoFiado[]): Pesos {
  return movimientos.reduce((s, m) => (m.anulado ? s : s + (m.tipo === "cargo" ? m.monto : -m.monto)), 0);
}

/** Un abono no puede pasarse de la deuda. Devuelve el saldo que queda o el error. */
export function validarAbono(saldo: Pesos, abono: Pesos): { ok: true; saldoNuevo: Pesos } | { ok: false; error: string } {
  if (abono <= 0) return { ok: false, error: "El abono debe ser mayor que cero." };
  if (abono > saldo) return { ok: false, error: `El abono (${formatearPesos(abono)}) es mayor que lo que debe (${formatearPesos(saldo)}).` };
  return { ok: true, saldoNuevo: saldo - abono };
}

// ---------------------------------------------------------------------
// Cierre del día
// ---------------------------------------------------------------------

export type DatosCierre = {
  /** Pedidos cobrados ese día (total SIN propina). */
  pedidos: { total: Pesos; propina: Pesos; anulado?: boolean }[];
  /** Pagos registrados ese día (monto incluye la propina). */
  pagos: { medio: MedioPago; monto: Pesos; anulado?: boolean }[];
  abonos: { medio: MedioAbono; monto: Pesos; anulado?: boolean }[];
  gastos: { monto: Pesos; deCaja: boolean; anulado?: boolean }[];
  /** Efectivo con el que se abrió la caja. */
  base: Pesos;
};

export type ResumenCierre = {
  pedidos: number;
  ventas: Pesos;
  propinas: Pesos;
  cobradoEfectivo: Pesos;
  cobradoTransferencia: Pesos;
  fiadoNuevo: Pesos;
  abonosEfectivo: Pesos;
  abonosTransferencia: Pesos;
  gastos: Pesos;
  gastosCaja: Pesos;
  /** Ventas − gastos. Aproximada: no descuenta el costo de los platos. Puede ser negativa. */
  ganancia: Pesos;
  base: Pesos;
  /** Base + efectivo cobrado (con propina) + abonos en efectivo − gastos que salieron de la caja. */
  efectivoEsperado: Pesos;
};

export function calcularCierre(d: DatosCierre): ResumenCierre {
  const pedidos = d.pedidos.filter((p) => !p.anulado);
  const pagos = d.pagos.filter((p) => !p.anulado);
  const abonos = d.abonos.filter((a) => !a.anulado);
  const gastos = d.gastos.filter((g) => !g.anulado);

  const porMedio = (m: MedioPago) => sumar(pagos.filter((p) => p.medio === m).map((p) => p.monto));
  const abonoPor = (m: MedioAbono) => sumar(abonos.filter((a) => a.medio === m).map((a) => a.monto));

  const ventas = sumar(pedidos.map((p) => p.total));
  const totalGastos = sumar(gastos.map((g) => g.monto));
  const gastosCaja = sumar(gastos.filter((g) => g.deCaja).map((g) => g.monto));
  const cobradoEfectivo = porMedio("efectivo");
  const abonosEfectivo = abonoPor("efectivo");

  return {
    pedidos: pedidos.length,
    ventas,
    propinas: sumar(pedidos.map((p) => p.propina)),
    cobradoEfectivo,
    cobradoTransferencia: porMedio("transferencia"),
    fiadoNuevo: porMedio("fiado"),
    abonosEfectivo,
    abonosTransferencia: abonoPor("transferencia"),
    gastos: totalGastos,
    gastosCaja,
    ganancia: ventas - totalGastos,
    base: d.base,
    efectivoEsperado: d.base + cobradoEfectivo + abonosEfectivo - gastosCaja,
  };
}

/** Diferencia de caja: contado − esperado (negativa = faltante, positiva = sobrante). */
export function diferenciaCaja(contado: Pesos, esperado: Pesos): Pesos {
  return contado - esperado;
}
