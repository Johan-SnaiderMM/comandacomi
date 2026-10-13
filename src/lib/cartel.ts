/**
 * El cartel con el código QR como IMAGEN (para mandarla por WhatsApp a una papelería o pegarla en redes). Se dibuja en
 * un lienzo con las mismas piezas que el cartel de la pantalla: franja amarilla, nombre del local, código y pasos.
 * Lógica de dibujo pura: recibe el lienzo y los datos; no toca el DOM por su cuenta.
 */

export type DatosCartel = {
  nombre: string;
  /** Lo que se lee debajo del código (sin https://). */
  enlaceVisible: string;
  /** Módulos del código: `oscuro[fila][columna]`. */
  qr: { lado: number; oscuro: boolean[][] };
  /** Familias tipográficas ya cargadas en la página (se leen del propio cartel en pantalla). */
  fuenteTitulos: string;
  fuenteTexto: string;
};

export const ANCHO_CARTEL = 1240; // ≈ media carta a 200 ppp: se imprime nítido y pesa poco
export const ALTO_CARTEL = 1754;

const TINTA = "#16140f";
const SOL = "#ffc20e";
const PAPEL = "#ffffff";

/** Parte un texto en renglones que quepan en `ancho` (con la fuente que ya tenga puesta el contexto). */
export function partirEnRenglones(medir: (t: string) => number, texto: string, ancho: number, maximo = 3): string[] {
  const palabras = texto.trim().split(/\s+/).filter(Boolean);
  const renglones: string[] = [];
  let actual = "";
  for (const palabra of palabras) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (actual && medir(prueba) > ancho) {
      renglones.push(actual);
      actual = palabra;
    } else {
      actual = prueba;
    }
  }
  if (actual) renglones.push(actual);
  if (renglones.length <= maximo) return renglones;
  // Demasiado largo: se queda con los primeros renglones y avisa con puntos suspensivos.
  const recortados = renglones.slice(0, maximo);
  recortados[maximo - 1] = `${recortados[maximo - 1].replace(/[\s.,;:]+$/, "")}…`;
  return recortados;
}

/** Dibuja el cartel completo en el lienzo (que debe medir ANCHO_CARTEL × ALTO_CARTEL). */
export function dibujarCartel(ctx: CanvasRenderingContext2D, d: DatosCartel): void {
  const W = ANCHO_CARTEL;
  const H = ALTO_CARTEL;
  const borde = 14;
  ctx.fillStyle = PAPEL;
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // Franja de arriba
  const altoFranja = 330;
  ctx.fillStyle = SOL;
  ctx.fillRect(0, 0, W, altoFranja);
  ctx.fillStyle = TINTA;
  ctx.fillRect(0, altoFranja, W, borde);
  ctx.font = `800 150px ${d.fuenteTitulos}`;
  ctx.fillText("PIDE DESDE", W / 2, 160);
  ctx.fillText("TU CELULAR", W / 2, 295);

  // Nombre del local
  ctx.font = `800 96px ${d.fuenteTitulos}`;
  const nombre = partirEnRenglones((t) => ctx.measureText(t).width, d.nombre.toUpperCase(), W - 160, 2);
  let y = altoFranja + 130;
  for (const renglon of nombre) {
    ctx.fillText(renglon, W / 2, y);
    y += 100;
  }

  // Código QR, lo más grande posible con su zona en blanco
  const margen = 4;
  const lado = d.qr.lado + margen * 2;
  const disponible = Math.min(W - 280, H - y - 520);
  const modulo = Math.max(1, Math.floor(disponible / lado));
  const tamano = modulo * lado;
  const x0 = Math.round((W - tamano) / 2);
  const y0 = y - 40;
  ctx.fillStyle = TINTA;
  ctx.fillRect(x0 - borde, y0 - borde, tamano + borde * 2, tamano + borde * 2);
  ctx.fillStyle = PAPEL;
  ctx.fillRect(x0, y0, tamano, tamano);
  ctx.fillStyle = TINTA;
  d.qr.oscuro.forEach((fila, f) =>
    fila.forEach((negro, c) => {
      if (negro) ctx.fillRect(x0 + (c + margen) * modulo, y0 + (f + margen) * modulo, modulo, modulo);
    })
  );

  // Qué hacer
  let pie = y0 + tamano + borde + 110;
  ctx.font = `800 84px ${d.fuenteTitulos}`;
  ctx.fillText("ESCANEA CON LA CÁMARA", W / 2, pie);
  pie += 80;
  ctx.font = `600 46px ${d.fuenteTexto}`;
  ctx.fillText("Elige tus platos · Envía el pedido · Pagas al recibir", W / 2, pie);
  pie += 90;
  ctx.font = `700 40px ${d.fuenteTexto}`;
  const enlace = partirEnRenglones((t) => ctx.measureText(t).width, d.enlaceVisible, W - 120, 1);
  ctx.fillText(enlace[0] ?? "", W / 2, pie);

  // Marco
  ctx.strokeStyle = TINTA;
  ctx.lineWidth = borde;
  ctx.strokeRect(borde / 2, borde / 2, W - borde, H - borde);
}
