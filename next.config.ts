import type { NextConfig } from "next";

const esDev = process.env.NODE_ENV !== "production";

/** Origen de Supabase (API): único servidor externo al que la app se conecta. */
function origenSupabase(): string[] {
  try {
    return [new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin];
  } catch {
    return ["https://*.supabase.co"];
  }
}

/**
 * Content-Security-Policy. Next inyecta scripts en línea para hidratar, así que se permite 'unsafe-inline'
 * (sin nonces); aun así se bloquea cargar código de otros dominios, enviar datos a servidores ajenos y
 * que otro sitio incruste la app.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${esDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${origenSupabase().join(" ")}`,
  `connect-src 'self' ${origenSupabase().join(" ")}${esDev ? " ws: wss:" : ""}`,
  "font-src 'self' data:",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // PGlite (base local de desarrollo) usa WASM: no debe empaquetarse.
  serverExternalPackages: ["@electric-sql/pglite"],
  experimental: {
    serverActions: {
      // Las fotos de los gastos llegan comprimidas (~300 KB); el tope del bucket es 1,5 MB.
      bodySizeLimit: "2mb",
    },
  },
  async headers() {
    return [
      {
        // El service worker debe revalidarse siempre para que las actualizaciones lleguen.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // La cámara la usa la propia app (foto opcional del gasto); micrófono y ubicación no.
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
