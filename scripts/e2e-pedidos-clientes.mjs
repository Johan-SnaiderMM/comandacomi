/**
 * Prueba de punta a punta de los pedidos en línea y la plancha, con un Chrome real y TRES "celulares" distintos
 * (cada uno con sus propias cookies, como aparatos aparte):
 *
 *   · cliente  → sin cuenta: abre el enlace público, pide, y sigue su pedido en vivo.
 *   · dueño    → con sesión (la demo): recibe la alerta, acepta o rechaza.
 *   · cocina   → con sesión: el panel de la plancha, marca platos listos.
 *
 * Recorre: abrir el enlace → pedir a domicilio → alerta al dueño → aceptar con tiempo → la plancha marca plato por
 * plato → el cliente ve el avance → "listo" → entregado → (otro pedido) rechazado con motivo → (otro) cancelado por el
 * cliente → restaurante cerrado. Además comprueba lo que NO debe pasar (un visitante entrando a lo del personal, o
 * leyendo pedidos ajenos) y que las pantallas del cliente caben en 360×640 y 390×844 sin desbordar.
 *
 *   npm run e2e:clientes
 *
 * Usa la app en desarrollo con una base local aparte (.local-e2e/clientes). Necesita Chrome instalado (CHROME_PATH para
 * otra ruta). Las capturas van a e2e-capturas/clientes-*.png.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import webpush from "web-push";

const CAPTURAS = path.resolve("e2e-capturas");
const CHROME =
  process.env.CHROME_PATH ??
  ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome"].find((r) => fs.existsSync(r));

if (!CHROME) {
  console.error("No se encontró Chrome. Define CHROME_PATH con la ruta del ejecutable.");
  process.exit(2);
}
fs.mkdirSync(CAPTURAS, { recursive: true });

// Llaves de avisos solo para esta prueba (generadas al vuelo; no son las de producción).
const VAPID = webpush.generateVAPIDKeys();

const PUERTO = Number(process.env.E2E_PUERTO ?? 3202);
const BASE = `http://localhost:${PUERTO}`;

// ------------------------------------------------------------------------------------------------ utilidades
let navegador;
let servidor;
let n = 0;
const log = (m) => console.log(`  ✓ ${m}`);
const captura = (page, nombre) => page.screenshot({ path: path.join(CAPTURAS, `clientes-${String(++n).padStart(2, "0")}-${nombre}.png`) });

const esperar = async (cond, ms = 20000, cada = 200) => {
  const fin = Date.now() + ms;
  let ultimo;
  while (Date.now() < fin) {
    try {
      const r = await cond();
      if (r) return r;
    } catch (e) {
      ultimo = e;
    }
    await new Promise((r) => setTimeout(r, cada));
  }
  throw new Error("Tiempo agotado esperando una condición" + (ultimo ? `: ${ultimo.message}` : ""));
};

function levantar(comando, args, env) {
  let registro = "";
  const hijo = spawn(process.execPath, [comando, ...args], { env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", ...env }, stdio: ["ignore", "pipe", "pipe"] });
  hijo.stdout.on("data", (d) => (registro += d));
  hijo.stderr.on("data", (d) => (registro += d));
  hijo.registro = () => registro;
  return hijo;
}

async function esperarServidor(hijo) {
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(BASE + "/offline.html")).ok) return;
    } catch {
      // todavía no arranca
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("El servidor no arrancó:\n" + hijo.registro().slice(-2000));
}

function detener(hijo) {
  hijo?.kill();
  if (hijo?.pid && process.platform === "win32") spawnSync("taskkill", ["/pid", String(hijo.pid), "/T", "/F"], { stdio: "ignore" });
}

/** Un "celular": contexto aparte (cookies y almacenamiento propios). */
async function celular(ancho = 390, alto = 844) {
  const contexto = await navegador.newContext({ viewport: { width: ancho, height: alto }, hasTouch: true, locale: "es-CO", timezoneId: "America/Bogota" });
  const errores = [];
  const pagina = await contexto.newPage();
  pagina.on("pageerror", (e) => errores.push(e.message));
  return { contexto, pagina, errores };
}

/** El dev server compila cada ruta la primera vez: se da margen y se reintenta si cae en la pantalla de "no existe". */
async function ir(page, ruta, { hidratar = true } = {}) {
  await page.goto(BASE + ruta, { waitUntil: "domcontentloaded", timeout: 150000 });
  if (hidratar) {
    // Antes de que React "active" la página, los botones no responden (como en un celular lento): se espera a que
    // algún elemento ya tenga sus manejadores para no hacer clic en el vacío.
    await page
      .waitForFunction(
        () => {
          for (const el of document.querySelectorAll("button, a, input, main, header")) {
            if (Object.keys(el).some((k) => k.startsWith("__reactProps") || k.startsWith("__reactFiber"))) return true;
          }
          return false;
        },
        undefined,
        { timeout: 30000 }
      )
      .catch(() => {});
  }
}

