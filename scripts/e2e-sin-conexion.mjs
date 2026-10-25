/**
 * Prueba de punta a punta del trabajo sin conexión, con un Chrome real.
 *
 *   npm run e2e              las dos fases
 *   E2E_FASE=dev npm run e2e     solo la fase 1
 *   E2E_FASE=prod npm run e2e    solo la fase 2
 *
 * FASE 1 · "dev": la app en desarrollo con una base local aparte (.local-e2e). Entra a la demo, deja que el celular
 *   guarde la copia, CORTA LA RED y trabaja (pedido, cobro en efectivo, fiado con cliente nuevo, abono, gasto);
 *   vuelve la red y verifica en el servidor que todo subió UNA sola vez, con número definitivo, la fecha y el
 *   teléfono bien. También prueba que un cambio que el servidor rechaza queda como "con problema" y se puede descartar.
 *
 * FASE 2 · "prod": la app compilada para producción (con service worker de verdad). Comprueba que la app sin conexión
 *   queda guardada, que abrir cualquier pantalla sin red lleva a ella, que se trabaja, que lo hecho sobrevive a
 *   recargar y a cerrar/abrir la app, y que lo que necesita señal lo explica.
 *
 * Necesita Chrome instalado (CHROME_PATH para otra ruta). Las capturas van a e2e-capturas/.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const FASE = process.env.E2E_FASE ?? "todas";
const CAPTURAS = path.resolve("e2e-capturas");
const CHROME =
  process.env.CHROME_PATH ??
  ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome"].find((r) => fs.existsSync(r));

if (!CHROME) {
  console.error("No se encontró Chrome. Define CHROME_PATH con la ruta del ejecutable.");
  process.exit(2);
}
fs.mkdirSync(CAPTURAS, { recursive: true });

// Utilidades
let navegador;
let servidor;
let n = 0;
const log = (m) => console.log(`  ✓ ${m}`);
const captura = (page, nombre) => page.screenshot({ path: path.join(CAPTURAS, `${String(++n).padStart(2, "0")}-${nombre}.png`) });

const esperar = async (cond, ms = 15000, cada = 150) => {
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

const cola = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("sc:cola") ?? '{"ops":[]}').ops);
const digitos = async (page, texto) => {
  for (const d of texto) await page.getByRole("button", { name: d, exact: true }).click();
};
const cuantos = async (page, nombre) => Number(/\((\d+)\)/.exec(await page.getByRole("radio", { name: nombre }).innerText())[1]);

function levantar(puerto, comando, args, env) {
  let registro = "";
  const hijo = spawn(process.execPath, [comando, ...args], { env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", ...env }, stdio: ["ignore", "pipe", "pipe"] });
  hijo.stdout.on("data", (d) => (registro += d));
  hijo.stderr.on("data", (d) => (registro += d));
  hijo.registro = () => registro;
  return hijo;
}

async function esperarServidor(base, hijo) {
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(base + "/sc")).ok) return;
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

async function nuevoContexto() {
  return navegador.newContext({ viewport: { width: 360, height: 640 }, hasTouch: true, locale: "es-CO", timezoneId: "America/Bogota", serviceWorkers: "allow" });
}

/** Un pedido para llevar con un plato (o dos) sin tocar la red: lo que hace el dueño con un toque en cada cosa. */
async function tomarPedidoParaLlevar(page, platos) {
  await page.getByRole("link", { name: "Tomar" }).click();
  await page.getByRole("radio", { name: "Llevar" }).click();
  await page.getByRole("button", { name: "Listo" }).click();
  for (let i = 0; i < platos; i++) await page.getByRole("button", { name: /Hamburguesa sencilla/ }).first().click();
  await page.getByRole("button", { name: "Enviar a cocina" }).click();
}

