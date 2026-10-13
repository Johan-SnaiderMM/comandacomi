"use client";

/**
 * Las acciones que cambian datos, vistas desde el celular. Cada una hace lo mismo con o sin señal: con señal y la
 * cola vacía manda la operación y devuelve el resultado real del servidor; sin señal la guarda, la muestra de una
 * vez en pantalla (ver vista.ts) y devuelve un resultado provisional marcado con `pendiente: true`.
 *
 * Un error de validación del servidor (el plato ya no existe, el pedido ya está cobrado) se devuelve como error y no
 * se encola: la persona lo ve en el momento y lo corrige.
 */
import type { EstadoPedido, TipoPedido } from "@/lib/datos/tipos";
import { validarCobro, type MedioAbono, type PagoPlan } from "@/lib/dinero";
import { MENSAJE_GENERICO, type Resultado } from "@/lib/errores";
import { normalizarTelefono } from "@/lib/telefono";
import { anularCobro as anularCobroEnServidor, anularPedido as anularPedidoEnServidor, quitarPlato as quitarPlatoEnServidor } from "@/app/acciones/pedidos";
import { obtenerMotor } from "./cliente";
import type { DatosOperacion, ItemEnvio, TipoOperacion } from "./tipos";

const SIN_MOTOR = { ok: false, error: MENSAJE_GENERICO } as const;

type Hecho = { pendiente: false; datos: Record<string, unknown> } | { pendiente: true; numeroLocal: number | undefined };

/** Ejecuta la operación y la reduce a "se hizo (con los datos del servidor)" o "quedó pendiente". */
async function hacer<T extends TipoOperacion>(tipo: T, datos: DatosOperacion[T]): Promise<{ ok: false; error: string } | ({ ok: true } & Hecho)> {
  const motor = obtenerMotor();
  if (!motor) return SIN_MOTOR;
  const r = await motor.ejecutar(tipo, datos);
  if (!r.ok) return { ok: false, error: r.error };
  if (r.pendiente) return { ok: true, pendiente: true, numeroLocal: r.op.numeroLocal };
  return { ok: true, pendiente: false, datos: (r.datos ?? {}) as Record<string, unknown> };
}

// ------------------------------------------------------------------------------------------------- pedidos

export type EntradaEnvio = {
  tipo: TipoPedido;
  mesaId: string | null;
  /** Pedido abierto al que se le agregan platos (en vez de crear uno nuevo). */
  agregarA: string | null;
  contactoNombre: string;
  contactoTelefono: string;
  direccion: string;
  items: ItemEnvio[];
};

export type Enviado = { numero: number; total: number; agregado: boolean; pendiente: boolean };

/** Enviar a cocina: crea el pedido (o agrega platos a uno abierto). Los precios los lee la base al subir. */
export async function enviarPedido(e: EntradaEnvio): Promise<Resultado<Enviado>> {
  const motor = obtenerMotor();
  if (!motor) return SIN_MOTOR;

  if (e.agregarA) {
    const pedidoId = e.agregarA;
    const r = await hacer("agregar_items", { pedidoId, items: e.items });
    if (!r.ok) return r;
    if (!r.pendiente) return { ok: true, datos: { numero: Number(r.datos.numero), total: Number(r.datos.total), agregado: true, pendiente: false } };
    const p = motor.vista()?.pendientes.find((x) => x.id === pedidoId);
    return { ok: true, datos: { numero: p?.numero ?? 0, total: p?.total ?? 0, agregado: true, pendiente: true } };
  }

  const id = crypto.randomUUID();
  const r = await hacer("crear_pedido", {
    id,
    tipo: e.tipo,
    mesaId: e.tipo === "mesa" ? e.mesaId : null,
    contactoNombre: e.contactoNombre,
    contactoTelefono: e.contactoTelefono,
    direccion: e.tipo === "domicilio" ? e.direccion : "",
    notas: "",
    items: e.items,
  });
  if (!r.ok) return r;
  if (!r.pendiente) return { ok: true, datos: { numero: Number(r.datos.numero), total: Number(r.datos.total), agregado: false, pendiente: false } };
  const p = motor.vista()?.pendientes.find((x) => x.id === id);
  return { ok: true, datos: { numero: p?.numero ?? -(r.numeroLocal ?? 1), total: p?.total ?? 0, agregado: false, pendiente: true } };
}

export async function cambiarEstado(pedidoId: string, estado: EstadoPedido): Promise<Resultado> {
  const r = await hacer("cambiar_estado", { pedidoId, estado });
  return r.ok ? { ok: true } : r;
}

// --------------------------------------------------------------------------------------------------- cobro

export type Cobrado = { numero: number; total: number; propina: number; cobrado: number; vuelto: number; fiado: number; pendiente: boolean };

