const TRATAMIENTOS = new Set(["don", "doña", "dona", "señor", "senor", "señora", "senora", "sr", "sra", "profe", "doctor", "doctora", "dr", "dra"]);

/**
 * Nombre para dirigirse a alguien: el primer nombre, pero respetando el tratamiento.
 * "Marleny Ríos" -> "Marleny"; "Don Jairo Cárdenas" -> "Don Jairo"; "Doña Nubia" -> "Doña Nubia".
 */
export function nombreCorto(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "";
  if (partes.length > 1 && TRATAMIENTOS.has(partes[0].toLowerCase().replace(/\.$/, ""))) return `${partes[0]} ${partes[1]}`;
  return partes[0];
}
