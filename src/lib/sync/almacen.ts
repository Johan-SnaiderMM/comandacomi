/** Dónde se guarda la copia local y la cola. En el navegador es localStorage; en las pruebas, memoria. */
export interface Almacen {
  leer(clave: string): string | null;
  escribir(clave: string, valor: string): void;
  borrar(clave: string): void;
}

export function almacenEnMemoria(): Almacen & { datos: Map<string, string> } {
  const datos = new Map<string, string>();
  return {
    datos,
    leer: (c) => datos.get(c) ?? null,
    escribir: (c, v) => void datos.set(c, v),
    borrar: (c) => void datos.delete(c),
  };
}

/** localStorage con todos los accesos protegidos: puede lanzar (ventana privada, datos bloqueados, cuota llena). */
export function almacenLocal(): Almacen {
  return {
    leer(c) {
      try {
        return window.localStorage.getItem(c);
      } catch {
        return null;
      }
    },
    escribir(c, v) {
      try {
        window.localStorage.setItem(c, v);
      } catch {
        // Sin espacio o sin acceso: la app sigue funcionando con lo que tiene en memoria.
      }
    },
    borrar(c) {
      try {
        window.localStorage.removeItem(c);
      } catch {
        // ver arriba
      }
    },
  };
}