/** Cobra un pedido. La base valida que los pagos sumen exactamente total + propina y calcula el vuelto. */
export async function cobrarPedido(e: { pedidoId: string; propina: number; pagos: PagoPlan[] }): Promise<Resultado<Cobrado>> {
  const motor = obtenerMotor();
  if (!motor) return SIN_MOTOR;
  const antes = motor.vista()?.pendientes.find((p) => p.id === e.pedidoId);

  const r = await hacer("cobrar", {
    pedidoId: e.pedidoId,
    propina: e.propina,
    pagos: e.pagos.map((p) => ({ medio: p.medio, monto: p.monto, recibido: p.recibido, referencia: p.referencia, clienteId: p.clienteId })),
  });
  if (!r.ok) return r;
  if (!r.pendiente) {
    const d = r.datos;
    return {
      ok: true,
      datos: { numero: Number(d.numero), total: Number(d.total), propina: Number(d.propina), cobrado: Number(d.cobrado), vuelto: Number(d.vuelto), fiado: Number(d.fiado), pendiente: false },
    };
  }
  // Sin señal: el vuelto y el fiado salen de la misma cuenta que hace la base (hay una prueba que lo verifica).
  const total = antes?.total ?? e.pagos.reduce((s, p) => s + p.monto, 0) - e.propina;
  const v = validarCobro(total, e.propina, e.pagos);
  return {
    ok: true,
    datos: { numero: antes?.numero ?? 0, total, propina: e.propina, cobrado: total + e.propina, vuelto: v.ok ? v.vuelto : 0, fiado: v.ok ? v.fiado : 0, pendiente: true },
  };
}

// ---------------------------------------------------------------------------------------------------- fiado

export type ClienteNuevo = { id: string; nombre: string; telefono: string | null; pendiente: boolean };

export async function crearCliente(nombre: string, telefono: string): Promise<Resultado<ClienteNuevo>> {
  const nombreLimpio = nombre.trim();
  if (nombreLimpio.length === 0) return { ok: false, error: "Escribe el nombre del cliente." };
  const tel = telefono.trim();
  if (tel.length > 0 && normalizarTelefono(tel) === null) {
    return { ok: false, error: "El teléfono no es válido. Escríbelo con 10 dígitos, por ejemplo 300 123 4567." };
  }
  const id = crypto.randomUUID();
  const r = await hacer("crear_cliente", { id, nombre: nombreLimpio, telefono: tel });
  if (!r.ok) return r;
  if (!r.pendiente) {
    const d = r.datos;
    return { ok: true, datos: { id: String(d.id), nombre: String(d.nombre), telefono: (d.telefono as string | null) ?? null, pendiente: false } };
  }
  return { ok: true, datos: { id, nombre: nombreLimpio, telefono: normalizarTelefono(tel) ?? (tel || null), pendiente: true } };
}

/** Abono a la deuda de un cliente. `saldoActual` sirve para mostrar lo que queda cuando no hay señal. */
export async function registrarAbono(e: { clienteId: string; monto: number; medio: MedioAbono; referencia: string }, saldoActual: number): Promise<Resultado<{ saldo: number; pendiente: boolean }>> {
  const r = await hacer("abonar", { clienteId: e.clienteId, monto: e.monto, medio: e.medio, referencia: e.referencia });
  if (!r.ok) return r;
  if (!r.pendiente) return { ok: true, datos: { saldo: Number(r.datos.saldo), pendiente: false } };
  return { ok: true, datos: { saldo: Math.max(0, saldoActual - e.monto), pendiente: true } };
}

// -------------------------------------------------------------------------------------------------- gastos

export async function registrarGasto(e: DatosOperacion["gasto"]): Promise<Resultado<{ pendiente: boolean }>> {
  const r = await hacer("gasto", e);
  return r.ok ? { ok: true, datos: { pendiente: r.pendiente } } : r;
}


// ------------------------------------------------------------------------------------ solo con señal

const SIN_SENAL = "Sin conexión: esto necesita señal. Inténtalo cuando vuelva.";

/** Anular no se hace sin señal (necesita lo que ya está en el servidor); en vez de fallar callado, lo explica. */
async function soloConSenal(accion: () => Promise<Resultado>): Promise<Resultado> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return { ok: false, error: SIN_SENAL };
  try {
    return await accion();
  } catch {
    return { ok: false, error: SIN_SENAL };
  }
}

export const anularPedido = (id: string, motivo: string) => soloConSenal(() => anularPedidoEnServidor(id, motivo));
export const anularCobro = (id: string, motivo: string) => soloConSenal(() => anularCobroEnServidor(id, motivo));
/** Quitar un plato de un pedido sin cobrar (anular esa línea). También necesita señal. */
export const quitarPlato = (itemId: string, motivo: string) =>
  soloConSenal(async () => {
    const r = await quitarPlatoEnServidor(itemId, motivo);
    return r.ok ? { ok: true } : r;
  });
