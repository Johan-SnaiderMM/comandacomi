import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Renueva la sesión de Supabase (dura ~1 h). No corre en las consultas periódicas (pulso, plancha, seguimiento) para no
 * pagar dos ejecuciones por consulta: esas rutas la renuevan solas con `obtenerUsuario()` (ver src/test/proxy.test.ts).
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const llave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const hayCookieDeSesion = request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
  if (!url || !llave || !hayCookieDeSesion) return NextResponse.next();

  let respuesta = NextResponse.next({ request });
  const supabase = createServerClient(url, llave, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (lista) => {
        for (const { name, value } of lista) request.cookies.set(name, value);
        respuesta = NextResponse.next({ request });
        for (const { name, value, options } of lista) respuesta.cookies.set(name, value, options);
      },
    },
  });

  // getClaims refresca el token si está por vencer y deja las cookies nuevas en `respuesta`.
  await supabase.auth.getClaims();
  return respuesta;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|sw\\.js|sw-cliente\\.js|offline\\.html|icons/|manifest\\.webmanifest|api/pulso|api/plancha|api/seguimiento).*)"],
};
