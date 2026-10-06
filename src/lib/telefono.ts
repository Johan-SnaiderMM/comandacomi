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

/**
 * Igual que fn_normalizar_telefono de la base: celular colombiano de 10 dígitos que empieza por 3 -> +57…,
 * 12 dígitos con 57 -> +57…, o un número internacional con "+". Devuelve null si no es válido.
 * Sirve para mostrar el teléfono tal como quedará guardado cuando se crea un cliente sin conexión.
 */
export function normalizarTelefono(texto: string | null | undefined): string | null {
  const t = (texto ?? "").trim();
  const digitos = t.replace(/\D/g, "");
  if (digitos.length === 10 && digitos.startsWith("3")) return `+57${digitos}`;
  if (digitos.length === 12 && digitos.startsWith("57")) return `+${digitos}`;
  if (t.startsWith("+") && digitos.length >= 8 && digitos.length <= 15) return `+${digitos}`;
  return null;
}
