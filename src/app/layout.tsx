import type { Metadata, Viewport } from "next";
import { Barlow_Condensed } from "next/font/google";
import { GuiaRecorrido } from "@/components/guia/guia-recorrido";
import { ProveedorSync } from "@/components/sync/proveedor-sync";
import { RegistrarServiceWorker } from "@/components/pwa/registrar-sw";
import { COLOR_TEMA, MARCA } from "@/lib/marca";
import "./globals.css";

// Única fuente web: títulos y cifras grandes (dos pesos, solo latín) para cuidar la carga en gama baja.
const barlow = Barlow_Condensed({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["600", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: MARCA.nombre, template: `%s · ${MARCA.nombre}` },
  description: MARCA.lema,
  applicationName: MARCA.nombre,
  // Demo privada: que no salga en buscadores.
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-180.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, title: MARCA.nombre, statusBarStyle: "default" },
  other: { "mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1, // sin maximumScale: el zoom con los dedos sigue disponible
  viewportFit: "cover", // respeta las zonas seguras (notch, barra de gestos)
  themeColor: COLOR_TEMA,
  // El teclado del sistema reduce la altura de la página, así la barra de acción queda SOBRE el teclado.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={barlow.variable}>
      <body>
        {children}
        <GuiaRecorrido />
        <ProveedorSync />
        <RegistrarServiceWorker />
      </body>
    </html>
  );
}
