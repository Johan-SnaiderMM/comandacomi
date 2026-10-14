/**
 * Código de invitación al equipo (migración 20): 8 letras y números, sin los que se confunden al dictarlos (0/O, 1/I).
 * Lo genera la base; aquí solo se limpia lo que la persona escribe y se arma lo que se comparte.
 */
const PATRON = /^[A-HJ-NP-Z2-9]{8}$/;

/** Lo que alguien escribe ("k7mp-2xq9 ") → el código (K7MP2XQ9). */
export function normalizarCodigo(texto: string): string {
  return texto.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function codigoValido(codigo: string): boolean {
  return PATRON.test(codigo);
}

/** K7MP2XQ9 → K7MP-2XQ9: más fácil de leer y de dictar. */
export function formatearCodigo(codigo: string): string {
  return codigo.length === 8 ? `${codigo.slice(0, 4)}-${codigo.slice(4)}` : codigo;
}

/** El enlace que abre el celular de la persona invitada con el código ya puesto (también va en el QR). */
export function enlaceInvitacion(origen: string, codigo: string): string {
  return `${origen.replace(/\/+$/, "")}/unirme?codigo=${codigo}`;
}

/** El mensaje para mandarle la invitación por WhatsApp. */
export function mensajeInvitacion({ nombre, restaurante, enlace, codigo }: { nombre: string; restaurante: string; enlace: string; codigo: string }): string {
  return [
    `Hola ${nombre}, te invito al equipo de ${restaurante} en la app.`,
    `Abre este enlace en tu celular: ${enlace}`,
    `Si te pide un código, es ${formatearCodigo(codigo)}. Sirve una sola vez y por 2 días.`,
  ].join("\n");
}
