/**
 * Nombre que se propone para una mesa nueva: si las que hay se llaman "Mesa 1…6", la siguiente es "Mesa 7".
 * Si ninguna sigue ese patrón (Barra, Terraza…), no se propone nada: el dueño escribe el suyo.
 */
export function siguienteNombreDeMesa(nombres: string[]): string {
  const numeros = nombres.flatMap((n) => {
    const m = /^mesa\s+(\d{1,3})$/i.exec(n.trim());
    return m ? [Number(m[1])] : [];
  });
  if (numeros.length === 0) return nombres.length === 0 ? "Mesa 1" : "";
  return `Mesa ${Math.max(...numeros) + 1}`;
}
