/**
 * Número que se muestra de un pedido: "#135" cuando el servidor ya lo numeró; "N1", "N2"… (negativo en los datos)
 * mientras el pedido se hizo sin conexión y espera subirse.
 */
export function numeroVisible(numero: number): string {
  return numero > 0 ? `#${numero}` : `N${-numero}`;
}

export const esNumeroLocal = (numero: number) => numero <= 0;
