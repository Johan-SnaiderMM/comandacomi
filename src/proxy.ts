import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Refresca la sesión de Supabase (el token dura ~1 h): sin esto, un celular que lleva rato abierto
 * pediría volver a entrar. Solo corre si hay cookies de sesión y no toca recursos estáticos.
 * (En Next 16 "middleware" se llama "proxy".)
 *
 * Tampoco corre en las consultas periódicas (/api/pulso, /api/plancha, /api/seguimiento): son la mayoría de las
 * peticiones y pasar por aquí sería pagar dos ejecuciones por cada una. Esas rutas renuevan la sesión ellas mismas:
 * `obtenerUsuario()` → getClaims, que la refresca si le quedan menos de 90 s, y una ruta sí puede guardar la cookie
 * nueva. Así la plancha, que se queda todo el día en la misma pantalla, nunca pierde la sesión.
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
