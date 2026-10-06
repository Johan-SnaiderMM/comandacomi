/**
 * Los clientes de la demo llevan teléfonos inventados del bloque +57 300 000 0xxx: podrían ser de alguien real, así
 * que nunca se les arma un enlace de WhatsApp con ese número. Los que escribe el dueño sí se usan.
 */
export function esTelefonoDeEjemplo(e164: string | null | undefined): boolean {
  return /^\+573000000\d{3}$/.test((e164 ?? "").trim());
}

/** +573001234567 -> "300 123 4567" (celulares colombianos). Otros formatos se devuelven tal cual. */
export function formatearTelefono(e164: string | null | undefined): string {
  if (!e164) return "";
  const m = /^\+57(\d{3})(\d{3})(\d{4})$/.exec(e164.trim());
  return m ? `${m[1]} ${m[2]} ${m[3]}` : e164;
}
