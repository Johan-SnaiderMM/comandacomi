"use client";

/**
 * Navegación que sirve en la app normal y en /sc: los componentes hablan en rutas ("/pedidos") y en /sc, que es una
 * sola página, este archivo las traduce al # de la dirección (#/pedidos).
 */
import { createContext, useContext, type ComponentProps } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export type NavegacionSC = {
  /** Ruta lógica actual con su query, ej. "/pedidos?enviado=3". */
  ruta: string;
  /** Va a una ruta de la app (la traduce al # de la página sin conexión). */
  ir: (href: string, reemplazar?: boolean) => void;
  /** Dirección real para un `href` de la app. */
  hrefDe: (href: string) => string;
};

const Contexto = createContext<NavegacionSC | null>(null);
export const ProveedorNavegacionSC = Contexto.Provider;

type PropsEnlace = Omit<ComponentProps<typeof Link>, "href"> & { href: string };

/** <Link> en la app normal; <a href="#/ruta"> en la app sin conexión. */
export function Enlace({ href, prefetch: _prefetch, replace: _replace, scroll: _scroll, ...resto }: PropsEnlace) {
  const nav = useContext(Contexto);
  if (!nav) return <Link href={href} prefetch={_prefetch} replace={_replace} scroll={_scroll} {...resto} />;
  return <a href={nav.hrefDe(href)} {...(resto as ComponentProps<"a">)} />;
}

/** push / replace / refresh sin importar en cuál de las dos apps se está. */
export function useIr() {
  const router = useRouter();
  const nav = useContext(Contexto);
  return {
    push: (href: string) => (nav ? nav.ir(href) : router.push(href)),
    replace: (href: string) => (nav ? nav.ir(href, true) : router.replace(href)),
    /** En la app sin conexión no hace falta: la pantalla se actualiza sola al cambiar los datos locales. */
    refresh: () => (nav ? undefined : router.refresh()),
  };
}

/** La ruta lógica actual (para marcar la pestaña activa), sin query. */
export function useRuta(): string {
  const nav = useContext(Contexto);
  const normal = usePathname();
  return nav ? nav.ruta.split("?")[0] : normal;
}

export function useEnAppSinConexion(): boolean {
  return useContext(Contexto) !== null;
}
