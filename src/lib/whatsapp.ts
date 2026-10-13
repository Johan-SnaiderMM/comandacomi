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
 * Con `sinNumero` (clientes de ejemplo, con teléfonos inventados que podrían ser de alguien real) se omite el
 * número: el vendedor ve el mensaje listo y escoge él a quién mandarlo (por ejemplo, a sí mismo).
 */
export function enlaceWhatsapp({ telefono, texto, sinNumero = false }: { telefono?: string | null; texto: string; sinNumero?: boolean }): string {
  const numero = !sinNumero && telefono ? soloDigitos(telefono) : "";
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

/** Recordatorio amable de una deuda de fiado. */
export function mensajeRecordatorio({ cliente, saldo, restaurante }: { cliente: string; saldo: Pesos; restaurante: string }): string {
  return `Hola ${nombreCorto(cliente)}, te saluda ${restaurante}. Te recordamos que tienes un saldo pendiente de ${formatearPesos(saldo)}. Cuando puedas pasar o enviarlo por Nequi, nos ayudas mucho. ¡Gracias!`;
}

/** El restaurante le escribe a un cliente que pidió en línea (aclarar la dirección, avisar de un cambio). */
export function mensajeAlClienteEnLinea({ cliente, numero, restaurante }: { cliente: string; numero: number; restaurante: string }): string {
  const nombre = nombreCorto(cliente);
  return `Hola${nombre ? ` ${nombre}` : ""}, te escribe ${restaurante} por tu pedido #${numero}.`;
}

/** El restaurante le manda a un cliente el enlace para seguir su pedido (por ejemplo, un domicilio por teléfono). */
export function mensajeSeguimiento({ cliente, numero, restaurante, enlace }: { cliente: string; numero: number; restaurante: string; enlace: string }): string {
  const nombre = nombreCorto(cliente);
  return `Hola${nombre ? ` ${nombre}` : ""}, soy ${restaurante}. Sigue tu pedido #${numero} aquí: ${enlace}`;
}

/** Invitación para que un cliente pida desde su celular (se manda por WhatsApp a quien el dueño escoja). */
export function mensajeInvitacionPedidos({ restaurante, enlace }: { restaurante: string; enlace: string }): string {
  return `Hola, ya puedes pedir en ${restaurante} desde tu celular, sin llamar: ${enlace}`;
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
