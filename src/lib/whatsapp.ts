/**
 * Enlaces de WhatsApp de un toque (wa.me). No hay envío automático ni API oficial: el enlace abre WhatsApp con el
 * mensaje ya escrito y la persona solo toca "enviar".
 */
import { formatearPesos, type Pesos } from "@/lib/dinero";
import { nombreCorto } from "@/lib/nombres";

/** +573001234567 -> 573001234567 (wa.me pide solo dígitos con indicativo de país). */
export function soloDigitos(telefono: string): string {
  return telefono.replace(/\D/g, "");
}

/**
 * https://wa.me/<número>?text=<mensaje>. Sin número, WhatsApp deja elegir el contacto.
 * En la DEMO los teléfonos son inventados (podrían ser de alguien real), así que se omite el número: el vendedor
 * ve el mensaje listo y escoge él a quién mandarlo (por ejemplo, a sí mismo).
 */
export function enlaceWhatsapp({ telefono, texto, sinNumero = false }: { telefono?: string | null; texto: string; sinNumero?: boolean }): string {
  const numero = !sinNumero && telefono ? soloDigitos(telefono) : "";
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

/** Recordatorio amable de una deuda de fiado. */
export function mensajeRecordatorio({ cliente, saldo, restaurante }: { cliente: string; saldo: Pesos; restaurante: string }): string {
  return `Hola ${nombreCorto(cliente)}, te saluda ${restaurante}. Te recordamos que tienes un saldo pendiente de ${formatearPesos(saldo)}. Cuando puedas pasar o enviarlo por Nequi, nos ayudas mucho. ¡Gracias!`;
}

export type DatosResumen = {
  restaurante: string;
  /** 'Lunes 5 de octubre' */
  fecha: string;
  ventas: Pesos;
  gastos: Pesos;
  ganancia: Pesos;
  porCobrar: Pesos;
  efectivoEsperado: Pesos;
  efectivoContado: Pesos | null;
};

/** Resumen del día para mandarse por WhatsApp ("hoy vendiste $X, gastaste $Y, ganancia ≈ $Z, te deben $W"). */
export function mensajeResumenCierre(d: DatosResumen): string {
  const lineas = [
    `*${d.restaurante}* · ${d.fecha}`,
    "",
    `Vendiste: ${formatearPesos(d.ventas)}`,
    `Gastaste: ${formatearPesos(d.gastos)}`,
    `Ganancia aprox.: ${formatearPesos(d.ganancia)}`,
    `Te deben (fiado): ${formatearPesos(d.porCobrar)}`,
    "",
    `Efectivo esperado en caja: ${formatearPesos(d.efectivoEsperado)}`,
  ];
  if (d.efectivoContado !== null) {
    const dif = d.efectivoContado - d.efectivoEsperado;
    lineas.push(`Efectivo contado: ${formatearPesos(d.efectivoContado)}`);
    lineas.push(dif === 0 ? "La caja cuadra." : dif < 0 ? `Faltan ${formatearPesos(-dif)}.` : `Sobran ${formatearPesos(dif)}.`);
  }
  return lineas.join("\n");
}
