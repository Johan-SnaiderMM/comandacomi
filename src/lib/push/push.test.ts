import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { destinoDeEntrada, destinoDesdeDireccion } from "@/lib/destinos";
import { esquemaCanales, esquemaSuscripcion } from "@/lib/esquemas/push";
import {
  avisoALaPlancha,
  avisoClienteAceptado,
  avisoClienteListo,
  avisoClienteRechazado,
  avisoDePrueba,
  avisoPedidoListo,
  avisoPedidoNuevo,
  avisoPlatosAgregados,
} from "./mensajes";
import type { InfoPedidoAviso } from "./tipos";

const mocks = vi.hoisted(() => ({ enviar: vi.fn(), configurar: vi.fn() }));
vi.mock("web-push", () => ({ default: { sendNotification: mocks.enviar, setVapidDetails: mocks.configurar } }));

const NBSP = " ";
const info = (extra: Partial<InfoPedidoAviso> = {}): InfoPedidoAviso => ({
  token: "123e4567-e89b-42d3-a456-426614174000",
  numero: 125,
  tipo: "domicilio",
  estado: "listo",
  origen: "cliente",
  mesa: null,
  contacto_nombre: "Camila",
  restaurante: "Picnic Delicias",
  destinos: [],
  ...extra,
});

describe("texto de los avisos", () => {
  it("pedido nuevo: número, tipo, total y a dónde lleva", () => {
    const a = avisoPedidoNuevo({ numero: 125, tipo: "domicilio", total: 37000 });
    expect(a.titulo).toBe("¡Pedido nuevo! #125");
    expect(a.cuerpo).toBe(`Domicilio · $${NBSP}37.000. Toca para aceptarlo.`);
    expect(a).toMatchObject({ url: "/pedidos", urgente: true });
    expect(avisoPedidoNuevo({ numero: 1, tipo: "llevar", total: 9000 }).cuerpo).toMatch(/^Recoge en el local/);
  });

  it("a la plancha y listo: dicen para dónde es (mesa, domicilio…)", () => {
    expect(avisoALaPlancha(info({ tipo: "mesa", mesa: "Mesa 3", origen: "mostrador" }))).toMatchObject({
      titulo: "A la plancha: #125",
      cuerpo: "Mesa 3. Toca para ver los platos.",
      url: "/plancha",
    });
    expect(avisoPedidoListo(info()).cuerpo).toBe("Domicilio · Camila. Ya se puede llevar.");
    expect(avisoPedidoListo(info()).titulo).toBe("Listo para entregar: #125");
  });

  it("platos agregados a un pedido que ya estaba: avisa a la plancha y reemplaza el aviso de ese pedido", () => {
    const mesa = info({ tipo: "mesa", mesa: "Mesa 3", origen: "mostrador", estado: "pendiente" });
    const agregado = avisoPlatosAgregados(mesa);
    expect(agregado).toMatchObject({ titulo: "Más platos: #125", cuerpo: "Mesa 3. Le agregaron platos al pedido.", url: "/plancha", urgente: true });
    expect(agregado.etiqueta).toBe(avisoALaPlancha(mesa).etiqueta);
  });

  it("al cliente: lleva a SU seguimiento y reemplaza el aviso anterior (misma etiqueta)", () => {
    const aceptado = avisoClienteAceptado(info({ estado: "pendiente" }), 20);
    expect(aceptado.cuerpo).toContain("Listo en unos 20 min");
    expect(aceptado.url).toBe("/seguimiento/123e4567-e89b-42d3-a456-426614174000");
    expect(avisoClienteAceptado(info(), null).cuerpo).not.toContain("min");

    const listo = avisoClienteListo(info());
    expect(listo.cuerpo).toMatch(/envía a tu dirección/);
    expect(avisoClienteListo(info({ tipo: "llevar" })).cuerpo).toMatch(/pasar a recogerlo/);
    expect(listo.etiqueta).toBe(aceptado.etiqueta);

    expect(avisoClienteRechazado(info(), "Se acabó un ingrediente").cuerpo).toBe("Se acabó un ingrediente. Puedes volver a pedir.");
  });

  it("el aviso de prueba abre Más", () => {
    expect(avisoDePrueba().url).toBe("/mas");
  });
});

