/** +573001234567 -> "300 123 4567" (celulares colombianos). Otros formatos se devuelven tal cual. */
export function formatearTelefono(e164: string | null | undefined): string {
  if (!e164) return "";
  const m = /^\+57(\d{3})(\d{3})(\d{4})$/.exec(e164.trim());
  return m ? `${m[1]} ${m[2]} ${m[3]}` : e164;
}