// Fase 1
async function faseDev() {
  console.log("\n══ FASE 1 · desarrollo con base local ══");
  const PUERTO = 3200;
  const BASE = `http://localhost:${PUERTO}`;
  fs.rmSync(path.resolve(".local-e2e"), { recursive: true, force: true });
  servidor = levantar(PUERTO, "node_modules/next/dist/bin/next", ["dev", "-p", String(PUERTO)], { DEMO_BD: "local", DEMO_BD_DIR: ".local-e2e" });
  await esperarServidor(BASE, servidor);
  console.log("Servidor listo.");

  const contexto = await nuevoContexto();
  const page = await contexto.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(e.message));

  console.log("\n1. Con señal: entrar y dejar la copia guardada en el celular");
  await page.goto(BASE + "/");
  await page.getByRole("button", { name: "Entrar a la demo" }).click();
  await page.waitForURL("**/inicio", { timeout: 90000 });
  await esperar(() => page.evaluate(() => !!localStorage.getItem("sc:snapshot")), 30000);
  log("entró a la demo y la copia local (menú, pedidos, clientes) quedó guardada");

  console.log("\n1b. Con señal: la app normal sigue igual (camino directo, sin cola)");
  await page.goto(BASE + "/pedido/nuevo");
  if (await page.locator("[data-pantalla='no-existe']").count()) await page.reload(); // el servidor de desarrollo compila cada ruta la primera vez
  await page.getByRole("radio", { name: "Llevar" }).click();
  await page.getByRole("button", { name: "Listo" }).click();
  await page.getByRole("button", { name: /Hamburguesa sencilla/ }).first().click();
  await page.getByRole("button", { name: "Enviar a cocina" }).click();
  await page.waitForURL(/\/pedidos\?enviado=\d+/, { timeout: 30000 });
  const numeroReal = /enviado=(\d+)/.exec(page.url())[1];
  await page.getByText(new RegExp(`Pedido #${numeroReal} enviado a cocina`)).waitFor();
  assert.equal(await page.getByText(/Sin señal/).count(), 0, "con señal no debe decir que se sube después");
  await page.locator("li", { hasText: `#${numeroReal}` }).first().getByRole("link", { name: "Cobrar" }).click();
  await page.getByRole("button", { name: "Exacto" }).click();
  await page.getByRole("button", { name: /^Cobrar · vuelto/ }).click();
  await page.getByRole("heading", { name: "Cobrado" }).waitFor();
  assert.equal(await page.getByText(/Sin señal/).count(), 0);
  assert.equal((await cola(page)).length, 0, "con señal nada pasa por la cola");
  log(`con señal: pedido #${numeroReal} tomado y cobrado directo, con su número real y sin pasar por la cola`);
  await page.goto(BASE + "/pedidos");
  const pendientesAntes = await cuantos(page, /^Pendientes/);
  const cobradosAntes = await cuantos(page, /Cobrados hoy/);
  await page.goto(BASE + "/fiado");
  const deudaAntes = await page.locator("section[aria-label='Total por cobrar'] p.cifra").innerText();
  log(`antes: ${pendientesAntes} pendientes, ${cobradosAntes} cobrados hoy, debían ${deudaAntes}`);

  await page.goto(BASE + "/sc#/pedidos"); // la app sin conexión, todavía con señal
  await page.getByRole("radio", { name: /^Pendientes/ }).waitFor();
  assert.equal(await cuantos(page, /^Pendientes/), pendientesAntes, "la app sin conexión muestra lo mismo que la normal");
  log("la app sin conexión muestra los mismos pendientes que la normal");

  console.log("\n2. Sin señal: trabajar");
  await contexto.setOffline(true);
  await page.getByText(/Sin conexión/).first().waitFor();
  log("aparece el aviso de que no hay conexión");

  await tomarPedidoParaLlevar(page, 2);
  await page.waitForURL(/#\/pedidos\?enviado=-1/);
  await page.getByText(/Pedido N1 enviado a cocina/).waitFor();
  assert.equal(await cuantos(page, /^Pendientes/), pendientesAntes + 1);
  log("pedido tomado sin red: aparece como N1 y suma a pendientes");
  await captura(page, "sin-senal-pedido-enviado");

  await page.locator("li", { hasText: "N1" }).first().getByRole("link", { name: "Cobrar" }).click();
  await page.getByRole("heading", { name: /Cobrar N1/ }).waitFor();
  await page.getByRole("button", { name: "50.000" }).click();
  await page.getByRole("button", { name: /^Cobrar · vuelto/ }).click();
  await page.getByRole("heading", { name: "Cobrado" }).waitFor();
  await page.getByText(/Sin señal: el cobro quedó guardado/).waitFor();
  log("cobro en efectivo sin red: confirmación con vuelto y aviso de que se subirá");
  await captura(page, "sin-senal-cobrado");
  await page.getByRole("link", { name: "Listo" }).click();

  await tomarPedidoParaLlevar(page, 1);
  await page.getByText(/Pedido N2 enviado a cocina/).waitFor();
  await page.locator("li", { hasText: "N2" }).first().getByRole("link", { name: "Cobrar" }).click();
  await page.getByRole("radio", { name: "Fiado" }).click();
  await page.getByRole("button", { name: /Elegir cliente/ }).click();
  await page.getByRole("button", { name: /Cliente nuevo/ }).click();
  await page.getByLabel("Nombre").fill("Don Prueba Sin Señal");
  await page.getByLabel(/WhatsApp/).fill("310 555 0199");
  await page.getByRole("button", { name: "Guardar y elegir" }).click();
  await page.getByRole("button", { name: /^Fiar/ }).click();
  await page.getByRole("heading", { name: "Cobrado" }).waitFor();
  log("pedido fiado a un cliente creado sin red");
  await page.getByRole("link", { name: "Listo" }).click();

  await page.getByRole("link", { name: "Fiado" }).click();
  const fila = page.locator("li", { hasText: "Don Prueba Sin Señal" });
  await fila.waitFor();
  await fila.getByRole("button", { name: "Abonar" }).click();
  await digitos(page, "5000");
  await page.getByRole("button", { name: /^Registrar abono de/ }).click();
  await page.getByText(/Abono de \$ 5\.000 registrado/).waitFor();
  log("abono sin red: la deuda del cliente nuevo baja");
  await captura(page, "sin-senal-fiado");

  // lo que necesita señal lo explica en vez de romperse
  await fila.getByRole("link", { name: /Don Prueba/ }).click();
  await page.getByText(/no se puede usar sin conexión/).waitFor();
  log("la ficha del cliente (necesita señal) lo explica");

  await page.evaluate(() => (location.hash = "#/gastos/nuevo"));
  await digitos(page, "7500");
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.getByRole("radio", { name: /Gas/ }).click();
  await page.getByRole("button", { name: /^Guardar gasto/ }).click();
  await page.getByText(/Gasto de \$ 7\.500 guardado/).waitFor();
  log("gasto anotado sin red");

  await page.evaluate(() => (location.hash = "#/sincronizacion"));
  await page.getByText(/Por subir \(\d+\)/).waitFor();
  const porSubir = (await cola(page)).filter((o) => o.estado === "pendiente").length;
  assert.equal(porSubir, 7, `esperaba 7 operaciones (2 pedidos, 2 cobros, cliente, abono, gasto), hay ${porSubir}`);
  log(`${porSubir} operaciones guardadas en el celular, en orden`);
  await captura(page, "sin-senal-sincronizacion");

  console.log("\n3. Vuelve la señal: todo se sube solo");
  await contexto.setOffline(false);
  await esperar(async () => (await cola(page)).length === 0, 120000);
  log("la cola quedó vacía (todo subió y la copia local se refrescó)");
  await captura(page, "con-senal-de-nuevo");

  await page.goto(BASE + "/pedidos");
  const pendientesDespues = await cuantos(page, /^Pendientes/);
  const cobradosDespues = await cuantos(page, /Cobrados hoy/);
  assert.equal(cobradosDespues, cobradosAntes + 2, "los dos pedidos hechos sin red quedaron cobrados, una sola vez");
  assert.equal(pendientesDespues, pendientesAntes + 2, "y siguen en pendientes (cobrados, sin entregar)");
  log(`servidor: ${cobradosDespues} cobrados hoy (+2) y ${pendientesDespues} pendientes (+2), sin duplicados`);
  const numeros = (await page.locator("li span.cifra.text-3xl").allInnerTexts()).filter((x) => /^[#N]\d+$/.test(x));
  assert.ok(numeros.length >= 6, `esperaba al menos 6 pedidos con número, hay ${numeros.length}`);
  assert.ok(numeros.every((x) => x.startsWith("#")), `ya no quedan números provisionales: ${numeros.join(", ")}`);
  assert.equal(new Set(numeros).size, numeros.length, "números de pedido únicos");
  log("los pedidos recibieron su número definitivo del servidor");

  await page.goto(BASE + "/fiado");
  const filaServidor = page.locator("li", { hasText: "Don Prueba Sin Señal" });
  await filaServidor.waitFor();
  assert.notEqual(await page.locator("section[aria-label='Total por cobrar'] p.cifra").innerText(), deudaAntes);
  log("el cliente creado sin red existe en el servidor con su deuda (menos el abono)");
  const telefono = await page.evaluate(() => JSON.parse(localStorage.getItem("sc:snapshot")).clientes.find((c) => c.nombre === "Don Prueba Sin Señal")?.telefono);
  assert.equal(telefono, "+573105550199");
  log("el teléfono quedó normalizado igual que en la base (+57…)");

  await page.goto(BASE + "/gastos");
  await page.getByText(/\$\s?7\.500/).first().waitFor();
  log("el gasto aparece en los gastos del día");

  console.log("\n4. Lo que el servidor rechaza queda a la vista");
  // En una página que no corre la app (así el motor no pisa lo escrito) se agrega a la cola un cambio imposible.
  await page.goto(BASE + "/offline.html");
  await page.evaluate(() => {
    const c = JSON.parse(localStorage.getItem("sc:cola") ?? '{"version":1,"siguienteLocal":1,"ops":[]}');
    c.ops.push({
      clave: crypto.randomUUID(),
      tipo: "cambiar_estado",
      datos: { pedidoId: crypto.randomUUID(), estado: "listo" },
      ocurridoEn: new Date().toISOString(),
      estado: "pendiente",
      intentos: 0,
    });
    localStorage.setItem("sc:cola", JSON.stringify(c));
  });
  await page.goto(BASE + "/sc#/inicio"); // el motor lee la cola guardada al arrancar y trata de subirla
  await page.getByText(/1 cambio no se pudo subir/).waitFor({ timeout: 60000 });
  log("un cambio rechazado por el servidor muestra el aviso rojo");
  await page.getByRole("link", { name: "Revisar" }).click();
  await page.getByText(/El pedido no existe/).waitFor();
  await captura(page, "con-problema");
  await page.getByRole("button", { name: /Descartar/ }).click();
  await esperar(async () => (await cola(page)).length === 0);
  await page.getByText(/Nada por subir|Todo está al día/).first().waitFor();
  log("se descarta y la pantalla vuelve a estar limpia");

  assert.deepEqual(errores, [], "sin errores de JavaScript en la página");
  log("sin errores de JavaScript durante toda la fase");
  await contexto.close();
  detener(servidor);
  servidor = null;
}

// Fase 2
async function faseProd() {
  console.log("\n══ FASE 2 · compilada para producción, con service worker ══");
  const PUERTO = 3201;
  const BASE = `http://localhost:${PUERTO}`;
  const construccion = spawnSync(process.execPath, ["node_modules/next/dist/bin/next", "build"], {
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_SUPABASE_URL: "https://ejemplo.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "clave-falsa-de-prueba" },
    encoding: "utf8",
  });
  assert.equal(construccion.status, 0, "la compilación de producción falló:\n" + (construccion.stdout + construccion.stderr).slice(-1500));
  assert.match(construccion.stdout, /○ \/sc/, "/sc debe ser una página estática");
  log("compila, y /sc es una página estática");

  servidor = levantar(PUERTO, "node_modules/next/dist/bin/next", ["start", "-p", String(PUERTO)], {
    NEXT_PUBLIC_SUPABASE_URL: "https://ejemplo.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "clave-falsa-de-prueba",
  });
  await esperarServidor(BASE, servidor);

  const contexto = await nuevoContexto();
  const page = await contexto.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(e.message));

  console.log("\n1. Con señal: abrir la app una vez");
  await page.goto(BASE + "/");
  await esperar(() => page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state === "activated"), 30000);
  const guardado = await esperar(async () => {
    const r = await page.evaluate(async () => ({
      sc: (await (await caches.open("sc-v2")).keys()).some((k) => k.url.endsWith("/sc")),
      estaticos: (await (await caches.open("estatico-v2")).keys()).length,
    }));
    return r.sc && r.estaticos > 8 ? r : null;
  }, 40000);
  log(`el service worker guardó la app sin conexión (/sc) y ${guardado.estaticos} archivos estáticos`);

  // la copia local la deja ProveedorSync tras iniciar sesión; aquí se siembra una igual para no depender del servidor
  const ahora = new Date().toISOString();
  await page.evaluate((guardadoEn) => {
    const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    localStorage.setItem(
      "sc:snapshot",
      JSON.stringify({
        version: 1,
        guardadoEn,
        contexto: { restaurante: { id: id(99), nombre: "Picnic Delicias", es_demo: true }, perfil: { nombre: "Administrador", rol: "dueno" } },
        menu: {
          categorias: [{ id: id(1), nombre: "Comida", icono: "🍔" }],
          productos: [
            { id: id(11), categoria_id: id(1), nombre: "Hamburguesa sencilla", precio: 14000, disponible: true },
            { id: id(12), categoria_id: id(1), nombre: "Perro caliente", precio: 9000, disponible: true },
          ],
          modificadores: [],
          mesas: [{ id: id(21), nombre: "Mesa 1", pedido_abierto: null }],
        },
        pendientes: [
          { id: id(31), numero: 41, tipo: "llevar", estado: "listo", created_at: guardadoEn, total: 23000, cobrado: false, mesa: null, contacto_nombre: "Camilo", contacto_telefono: null, direccion: null, notas: null, items: [{ id: "i1", nombre: "Perro caliente", cantidad: 1, notas: null, adiciones: [] }] },
        ],
        cobrados: [],
        clientes: [{ id: id(41), nombre: "Ana Ríos", telefono: "+573001112233", saldo: 30000, debe_desde: "2026-10-01" }],
      })
    );
  }, ahora);

  console.log("\n2. Sin señal: abrir pantallas");
  await contexto.setOffline(true);
  await page.goto(BASE + "/pedidos");
  await page.waitForURL("**/sc#/pedidos", { timeout: 30000 });
  await page.getByRole("radio", { name: /^Pendientes/ }).waitFor({ timeout: 30000 });
  assert.equal(await cuantos(page, /^Pendientes/), 1);
  log("abrir /pedidos sin red lleva a la app sin conexión y muestra la copia guardada");
  await page.getByText(/Sin conexión/).first().waitFor();
  await captura(page, "prod-pendientes");

  console.log("\n3. Sin señal: trabajar");
  await tomarPedidoParaLlevar(page, 2);
  await page.getByText(/Pedido N1 enviado a cocina/).waitFor();
  assert.equal(await cuantos(page, /^Pendientes/), 2);
  await page.locator("li", { hasText: "N1" }).first().getByRole("link", { name: "Cobrar" }).click();
  await page.getByRole("button", { name: "Exacto" }).click();
  await page.getByRole("button", { name: /^Cobrar · vuelto/ }).click();
  await page.getByRole("heading", { name: "Cobrado" }).waitFor();
  await page.getByRole("link", { name: "Listo" }).click();
  log("pedido tomado y cobrado sin red");

  console.log("\n4. Sin señal: recargar y cerrar/abrir");
  await page.reload();
  await page.getByRole("radio", { name: /^Pendientes/ }).waitFor();
  assert.equal((await cola(page)).filter((o) => o.estado === "pendiente").length, 2);
  assert.equal(await cuantos(page, /^Pendientes/), 2, "tras recargar, lo hecho sin red sigue a la vista");
  log("tras recargar sin red la cola sigue intacta y el pedido se ve");

  const otra = await contexto.newPage();
  await otra.goto(BASE + "/inicio"); // como abrir la app instalada (start_url)
  await otra.waitForURL(/\/sc#\/inicio/);
  await otra.getByText("Tomar un pedido").waitFor();
  log("abrir la app (start_url /inicio) sin red muestra el inicio sin conexión");
  await otra.goto(BASE + "/cierre");
  await otra.waitForURL(/\/sc#\/cierre/);
  await otra.getByText(/no se puede usar sin conexión/).waitFor();
  log("una pantalla que necesita señal lo explica en vez de quedarse en blanco");
  await captura(otra, "prod-requiere-conexion");
  await otra.close();

  await page.evaluate(() => (location.hash = "#/sincronizacion"));
  await page.getByText(/Por subir \(2\)/).waitFor();
  log("la pantalla de sincronización cuenta las 2 operaciones guardadas");

  assert.deepEqual(errores, [], "sin errores de JavaScript en la página");
  log("sin errores de JavaScript durante toda la fase");
  await contexto.close();
  detener(servidor);
  servidor = null;
}

// Principal
let codigo = 0;
try {
  navegador = await chromium.launch({ executablePath: CHROME, headless: true });
  if (FASE === "todas" || FASE === "dev") await faseDev();
  if (FASE === "todas" || FASE === "prod") await faseProd();
  console.log("\nTODO BIEN: el trabajo sin conexión funciona de punta a punta.");
} catch (e) {
  codigo = 1;
  console.error("\nFALLÓ:", e.message);
  console.error(e.stack?.split("\n").slice(1, 6).join("\n"));
  try {
    const paginas = navegador?.contexts().flatMap((c) => c.pages()) ?? [];
    if (paginas[0]) {
      await paginas[0].screenshot({ path: path.join(CAPTURAS, "fallo.png") });
      console.error("URL al fallar:", paginas[0].url());
      console.error("Texto en pantalla:", (await paginas[0].locator("body").innerText()).slice(0, 400));
      if (servidor) console.error("Registro del servidor (final):\n" + servidor.registro().slice(-1500));
    }
  } catch {
    // sin captura
  }
} finally {
  await navegador?.close().catch(() => {});
  detener(servidor);
  setTimeout(() => process.exit(codigo), 500);
}
