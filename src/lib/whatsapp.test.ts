import { describe, expect, it } from "vitest";
import { enlaceWhatsapp, mensajeRecordatorio, mensajeResumenCierre, soloDigitos } from "./whatsapp";

describe("enlaces de WhatsApp (wa.me)", () => {
  it("deja solo dígitos del teléfono", () => {
    expect(soloDigitos("+57 300 123-4567")).toBe("573001234567");
  });

  it("arma https://wa.me/<número>?text=<mensaje codificado>", () => {
    const url = enlaceWhatsapp({ telefono: "+573001234567", texto: "Hola, ¿cómo estás? $ 5.000 & más" });
    expect(url).toBe(`https://wa.me/573001234567?text=${encodeURIComponent("Hola, ¿cómo estás? $ 5.000 & más")}`);
    expect(url).not.toContain(" "); // sin espacios sueltos
    expect(decodeURIComponent(url.split("text=")[1])).toBe("Hola, ¿cómo estás? $ 5.000 & más");
  });

  it("sin teléfono o en modo demo (sinNumero) se omite el número: WhatsApp deja elegir el contacto", () => {
    expect(enlaceWhatsapp({ telefono: null, texto: "x" })).toBe("https://wa.me/?text=x");
    expect(enlaceWhatsapp({ telefono: "+573001234567", texto: "x", sinNumero: true })).toBe("https://wa.me/?text=x");
  });
});

describe("mensajes", () => {
  it("recordatorio de fiado: nombre de pila, saldo y restaurante", () => {
    const m = mensajeRecordatorio({ cliente: "Marleny Ríos", saldo: 21000, restaurante: "Picnic Delicias" });
    expect(m).toContain("Hola Marleny,");
    expect(m).toContain("$ 21.000");
    expect(m).toContain("Picnic Delicias");
    expect(m).not.toContain("Ríos");
    expect(mensajeRecordatorio({ cliente: "Don Jairo Cárdenas", saldo: 1000, restaurante: "R" })).toContain("Hola Don Jairo,");
  });

  it("resumen del cierre: cifras, diferencia de caja y 'La caja cuadra'", () => {
    const base = { restaurante: "La Plancha", fecha: "Lunes 5 de octubre", ventas: 684000, gastos: 277000, ganancia: 407000, porCobrar: 330500, efectivoEsperado: 219500 };
    const sinContar = mensajeResumenCierre({ ...base, efectivoContado: null });
    expect(sinContar).toContain("Vendiste: $ 684.000");
    expect(sinContar).toContain("Ganancia aprox.: $ 407.000");
    expect(sinContar).toContain("Te deben (fiado): $ 330.500");
    expect(sinContar).not.toContain("contado");

    expect(mensajeResumenCierre({ ...base, efectivoContado: 219500 })).toContain("La caja cuadra.");
    expect(mensajeResumenCierre({ ...base, efectivoContado: 217500 })).toContain("Faltan $ 2.000.");
    expect(mensajeResumenCierre({ ...base, efectivoContado: 224500 })).toContain("Sobran $ 5.000.");
  });

  it("una ganancia negativa se escribe con signo menos", () => {
    const m = mensajeResumenCierre({ restaurante: "R", fecha: "F", ventas: 100000, gastos: 150000, ganancia: -50000, porCobrar: 0, efectivoEsperado: 0, efectivoContado: null });
    expect(m).toContain("Ganancia aprox.: − $ 50.000");
  });
});