describe("destinos de entrada (enlaces por rol)", () => {
  it("solo acepta rutas de la lista cerrada", () => {
    expect(destinoDeEntrada("/plancha")).toBe("/plancha");
    expect(destinoDeEntrada("/pedidos")).toBe("/pedidos");
    for (const malo of ["https://malo.example", "//malo.example", "/admin", "/plancha/../x", "", null, undefined, "constructor", "__proto__"]) {
      expect(destinoDeEntrada(malo as string | null)).toBeNull();
    }
  });

  it("recupera el destino de la dirección de la portada (toque antes de que cargue la página)", () => {
    expect(destinoDesdeDireccion("https://comanda.example/?ir=/plancha")).toBe("/plancha");
    expect(destinoDesdeDireccion("https://comanda.example/?ir=%2Fpedidos&x=1")).toBe("/pedidos");
  });

  it("de la dirección tampoco sale nada fuera de la lista, ni de otra pantalla", () => {
    for (const mala of [
      "https://comanda.example/",
      "https://comanda.example/?ir=/admin",
      "https://comanda.example/?ir=https://malo.example",
      "https://comanda.example/mas?ir=/plancha",
      "/?ir=/plancha",
      "no es una dirección",
      "",
      null,
      undefined,
    ]) {
      expect(destinoDesdeDireccion(mala)).toBeNull();
    }
  });
});

describe("validación de la suscripción", () => {
  const ok = {
    endpoint: "https://fcm.googleapis.com/fcm/send/abc",
    keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" },
  };

  it("acepta la que entrega el navegador y rechaza lo raro", () => {
    expect(esquemaSuscripcion.safeParse(ok).success).toBe(true);
    expect(esquemaSuscripcion.safeParse({ ...ok, endpoint: "http://inseguro.example/x" }).success).toBe(false);
    expect(esquemaSuscripcion.safeParse({ ...ok, endpoint: "no es url" }).success).toBe(false);
    expect(esquemaSuscripcion.safeParse({ ...ok, keys: { p256dh: "x", auth: "y" } }).success).toBe(false);
    expect(esquemaSuscripcion.safeParse({ endpoint: ok.endpoint }).success).toBe(false);
  });

  it("los canales son una lista no vacía de canales conocidos", () => {
    expect(esquemaCanales.safeParse(["pedidos", "listos"]).success).toBe(true);
    expect(esquemaCanales.safeParse([]).success).toBe(false);
    expect(esquemaCanales.safeParse(["cliente"]).success).toBe(false);
    expect(esquemaCanales.safeParse(["pedidos", "pedidos", "cocina", "listos"]).success).toBe(false);
  });
});

describe("envío (web-push simulado)", () => {
  const destinos = [
    { endpoint: "https://push.example/a", p256dh: "pa", auth: "aa" },
    { endpoint: "https://push.example/b", p256dh: "pb", auth: "ab" },
    { endpoint: "https://push.example/c", p256dh: "pc", auth: "ac" },
  ];

  beforeEach(() => {
    vi.resetModules();
    mocks.enviar.mockReset();
    mocks.configurar.mockReset();
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "publica");
    vi.stubEnv("VAPID_PRIVATE_KEY", "privada");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("manda el JSON a cada celular y cuenta los enviados", async () => {
    mocks.enviar.mockResolvedValue({ statusCode: 201 });
    const { enviarAviso } = await import("./servidor");
    const aviso = avisoPedidoNuevo({ numero: 7, tipo: "llevar", total: 9000 });
    const r = await enviarAviso(destinos, aviso);
    expect(r).toEqual({ enviados: 3, caducados: [] });
    expect(mocks.enviar).toHaveBeenCalledTimes(3);
    const [sub, carga, opciones] = mocks.enviar.mock.calls[0];
    expect(sub).toEqual({ endpoint: destinos[0].endpoint, keys: { p256dh: "pa", auth: "aa" } });
    expect(JSON.parse(carga as string)).toEqual(aviso);
    expect(opciones).toMatchObject({ TTL: 3600, urgency: "high" });
    expect(mocks.configurar).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\//), "publica", "privada");
  });

  it("un celular caducado (410/404) se reporta para limpiarlo; otros errores no tumban el resto", async () => {
    mocks.enviar
      .mockRejectedValueOnce(Object.assign(new Error("Gone"), { statusCode: 410 }))
      .mockRejectedValueOnce(Object.assign(new Error("Server"), { statusCode: 500 }))
      .mockResolvedValueOnce({ statusCode: 201 });
    const consola = vi.spyOn(console, "error").mockImplementation(() => {});
    const { enviarAviso } = await import("./servidor");
    const r = await enviarAviso(destinos, avisoDePrueba());
    expect(r.enviados).toBe(1);
    expect(r.caducados).toEqual([destinos[0].endpoint]);
    consola.mockRestore();
  });

  it("sin llaves VAPID no manda nada ni falla", async () => {
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    const { avisosConfigurados, enviarAviso } = await import("./servidor");
    expect(avisosConfigurados()).toBe(false);
    expect(await enviarAviso(destinos, avisoDePrueba())).toEqual({ enviados: 0, caducados: [] });
    expect(mocks.enviar).not.toHaveBeenCalled();
  });

  it("sin destinos no hace nada", async () => {
    const { enviarAviso } = await import("./servidor");
    expect(await enviarAviso([], avisoDePrueba())).toEqual({ enviados: 0, caducados: [] });
    expect(mocks.enviar).not.toHaveBeenCalled();
  });
});