/**
 * Revisa una pantalla: sin scroll horizontal y con los objetivos táctiles de al menos 44 px (el diseño pide 48).
 * Devuelve lo que encontró para registrar.
 */
async function auditarPantalla(page, nombre, { estricto = true } = {}) {
  const r = await page.evaluate(() => {
    const ancho = document.documentElement.clientWidth;
    const desborda = document.documentElement.scrollWidth > ancho + 1;
    const chicos = [];
    const interactivos = document.querySelectorAll("button, a[href], input:not([type=hidden]), select, textarea, [role=radio]");
    for (const el of interactivos) {
      if (el.closest("[aria-hidden='true']")) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const estilo = getComputedStyle(el);
      if (estilo.visibility === "hidden" || estilo.display === "none") continue;
      // los enlaces dentro de un párrafo de texto corrido no cuentan (son texto)
      if (el.tagName === "A" && el.closest("p") && rect.height < 30) continue;
      if (rect.height < 44 || rect.width < 44) {
        chicos.push(`${el.tagName.toLowerCase()} «${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30)}» ${Math.round(rect.width)}×${Math.round(rect.height)}`);
      }
    }
    return { ancho, desborda, chicos };
  });
  assert.equal(r.desborda, false, `${nombre}: la pantalla desborda horizontalmente (ancho ${r.ancho})`);
  if (estricto) assert.deepEqual(r.chicos, [], `${nombre}: objetivos táctiles menores de 44 px`);
  else if (r.chicos.length > 0) console.log(`  · ${nombre}: ${r.chicos.length} objetivo(s) menores de 44 px (solo se informa): ${r.chicos.join("; ")}`);
  return r;
}

