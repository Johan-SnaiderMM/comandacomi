// Genera los íconos de la PWA (192, 512, maskable y apple-touch) con sharp.
// Uso: npm run iconos   (los PNG ya generados se versionan; solo se corre al cambiar la marca)
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const AMARILLO = "#FFC20E";
const TINTA = "#16140F";
const SALIDA = path.join(process.cwd(), "public", "icons");

/** Marca: un tiquete de comanda (borde inferior dentado) con renglones. Cabe en la zona segura «maskable». */
function tiquete() {
  const dientes = [];
  const x0 = 136;
  const ancho = 240;
  const n = 6;
  const w = ancho / n;
  const yBase = 376;
  let ruta = `M${x0} 104 H${x0 + ancho} V${yBase}`;
  for (let i = 0; i < n; i++) {
    ruta += ` L${x0 + ancho - w * i - w / 2} ${yBase + 24} L${x0 + ancho - w * (i + 1)} ${yBase}`;
  }
  ruta += " Z";
  dientes.push(`<path d="${ruta}" fill="${TINTA}"/>`);
  const barras = [
    { y: 152, w: 168 },
    { y: 204, w: 168 },
    { y: 256, w: 108 },
  ];
  for (const b of barras) {
    dientes.push(`<rect x="172" y="${b.y}" width="${b.w}" height="22" rx="11" fill="${AMARILLO}"/>`);
  }
  dientes.push(`<rect x="172" y="310" width="168" height="34" rx="8" fill="${AMARILLO}"/>`);
  return dientes.join("");
}

const conFondoRedondeado = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="${AMARILLO}"/>${tiquete()}</svg>`;
const conFondoCompleto = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${AMARILLO}"/>${tiquete()}</svg>`;

async function png(svg, tamano, archivo) {
  await sharp(Buffer.from(svg)).resize(tamano, tamano).png({ compressionLevel: 9 }).toFile(path.join(SALIDA, archivo));
  console.log("✓", archivo);
}

await mkdir(SALIDA, { recursive: true });
await png(conFondoRedondeado, 192, "icon-192.png");
await png(conFondoRedondeado, 512, "icon-512.png");
await png(conFondoCompleto, 512, "maskable-512.png");
await png(conFondoCompleto, 180, "apple-touch-180.png");
await writeFile(path.join(SALIDA, "icono.svg"), conFondoRedondeado);
console.log("✓ icono.svg");
