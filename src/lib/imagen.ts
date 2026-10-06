/**
 * Comprime una foto en el celular ANTES de subirla: máximo 1280 px por lado, JPEG ~300 KB.
 * Ahorra datos y almacenamiento (y es rápido incluso en gama baja). Solo corre en el navegador.
 */
export async function comprimirImagen(archivo: File, maxLado = 1280, calidad = 0.72): Promise<Blob> {
  let imagen: ImageBitmap;
  try {
    // "from-image": respeta la orientación EXIF (fotos tomadas de lado salen derechas).
    imagen = await createImageBitmap(archivo, { imageOrientation: "from-image" });
  } catch {
    imagen = await createImageBitmap(archivo);
  }
  const escala = Math.min(1, maxLado / Math.max(imagen.width, imagen.height));
  const ancho = Math.max(1, Math.round(imagen.width * escala));
  const alto = Math.max(1, Math.round(imagen.height * escala));

  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;
  const ctx = lienzo.getContext("2d");
  if (!ctx) throw new Error("No se pudo preparar la foto.");
  ctx.drawImage(imagen, 0, 0, ancho, alto);
  imagen.close();

  return new Promise((resolver, rechazar) => {
    lienzo.toBlob((b) => (b ? resolver(b) : rechazar(new Error("No se pudo comprimir la foto."))), "image/jpeg", calidad);
  });
}
