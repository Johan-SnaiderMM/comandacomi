import type { MetadataRoute } from "next";
import { COLOR_MARCA, COLOR_TEMA, MARCA } from "@/lib/marca";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: MARCA.nombre,
    short_name: MARCA.nombre,
    description: MARCA.lema,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "es",
    // Pantalla de carga de Android: el ícono «maskable» (amarillo) se pinta sobre este color.
    background_color: COLOR_MARCA,
    theme_color: COLOR_TEMA,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
