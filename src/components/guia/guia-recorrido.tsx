"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { HojaInferior } from "@/components/ui/hoja-inferior";
import {
  cerrarGuia,
  irAPaso,
  leerGuia,
  leerGuiaServidor,
  PASOS,
  pasoEnRuta,
  pasoTrasNavegar,
  suscribirGuia,
  terminarGuia,
} from "@/lib/guia";

/**
 * Recorrido guiado (solo se activa si el usuario lo inicia). Vive en el layout raíz para que el paso actual
 * sobreviva a los cambios de pantalla. Tres trabajos: mostrar la hoja con las instrucciones del paso, resaltar el
 * botón que hay que tocar y avanzar solo cuando el usuario llega a la pantalla siguiente.
 */
export function GuiaRecorrido() {
  const estado = useSyncExternalStore(suscribirGuia, leerGuia, leerGuiaServidor);
  const ruta = usePathname();
  const router = useRouter();
  const paso = estado?.paso;
  const abierta = estado?.abierta ?? false;
  const objetivo = paso === undefined ? undefined : PASOS[paso]?.objetivo;

  // En la portada (sin sesión) no queda nada a medias de una visita anterior.
  useEffect(() => {
    if (ruta === "/") terminarGuia();
  }, [ruta]);

  // El usuario tocó lo que se le pedía y llegó a la pantalla siguiente: pasa al paso siguiente.
  useEffect(() => {
    if (paso === undefined) return;
    const siguiente = pasoTrasNavegar(paso, ruta);
    if (siguiente !== paso) irAPaso(siguiente);
  }, [paso, ruta]);

  // Resalta el elemento del paso mientras la hoja está cerrada. El aro es un elemento aparte pegado al <body> que sigue
  // al objetivo (así no se toca el HTML que React maneja ni lo recorta un contenedor con overflow). Las pantallas
  // cargan en segundo plano: el objetivo se busca en cada cuadro hasta que aparece.
  useEffect(() => {
    if (!objetivo || abierta) return;
    const aro = document.createElement("div");
    aro.setAttribute("data-guia-aro", "");
    aro.setAttribute("aria-hidden", "true");
    document.body.appendChild(aro);
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let objetivoEl: Element | null = null;
    let cuadro = 0;
    let ultimo = "";
    const seguir = () => {
      if (!objetivoEl?.isConnected) {
        objetivoEl = document.querySelector(`[data-guia="${objetivo}"]`);
        if (objetivoEl) objetivoEl.scrollIntoView({ block: "center", behavior: quieto ? "auto" : "smooth" });
      }
      if (objetivoEl) {
        const r = objetivoEl.getBoundingClientRect();
        const firma = `${r.left}|${r.top}|${r.width}|${r.height}`;
        if (firma !== ultimo) {
          ultimo = firma;
          aro.style.cssText = `display:block;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;border-radius:${getComputedStyle(objetivoEl).borderRadius}`;
        }
      } else {
        aro.style.display = "none";
      }
      cuadro = requestAnimationFrame(seguir);
    };
    cuadro = requestAnimationFrame(seguir);
    return () => {
      cancelAnimationFrame(cuadro);
      aro.remove();
    };
  }, [objetivo, abierta, ruta]);

  if (!estado?.abierta) return null;
  const actual = PASOS[estado.paso];
  if (!actual) return null;

  const aqui = pasoEnRuta(estado.paso, ruta);
  const ultimo = estado.paso === PASOS.length - 1;
  const sePasaConBoton = !actual.alLlegarA; // los demás avanzan solos al tocar lo que se pide

  return (
    <HojaInferior key={estado.paso} titulo={actual.titulo} onCerrar={cerrarGuia}>
      <p className="text-sm font-bold uppercase tracking-wide text-tinta-2">
        Paso {estado.paso + 1} de {PASOS.length}
      </p>
      <p className="mt-1 text-lg leading-snug">{actual.texto}</p>

      <div className="mt-4 space-y-2">
        {!aqui ? (
          <Button
            tamano="lg"
            bloque
            onClick={() => {
              cerrarGuia();
              router.push(actual.ir);
            }}
          >
            Llévame ahí
          </Button>
        ) : sePasaConBoton ? (
          <Button tamano="lg" bloque onClick={() => irAPaso(estado.paso + 1)}>
            {ultimo ? "Terminar" : "Siguiente"}
          </Button>
        ) : (
          <>
            <Button tamano="lg" bloque onClick={cerrarGuia}>
              Entendido
            </Button>
            <Button variante="fantasma" bloque onClick={() => irAPaso(estado.paso + 1)}>
              Saltar este paso
            </Button>
          </>
        )}
        {!ultimo && (
          <Button variante="fantasma" bloque onClick={terminarGuia}>
            Salir del recorrido
          </Button>
        )}
      </div>
    </HojaInferior>
  );
}