// ======================================================================================================= prueba
async function correr() {
  console.log("\n══ Pedidos en línea y plancha · desarrollo con base local ══");
  fs.rmSync(path.resolve(".local-e2e/clientes"), { recursive: true, force: true });
  servidor = levantar("node_modules/next/dist/bin/next", ["dev", "-p", String(PUERTO)], {
    DEMO_BD: "local",
    DEMO_BD_DIR: ".local-e2e/clientes",
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: VAPID.publicKey,
    VAPID_PRIVATE_KEY: VAPID.privateKey,
    VAPID_SUBJECT: "https://comandacomi.com",
  });
  await esperarServidor(servidor);
  console.log("Servidor listo.");

  const dueno = await celular(390, 844);
  const cocina = await celular(390, 844);
  const cliente = await celular(360, 640);
  const todos = [dueno, cocina, cliente];

  // ---------------------------------------------------------------------------------------------- 1. el dueño
  console.log("\n1. El dueño entra, abre los pedidos en línea y obtiene el enlace");
  await ir(dueno.pagina, "/");
  await dueno.pagina.getByRole("button", { name: "Entrar a la demo" }).click();
  await dueno.pagina.waitForURL("**/inicio", { timeout: 120000 });
  await dueno.pagina.getByRole("link", { name: /En línea/ }).first().waitFor();
  log("el inicio tiene los atajos «Plancha» y «En línea»");

  await ir(dueno.pagina, "/pedidos-en-linea");
  await dueno.pagina.getByRole("heading", { name: "Recibiendo pedidos" }).waitFor({ timeout: 60000 });
  const enlace = await dueno.pagina.getByLabel("Enlace para pedir en línea").inputValue();
  const slug = /\/pedir\/([a-z0-9-]+)$/.exec(enlace)?.[1];
  assert.ok(slug, `el enlace debe terminar en /pedir/<nombre>: ${enlace}`);
  assert.equal(slug, "picnic-delicias");
  log(`enlace público: ${enlace}`);
  await dueno.pagina.getByRole("button", { name: /Código QR/ }).click();
  await dueno.pagina.getByRole("img", { name: /Código QR para pedir en línea/ }).waitFor({ timeout: 30000 });
  const celdas = await dueno.pagina.getByRole("img", { name: /Código QR/ }).locator("path").getAttribute("d");
  assert.ok(celdas && celdas.length > 200, "el QR debe tener módulos dibujados");
  log("el código QR se genera");
  await captura(dueno.pagina, "dueno-pedidos-en-linea");
  await dueno.pagina.getByRole("button", { name: "Cerrar" }).click();
  await auditarPantalla(dueno.pagina, "pedidos en línea 390×844");
  await dueno.pagina.setViewportSize({ width: 360, height: 640 });
  await auditarPantalla(dueno.pagina, "pedidos en línea 360×640");
  await captura(dueno.pagina, "dueno-pedidos-en-linea-360");
  await dueno.pagina.setViewportSize({ width: 390, height: 844 });
  // El servidor de desarrollo compila cada ruta la primera vez (en esta máquina tarda): se calientan las del personal.
  for (const ruta of ["/pedidos", "/plancha", "/inicio"]) {
    await ir(dueno.pagina, ruta);
    await dueno.pagina.waitForLoadState("load", { timeout: 150000 });
  }
  log("rutas del personal compiladas");

  // ------------------------------------------------------------------------------ 2. lo que NO debe pasar
  console.log("\n2. Un visitante sin cuenta no entra a lo del personal ni lee datos ajenos");
  for (const ruta of ["/plancha", "/pedidos", "/pedidos-en-linea", "/inicio"]) {
    await ir(cliente.pagina, ruta);
    await cliente.pagina.waitForURL(`${BASE}/`, { timeout: 30000 });
  }
  log("/plancha, /pedidos, /pedidos-en-linea e /inicio lo devuelven a la portada");
  for (const ruta of ["/api/plancha", "/api/clientes/por-confirmar"]) {
    const r = await cliente.contexto.request.get(BASE + ruta);
    assert.equal(r.status(), 401, `${ruta} sin sesión debe dar 401`);
  }
  log("las consultas del personal responden 401 sin sesión");
  const raro = await cliente.contexto.request.get(`${BASE}/api/seguimiento/00000000-0000-4000-8000-000000000000`);
  assert.equal(raro.status(), 404);
  assert.equal((await cliente.contexto.request.get(`${BASE}/api/seguimiento/no-es-un-codigo`)).status(), 400);
  log("un código de seguimiento inexistente da 404 y uno mal formado 400");
  const noExiste = await cliente.pagina.goto(`${BASE}/pedir/no-existe-este-local`);
  assert.equal(noExiste.status(), 404);
  log("un enlace de restaurante que no existe da 404");

  // ------------------------------------------------------------------------- 3. el cliente pide a domicilio
  console.log("\n3. El cliente abre el enlace y pide a domicilio");
  await ir(cliente.pagina, `/pedir/${slug}`);
  await cliente.pagina.getByRole("heading", { level: 1, name: /Picnic Delicias/i }).waitFor({ timeout: 60000 });
  assert.equal(await cliente.pagina.getByRole("link", { name: "Pendientes" }).count(), 0, "el cliente no ve la navegación del personal");
  const hrefManifiesto = await cliente.pagina.locator("link[rel=manifest]").getAttribute("href");
  assert.equal(hrefManifiesto, `/pedir/${slug}/manifest.webmanifest`, "el panel del cliente usa su propio manifiesto");
  const manifiesto = await (await cliente.contexto.request.get(BASE + hrefManifiesto)).json();
  assert.equal(manifiesto.start_url, `/pedir/${slug}`);
  assert.equal(manifiesto.name, "Picnic Delicias");
  log("el manifiesto propio abre el panel de pedir (no la app del personal)");
  await cliente.pagina.getByRole("button", { name: "Agregar Hamburguesa sencilla" }).click();
  await cliente.pagina.getByRole("button", { name: "Más Hamburguesa sencilla" }).click();
  await cliente.pagina.getByRole("button", { name: "Agregar Perro caliente" }).click();
  const barra = cliente.pagina.getByRole("button", { name: /^Ver mi pedido · 3 platos/ });
  await barra.waitFor();
  const totalTexto = /\$\s?[\d.]+/.exec(await barra.innerText())[0];
  log(`3 platos en el pedido, total ${totalTexto}`);
  await captura(cliente.pagina, "cliente-menu");
  const auditMenu = await auditarPantalla(cliente.pagina, "menú del cliente 360×640");
  log(`menú a 360×640: sin desborde horizontal ni objetivos pequeños (${auditMenu.chicos.length})`);

  await barra.click();
  await cliente.pagina.getByRole("radio", { name: "Domicilio" }).click();
  // sin datos no se puede enviar
  assert.equal(await cliente.pagina.getByRole("button", { name: /^Enviar pedido/ }).isDisabled(), true);
  await cliente.pagina.getByLabel("Tu nombre").fill("Camila Prueba");
  await cliente.pagina.getByLabel(/Tu celular/).fill("300 123 4567");
  await cliente.pagina.getByLabel(/Dirección/).fill("Cra 7 #8-9, barrio Centro");
  await cliente.pagina.getByLabel(/Algo más/).fill("Casa azul, tocar el timbre");
  await captura(cliente.pagina, "cliente-hoja-pedido");
  await auditarPantalla(cliente.pagina, "hoja del pedido 360×640");
  await cliente.pagina.getByRole("button", { name: /^Enviar pedido/ }).click();
  await cliente.pagina.waitForURL(/\/seguimiento\/[0-9a-f-]{36}$/, { timeout: 60000 });
  const urlSeguimiento = cliente.pagina.url();
  await cliente.pagina.getByRole("heading", { name: "Esperando confirmación" }).waitFor();
  await cliente.pagina.getByText("Camila Prueba").waitFor();
  await cliente.pagina.getByText("Cra 7 #8-9, barrio Centro").waitFor();
  log("pedido enviado: el cliente ve «Esperando confirmación» con sus datos");
  await captura(cliente.pagina, "cliente-esperando");
  await auditarPantalla(cliente.pagina, "seguimiento 360×640");
  const numero = /Pedido #(\d+)/i.exec(await cliente.pagina.locator("header").innerText())[1];
  log(`el pedido es el #${numero}`);

  // Las cuatro pantallas se ven bien también en 390×844.
  await cliente.pagina.setViewportSize({ width: 390, height: 844 });
  await auditarPantalla(cliente.pagina, "seguimiento 390×844");
  await cliente.pagina.setViewportSize({ width: 360, height: 640 });

  // ----------------------------------------------------------------------------- 4. la alerta del dueño
  console.log("\n4. El dueño recibe la alerta y acepta con un tiempo estimado");
  const alerta = dueno.pagina.getByRole("alert").filter({ hasText: "¡Pedido nuevo!" });
  await alerta.waitFor({ timeout: 40000 });
  await alerta.getByText(new RegExp(`Pedido #${numero} · Domicilio`)).waitFor();
  log("aparece la alerta «¡Pedido nuevo!» en la pantalla del dueño, sin que toque nada");
  await captura(dueno.pagina, "dueno-alerta");
  assert.ok((await dueno.pagina.title()).length > 0);
  await alerta.getByRole("link", { name: "Ver y aceptar" }).click();
  await dueno.pagina.waitForURL("**/pedidos", { timeout: 150000 });
  const tarjeta = dueno.pagina.locator("li", { hasText: "Cliente en línea" }).filter({ hasText: `#${numero}` });
  await tarjeta.waitFor({ timeout: 30000 });
  for (const texto of ["Camila Prueba", "Cra 7 #8-9, barrio Centro", "Casa azul, tocar el timbre", "Hamburguesa sencilla", "Perro caliente"]) {
    await tarjeta.getByText(texto).first().waitFor();
  }
  await tarjeta.getByText(totalTexto.replace(/\s/g, " ")).first().waitFor();
  log("la tarjeta del pedido muestra cliente, dirección, nota, platos y total");
  await captura(dueno.pagina, "dueno-por-confirmar");
  await auditarPantalla(dueno.pagina, "pendientes con pedido por confirmar 390×844", { estricto: false });
  await dueno.pagina.setViewportSize({ width: 360, height: 640 });
  await auditarPantalla(dueno.pagina, "pendientes con pedido por confirmar 360×640", { estricto: false });
  await captura(dueno.pagina, "dueno-por-confirmar-360");
  await dueno.pagina.setViewportSize({ width: 390, height: 844 });

  // Mientras no se acepte, la cocina no lo ve.
  await ir(cocina.pagina, "/");
  await cocina.pagina.getByRole("button", { name: "Entrar a la demo" }).click();
  await cocina.pagina.waitForURL("**/inicio", { timeout: 120000 });
  await ir(cocina.pagina, "/plancha");
  await cocina.pagina.getByRole("heading", { name: "Plancha" }).waitFor({ timeout: 60000 });
  assert.equal(await cocina.pagina.getByText("Domicilio · Camila Prueba").count(), 0, "antes de aceptar no debe estar en la plancha");
  log("antes de aceptarlo, el pedido NO aparece en la plancha");

  await tarjeta.getByRole("button", { name: "Aceptar" }).click();
  await dueno.pagina.getByRole("button", { name: "20 min" }).click();
  await dueno.pagina.getByText(new RegExp(`Pedido #${numero} aceptado`)).waitFor({ timeout: 30000 });
  await esperar(async () => (await alerta.count()) === 0, 20000);
  log("aceptado con 20 min: la alerta se apaga");

  await cliente.pagina.getByRole("heading", { name: "Lo están preparando" }).waitFor({ timeout: 30000 });
  await cliente.pagina.getByText(/Listo en unos\s*(19|20)\s*min/).waitFor();
  log("el cliente ve «Lo están preparando» con el tiempo estimado, sin recargar");
  await captura(cliente.pagina, "cliente-preparando");

  // ------------------------------------------------------------------------------ 5. la plancha
  console.log("\n5. La plancha marca plato por plato y el cliente lo ve en vivo");
  const pedidoPlancha = cocina.pagina.locator("li", { hasText: "Domicilio · Camila Prueba" }).filter({ hasText: `#${numero}` });
  await pedidoPlancha.waitFor({ timeout: 30000 });
  assert.equal(await pedidoPlancha.getByRole("button", { pressed: true }).count(), 0);
  await captura(cocina.pagina, "cocina-plancha");
  await auditarPantalla(cocina.pagina, "plancha 390×844");
  await cocina.pagina.setViewportSize({ width: 360, height: 640 });
  await auditarPantalla(cocina.pagina, "plancha 360×640");
  await captura(cocina.pagina, "cocina-plancha-360");
  await cocina.pagina.setViewportSize({ width: 390, height: 844 });
  log("tras aceptar, el pedido aparece en la plancha, sin marcar");

  const hamburguesa = pedidoPlancha.getByRole("button", { name: /Hamburguesa sencilla/ });
  await hamburguesa.click();
  await esperar(async () => (await hamburguesa.getAttribute("aria-pressed")) === "true");
  await cliente.pagina.getByText(/2 de 3 listos/).first().waitFor({ timeout: 30000 });
  log("la cocina marca las hamburguesas: el cliente ve «2 de 3 listos»");
  await captura(cliente.pagina, "cliente-avance");

  await pedidoPlancha.getByRole("button", { name: /Todo listo/ }).click();
  await cliente.pagina.getByRole("heading", { name: "¡Tu pedido está listo!" }).waitFor({ timeout: 30000 });
  await cliente.pagina.getByText(/Sale hacia tu dirección/).first().waitFor();
  log("al marcar todo listo, el cliente ve «¡Tu pedido está listo!» (domicilio: sale hacia su dirección)");
  await captura(cliente.pagina, "cliente-listo");

  await esperar(async () => (await cocina.pagina.getByRole("region", { name: "Listos hace poco" }).count()) > 0, 20000);
  log("en la plancha el pedido pasa a «Listos hace poco»");

  // ------------------------------------------------------------------------------ 6. entregado
  console.log("\n6. El dueño lo entrega y el seguimiento termina");
  await ir(dueno.pagina, "/pedidos");
  const enLista = dueno.pagina.locator("li", { hasText: `#${numero}` }).filter({ hasText: "Camila Prueba" });
  await enLista.waitFor({ timeout: 30000 });
  await enLista.getByRole("button", { name: "Entregado", exact: true }).click();
  await cliente.pagina.getByRole("heading", { name: "Pedido entregado" }).waitFor({ timeout: 30000 });
  log("el dueño marca «Entregado» y el cliente ve «Pedido entregado»");
  await captura(cliente.pagina, "cliente-entregado");

  // El seguimiento terminado deja de consultar al servidor.
  let consultas = 0;
  cliente.pagina.on("request", (r) => {
    if (r.url().includes("/api/seguimiento/")) consultas++;
  });
  await new Promise((r) => setTimeout(r, 12000));
  assert.equal(consultas, 0, "un pedido entregado no debe seguir consultando al servidor");
  log("terminado el pedido, la pantalla deja de consultar (no gasta datos)");
  const enCurso = await cliente.pagina.evaluate((s) => localStorage.getItem(`pedido-en-curso:${s}`), slug);
  assert.equal(enCurso, null, "un pedido terminado ya no es 'en curso'");

  // ------------------------------------------------------------------------------ 7. rechazado
  console.log("\n7. Un pedido que el restaurante rechaza");
  await ir(cliente.pagina, `/pedir/${slug}`);
  await cliente.pagina.getByRole("button", { name: "Agregar Perro caliente" }).click();
  await cliente.pagina.getByRole("button", { name: /^Ver mi pedido/ }).click();
  await cliente.pagina.getByLabel("Tu nombre").fill("Camila Prueba");
  await cliente.pagina.getByLabel(/Tu celular/).fill("300 123 4567");
  await cliente.pagina.getByRole("button", { name: /^Enviar pedido/ }).click();
  await cliente.pagina.waitForURL(/\/seguimiento\//, { timeout: 60000 });
  const numero2 = /Pedido #(\d+)/i.exec(await cliente.pagina.locator("header").innerText())[1];
  await cliente.pagina.getByText(/Para recoger/).first().waitFor();
  await ir(dueno.pagina, "/pedidos");
  const tarjeta2 = dueno.pagina.locator("li", { hasText: "Cliente en línea" }).filter({ hasText: `#${numero2}` });
  await tarjeta2.waitFor({ timeout: 40000 });
  await tarjeta2.getByRole("button", { name: "Rechazar" }).click();
  await dueno.pagina.getByRole("button", { name: "Se acabó un ingrediente" }).click();
  await dueno.pagina.getByRole("button", { name: "Rechazar pedido" }).click();
  await dueno.pagina.getByText(new RegExp(`Pedido #${numero2} rechazado`)).waitFor({ timeout: 30000 });
  await cliente.pagina.getByRole("heading", { name: "Pedido cancelado" }).waitFor({ timeout: 30000 });
  await cliente.pagina.getByText(/Motivo: Se acabó un ingrediente/).waitFor();
  log("rechazado con motivo: el cliente ve «Pedido cancelado» y el motivo");
  await captura(cliente.pagina, "cliente-rechazado");

  // ------------------------------------------------------------------------- 8. cancelado por el cliente
  console.log("\n8. El cliente se arrepiente antes de que lo acepten");
  await ir(cliente.pagina, `/pedir/${slug}`);
  await cliente.pagina.getByRole("button", { name: "Agregar Gaseosa personal" }).click();
  await cliente.pagina.getByRole("button", { name: /^Ver mi pedido/ }).click();
  await cliente.pagina.getByLabel("Tu nombre").fill("Otro Cliente");
  await cliente.pagina.getByLabel(/Tu celular/).fill("320 777 1234");
  await cliente.pagina.getByRole("button", { name: /^Enviar pedido/ }).click();
  await cliente.pagina.waitForURL(/\/seguimiento\//, { timeout: 60000 });
  await cliente.pagina.getByRole("button", { name: "Cancelar pedido" }).click();
  await cliente.pagina.getByRole("button", { name: "Sí, cancelar mi pedido" }).click();
  await cliente.pagina.getByRole("heading", { name: "Pedido cancelado" }).waitFor({ timeout: 30000 });
  await cliente.pagina.getByText(/Cancelaste tu pedido/).waitFor();
  log("el cliente cancela mientras espera: queda cancelado");
  const resumen = await dueno.contexto.request.get(`${BASE}/api/clientes/por-confirmar`);
  const datosResumen = await resumen.json();
  assert.equal(datosResumen.cantidad, 0, "no queda nada por confirmar");
  log("al dueño no le queda nada por confirmar");

  // ------------------------------------------------------------------------------------ 9. cerrado
  console.log("\n9. El dueño cierra los pedidos en línea");
  await ir(dueno.pagina, "/pedidos-en-linea");
  await dueno.pagina.getByRole("button", { name: "Dejar de recibir pedidos" }).click();
  await dueno.pagina.getByRole("heading", { name: "Pedidos cerrados" }).waitFor({ timeout: 30000 });
  await ir(cliente.pagina, `/pedir/${slug}`);
  await cliente.pagina.getByText(/no está recibiendo pedidos en línea/).waitFor();
  assert.equal(await cliente.pagina.getByRole("button", { name: /^Agregar/ }).count(), 0, "cerrado: no hay botones de agregar");
  log("cerrado: el cliente ve el aviso y no puede agregar platos");
  await captura(cliente.pagina, "cliente-cerrado");
  await dueno.pagina.getByRole("button", { name: "Empezar a recibir pedidos" }).click();
  await dueno.pagina.getByRole("heading", { name: "Recibiendo pedidos" }).waitFor({ timeout: 30000 });
  log("el dueño vuelve a abrir los pedidos");

  // ------------------------------------------------------------------------------------ 10. el celular del cliente
  console.log("\n10. Lo que no debe haber en el celular del cliente");
  const claves = await cliente.pagina.evaluate(() => Object.keys(localStorage));
  assert.ok(!claves.some((k) => k.startsWith("sc:")), `el cliente no debe tener copia ni cola del personal: ${claves.join(", ")}`);
  const registros = await cliente.pagina.evaluate(async () => (await navigator.serviceWorker?.getRegistrations?.())?.length ?? 0);
  assert.equal(registros, 0, "el cliente no debe tener service worker");
  log("sin copia local, cola ni service worker del personal en el celular del cliente");

  // ---------------------------------------------------------------------------------- 11. avisos push
  console.log("\n11. Avisos push: los celulares se suscriben y el servidor intenta avisarles");
  // El servicio de avisos del navegador (FCM) no se puede usar en una prueba: se simula la suscripción con un
  // destino que no existe (.invalid). Lo que se comprueba es TODO lo nuestro: guardar, leer, y que el servidor intente enviar.
  const falsoPush = (tipo) => {
    const clave = "e2e-push";
    const crear = () => ({
      endpoint: `https://push.invalid/e2e/${tipo}`,
      toJSON() {
        return {
          endpoint: this.endpoint,
          keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" },
        };
      },
      async unsubscribe() {
        sessionStorage.removeItem(clave);
        return true;
      },
    });
    PushManager.prototype.subscribe = async () => {
      sessionStorage.setItem(clave, "1");
      return crear();
    };
    PushManager.prototype.getSubscription = async () => (sessionStorage.getItem(clave) ? crear() : null);
  };
  await dueno.contexto.grantPermissions(["notifications"], { origin: BASE });
  await cliente.contexto.grantPermissions(["notifications"], { origin: BASE });
  await dueno.contexto.addInitScript(falsoPush, "personal");
  await cliente.contexto.addInitScript(falsoPush, "cliente");
  const avisosFallidos = () => (servidor.registro().match(/\[avisos\] no se pudo avisar/g) ?? []).length;

  await ir(dueno.pagina, "/mas");
  const seccion = dueno.pagina.getByRole("region", { name: "Avisos en este celular" });
  await seccion.waitFor({ timeout: 60000 });
  for (const t of ["Pedidos nuevos de clientes", "Pedidos a la plancha", "Pedidos listos"]) await seccion.getByText(t).waitFor();
  await captura(dueno.pagina, "dueno-avisos");
  await auditarPantalla(dueno.pagina, "Más con avisos 390×844", { estricto: false });
  await seccion.getByRole("button", { name: "Activar avisos" }).click();
  await seccion.getByText("Avisos activados en este celular.").waitFor({ timeout: 150000 });
  log("el dueño activa los avisos (pedidos nuevos y listos) y quedan guardados");

  await ir(dueno.pagina, "/mas");
  await seccion.getByRole("button", { name: "Probar aviso" }).waitFor({ timeout: 60000 });
  log("al volver a entrar, la base recuerda los avisos de ese celular");
  await seccion.getByRole("button", { name: "Probar aviso" }).click();
  await seccion.getByText(/No se pudo mandar el aviso de prueba/).waitFor({ timeout: 40000 });
  log("«Probar aviso»: el servidor intenta enviarlo con las llaves y, como el destino es falso, lo informa");

  // Un cliente pide y se suscribe a SU pedido.
  const antes = avisosFallidos();
  await ir(cliente.pagina, `/pedir/${slug}`);
  await cliente.pagina.getByRole("button", { name: "Agregar Perro caliente" }).click();
  await cliente.pagina.getByRole("button", { name: /^Ver mi pedido/ }).click();
  await cliente.pagina.getByLabel("Tu nombre").fill("Camila Prueba");
  await cliente.pagina.getByLabel(/Tu celular/).fill("301 555 0101");
  await cliente.pagina.getByRole("button", { name: /^Enviar pedido/ }).click();
  await cliente.pagina.waitForURL(/\/seguimiento\//, { timeout: 60000 });
  await esperar(async () => avisosFallidos() > antes, 40000);
  log("un pedido nuevo hace que el servidor intente avisar al dueño (aunque tenga la app cerrada)");

  await cliente.pagina.getByRole("button", { name: "Avísame cuando esté listo" }).click();
  await cliente.pagina.getByText(/te avisamos en este celular/).waitFor({ timeout: 60000 });
  log("el cliente activa «Avísame cuando esté listo» con su pedido");

  const numero3 = /Pedido #(\d+)/i.exec(await cliente.pagina.locator("header").innerText())[1];
  const antesAceptar = avisosFallidos();
  await ir(dueno.pagina, "/pedidos");
  const tarjeta3 = dueno.pagina.locator("li", { hasText: "Cliente en línea" }).filter({ hasText: `#${numero3}` });
  await tarjeta3.waitFor({ timeout: 40000 });
  await tarjeta3.getByRole("button", { name: "Aceptar" }).click();
  await dueno.pagina.getByRole("button", { name: "10 min" }).click();
  await dueno.pagina.getByText(new RegExp(`Pedido #${numero3} aceptado`)).waitFor({ timeout: 30000 });
  await esperar(async () => avisosFallidos() > antesAceptar, 40000);
  log("al aceptar, el servidor intenta avisar al cliente de ESE pedido");

  // Quitar los avisos desde el celular del dueño.
  await ir(dueno.pagina, "/mas");
  await seccion.getByRole("button", { name: "Desactivar en este celular" }).click();
  await seccion.getByRole("button", { name: "Activar avisos" }).waitFor({ timeout: 30000 });
  log("el dueño desactiva los avisos de su celular");

  // ------------------------------------------------------------------- 12. los avisos no se quedan para siempre
  console.log("\n12. Avisos push: reiniciar la demo y salir dan de baja los celulares");
  await cocina.contexto.grantPermissions(["notifications"], { origin: BASE });
  await cocina.contexto.addInitScript(falsoPush, "cocina");
  const seccionDe = (pagina) => pagina.getByRole("region", { name: "Avisos en este celular" });
  const activarAvisosEn = async (c) => {
    await ir(c.pagina, "/mas");
    await seccionDe(c.pagina).getByRole("button", { name: "Activar avisos" }).click();
    await seccionDe(c.pagina).getByText("Avisos activados en este celular.").waitFor({ timeout: 150000 });
  };
  /**
   * ¿La base todavía tiene los avisos de ese celular? Se finge que el navegador sigue suscrito (misma dirección) y se
   * mira qué dice "Más": con los avisos guardados ofrece "Probar aviso"; sin ellos, "Activar avisos".
   */
  const sigueEnLaBase = async (c) => {
    await c.pagina.evaluate(() => sessionStorage.setItem("e2e-push", "1"));
    await ir(c.pagina, "/mas");
    const s = seccionDe(c.pagina);
    const probar = s.getByRole("button", { name: "Probar aviso" });
    const activar = s.getByRole("button", { name: "Activar avisos" });
    await esperar(async () => (await probar.count()) > 0 || ((await activar.count()) > 0 && (await activar.isEnabled())), 60000);
    return (await probar.count()) > 0;
  };

  await activarAvisosEn(dueno);
  await activarAvisosEn(cocina);
  assert.equal(await sigueEnLaBase(dueno), true);
  assert.equal(await sigueEnLaBase(cocina), true);
  log("dos celulares (dueño y cocina) tienen avisos activos");

  // El dueño reinicia la demo desde SU celular (con el mismo nombre, para no cambiar el enlace).
  await dueno.pagina.getByRole("button", { name: /Reiniciar demo/ }).click();
  await dueno.pagina.getByLabel("Nombre del restaurante que vas a visitar").fill("Picnic Delicias");
  await dueno.pagina.getByRole("button", { name: "Sí, reiniciar la demo" }).click();
  await dueno.pagina.waitForURL(/\/inicio\?reiniciada=1/, { timeout: 150000 });
  assert.equal(await sigueEnLaBase(dueno), true, "quien reinicia conserva sus avisos");
  assert.equal(await sigueEnLaBase(cocina), false, "los demás celulares quedan dados de baja");
  log("reiniciar la demo da de baja los celulares de la visita anterior y conserva el de quien reinicia");

  // Salir de la sesión: ese celular deja de recibir avisos.
  await dueno.pagina.getByRole("button", { name: "Salir de la demo" }).click();
  await dueno.pagina.getByRole("button", { name: "Entrar a la demo" }).waitFor({ timeout: 60000 });
  await dueno.pagina.getByRole("button", { name: "Entrar a la demo" }).click();
  await dueno.pagina.waitForURL("**/inicio", { timeout: 120000 });
  assert.equal(await sigueEnLaBase(dueno), false, "al salir, la base ya no tiene los avisos de ese celular");
  log("salir de la sesión da de baja los avisos de ese celular");

  for (const c of todos) assert.deepEqual(c.errores, [], "sin errores de JavaScript en la página");
  log("sin errores de JavaScript durante toda la prueba");
  void urlSeguimiento;
  for (const c of todos) await c.contexto.close();
  detener(servidor);
  servidor = null;
}

// =========================================================================================================== main
let codigo = 0;
try {
  navegador = await chromium.launch({ executablePath: CHROME, headless: true });
  await correr();
  console.log("\nTODO BIEN: pedidos en línea y plancha funcionan de punta a punta.");
} catch (e) {
  codigo = 1;
  console.error("\nFALLÓ:", e.message);
  console.error(e.stack?.split("\n").slice(1, 6).join("\n"));
  try {
    const paginas = navegador?.contexts().flatMap((c) => c.pages()) ?? [];
    for (const [i, p] of paginas.entries()) {
      await p.screenshot({ path: path.join(CAPTURAS, `clientes-fallo-${i}.png`) });
      console.error(`Página ${i}: ${p.url()}`);
      console.error("  texto:", (await p.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 300));
    }
    if (servidor) console.error("Registro del servidor (final):\n" + servidor.registro().slice(-1500));
  } catch {
    // sin captura
  }
} finally {
  await navegador?.close().catch(() => {});
  detener(servidor);
  setTimeout(() => process.exit(codigo), 500);
}
