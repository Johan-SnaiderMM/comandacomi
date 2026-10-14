# Comanda (nombre provisional) · demo para restaurantes pequeños

PWA **mobile-first** para dueños de locales pequeños de comida rápida y carnes a la plancha en Colombia:
pedidos por mesa / para llevar / domicilio, cobro en efectivo y Nequi, **fiado**, gastos y **cierre del día**
con resumen por WhatsApp. Es una **demo para enseñar en visitas**: todos los datos son ficticios.

Se diseñó primero para **360×640 y 390×844** (celular Android de gama media/baja, una mano, poca luz o sol):
objetivos táctiles de 48 px, texto de 16 px, acciones abajo, sin `hover`, sin scroll horizontal. En pantallas
grandes solo se centra una columna.

## Recorrido de 5 minutos (una sola mano)

1. **Entrar a la demo** (un toque, sin datos) → **Inicio**: ventas de hoy, ganancia aproximada, por cobrar y pendientes.
   Toca **Recorrido guiado · 2 minutos** (o **Más → Recorrido guiado**): una hoja por paso, un aro rojo que late sobre
   lo que hay que tocar, y la guía avanza sola al llegar a cada pantalla. La ficha **💡 n/9** del encabezado la reabre.
2. **Tomar** (botón amarillo): mesa → toca los platos (un toque agrega; "Extras y nota" para adiciones) → **Enviar a cocina**.
3. **Pendientes**: **Marcar listo** → **Entregado**. En **⋯** de cada pedido: agregar platos, **quitar un plato** (pide
   el motivo) o anular el pedido.
4. **Cobrar**: efectivo (teclado propio, vuelto), Nequi, **una parte en efectivo y el resto por Nequi**, o **fiado**
   (cliente nuevo y pago parcial).
5. **Más → Fiado**: quién debe, **Abonar**, **Recordar** por WhatsApp.
6. **Más → Gastos del día**: registrar un gasto (monto → categoría → guardar, foto opcional).
7. **Más → Cierre del día**: contar el efectivo, ver la diferencia, cerrar y **Enviar resumen por WhatsApp**.
8. **En línea** (en la barra de abajo): el enlace (y el QR) para que los clientes pidan solos desde su celular. Ábrelo en otro
   celular: arma un pedido a domicilio y envíalo. En el tuyo suena y parpadea **¡Pedido nuevo!**: **Aceptar** (con tiempo
   estimado) o **Rechazar** (con motivo).
9. **Más → Plancha** (en otro celular o tableta): el pedido aceptado aparece plato por plato; toca cada plato para
   marcarlo **listo** (o **Todo listo**). El cliente lo ve avanzar en su pantalla, en vivo.
10. **Más → Menú** y **Más → Mesas**: platos (con foto y descripción para el cliente), adiciones y mesas, todo desde el
    celular.
11. **Más → Reiniciar demo**: vuelve todo a los datos de ejemplo (pide el PIN si la demo tiene uno).

## Pedidos en línea y plancha

El cliente **no necesita cuenta ni app**: abre el enlace del restaurante (`/pedir/<nombre-del-local>`), arma su pedido,
elige **recoger** o **domicilio** y pone su nombre, celular y dirección. Después sigue su pedido en `/seguimiento/<código>`.

```
Cliente envía ──▶ "Por confirmar" ──▶ el dueño ACEPTA (con minutos) ──▶ Plancha ──▶ listo ──▶ entregado
   (público)        alerta sonora          o RECHAZA con motivo          plato por plato     (el cliente lo ve)
```

- **Nada llega a la cocina sin que el dueño lo acepte.** Un pedido en línea queda "por confirmar" (no entra a Pendientes
  ni a la plancha ni se puede cobrar) hasta que alguien lo acepta; si lo rechaza, el cliente ve el motivo.
- **Alerta para que no pase desapercibido:** franja grande que parpadea rojo/amarillo, sonido y vibración repetidos y el
  título de la pestaña titila, en cualquier pantalla con sesión. *Silenciar* la deja como una franja pequeña hasta que se
  atienda. Con la app abierta suena sola; con la app cerrada llegan los **avisos push** (ver abajo).
- **Plancha** (`/plancha`): pedidos por preparar, del más viejo al más nuevo, con la espera en colores (verde/amarillo/rojo),
  tipo (mesa, domicilio, para llevar) y cada plato como un botón grande. Cuando todos los platos están listos, el pedido
  pasa solo a "listo". Mantiene la pantalla encendida y suena con cada pedido nuevo, y también cuando a un pedido que
  ya estaba le agregan platos (quedan marcados **Agregado**). *Deshacer* corrige un error de dedo. Usa todo el ancho de
  la pantalla: en tableta o con el celular acostado los pedidos van lado a lado.
- **Lo que no se cocina no pasa por la plancha.** Cada categoría dice si sus platos *se preparan en la cocina* (en
  *Más → Menú*, al editar la categoría; Bebidas viene apagada). Una gaseosa no sale en la plancha ni frena el pedido: con
  la hamburguesa lista, el pedido está listo. Un pedido de solo bebidas nace "listo", y agregarle una bebida a un pedido
  no lo devuelve a la cocina (migración `20261005000014_cocina_sin_bebidas_y_quitar_plato.sql`).
- **Foto y descripción de cada plato** (*Más → Menú*, al editar el plato): la foto se comprime en el celular (~60 KB) y
  va a un bucket **público** de Storage (`platos-fotos`), porque el menú lo ve cualquiera con el enlace. Solo el dueño
  sube, y solo a la carpeta de su restaurante.
- **Horario de atención** (*En línea*): con horario, los pedidos en línea se abren y se cierran solos; el
  cliente ve "cerrado, abre hoy a las 6:00 p. m." y el horario de la semana. Una franja que cierra después de medianoche
  (6 p. m. a 2 a. m.) se escribe tal cual. El interruptor sigue mandando: apagado, no se recibe aunque sea hora.
- **QR para imprimir** (*En línea → Cartel con el QR*): un cartel listo para pegar en el mostrador. Se
  imprime (en la hoja sale solo el cartel) o se guarda como imagen para mandarla a una papelería.
- **"Tiempo real" = consulta cada pocos segundos** (seguimiento 4 s, que se espacia si lleva rato igual; alerta 5 s;
  plancha 4 s). Se detiene sola cuando el pedido termina o la pantalla no está a la vista. Es lo que permite probarlo en
  el modo local sin servicios externos.
- **El dueño abre o cierra** la recepción desde *En línea*. Cerrada, el cliente ve el menú pero no puede
  enviar. El enlace sale del nombre del local y cambia si renombras la demo, pero **los enlaces anteriores siguen
  funcionando**: llevan al vigente (los 20 últimos; migración `20261005000013_enlaces_anteriores_y_platos_quitados.sql`).
- **Avisos push (con la app cerrada):** *Más → Avisos en este celular*. Cada celular elige qué recibir: **dueño** =
  pedidos nuevos de clientes; **parrilla** = pedidos que entran a la plancha; **mesero** = pedidos listos para entregar.
  El cliente, en su seguimiento, puede tocar **Avísame cuando esté listo** (aceptado, listo, rechazado). Usa Web Push
  (llaves VAPID: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` solo servidor, `VAPID_SUBJECT`); sin ellas la app
  funciona igual con la alerta en pantalla. En iPhone solo con la app agregada a la pantalla de inicio. Hay un botón
  **Probar aviso** para verificar que llega. Migración: `20261005000011_avisos_push.sql`.
  Los avisos no se quedan para siempre en celulares de visitas anteriores (migración `20261005000012_limpieza_avisos.sql`):
  **salir de la sesión** da de baja ese celular, **reiniciar la demo** da de baja todos menos el celular desde el que
  se reinicia, y con el tope de 30 celulares lleno entra el nuevo y sale el más antiguo.
- **Enlaces por rol** (entran con un toque a la demo y abren esa pantalla): `/?ir=/plancha` (parrilla),
  `/?ir=/pedidos` (mesero), y `/pedir/<local>` (cliente, sin cuenta).
- **Pagos:** el cliente paga al recibir (efectivo o Nequi); el cobro se hace en la app como cualquier pedido.
- **Antiabuso (sin servicios externos, en la base):** como máximo 25 pedidos sin confirmar por restaurante, 3 por
  teléfono cada 30 min y 10 por minuto; 30 platos y 20 unidades por plato; campo trampa para programas. El cliente no puede
  poner precios: la base los toma del menú.
- **Probarlo:** `npm run e2e:clientes` abre tres celulares simulados en Chrome (cliente, dueño y plancha) y recorre
  pedir → alerta → aceptar → marcar platos → entregado, más rechazo, cancelación, cerrado y permisos.

## Cómo correrla en tu computador (sin cuenta de Supabase)

Requisitos: Node 22 y npm.

```bash
npm install
```

Crea el archivo `.env.local` (no se sube al repositorio) con una sola línea:

```
DEMO_BD=local
```

```bash
npm run dev      # http://localhost:3000
```

El **modo local** corre las mismas migraciones y funciones de `supabase/` en una base embebida (PGlite) guardada
en `.local/`. Solo funciona fuera de producción. Para empezar de cero, borra la carpeta `.local/` (también se
recrea sola si cambian las migraciones).

## Trabajar sin conexión

La app sigue funcionando cuando se va la señal y sube todo sola cuando vuelve:

- **Qué se puede hacer sin señal:** tomar pedidos, marcarlos listos/entregados, agregar platos, cobrar (efectivo, Nequi
  o fiado, con cliente nuevo incluido), abonar al fiado y anotar gastos (sin foto). Lo que se hace se ve de inmediato y
  los pedidos nuevos llevan un número provisional ("N1", "N2"…) hasta que el servidor les da el definitivo.
- **Qué necesita señal:** cierre del día, menú, mesas, gastos de días anteriores, fichas de clientes, anular (también
  quitar un plato de un pedido) y la foto del gasto.
  Esas pantallas lo explican en vez de fallar.
- **Cómo funciona:** el celular guarda una copia (menú, pedidos, clientes) y una cola de lo que se hace. Sin señal el
  service worker abre la **app sin conexión** (`/sc`, una página estática), que usa los mismos componentes con la copia
  local. Al volver la señal la cola se sube en orden. Cada operación lleva una clave única (`aplicar_operacion` en la
  base la ejecuta una sola vez aunque llegue repetida) y la fecha en que ocurrió: un cobro hecho a las 11 p. m. sin
  señal cuenta en ese día aunque suba al siguiente (máximo 7 días).
- **La franja de arriba** avisa: *Sin conexión · N por subir*, *Subiendo…* o *N cambios no se pudieron subir* (el
  servidor rechazó algo, por ejemplo un plato que ya no existe): **Más → Sincronización** deja reintentar o descartar.
- **Al salir de la sesión** se borran la copia y la cola (si quedan cambios sin subir, avisa antes).
- **Probarlo:** `npm run e2e` abre un Chrome real, corta la red y verifica de punta a punta (necesita Chrome instalado;
  `CHROME_PATH` si está en otra ruta). Para probar a mano: DevTools → Network → *Offline*.

## El día de trabajo (hora de corte)

El día **no cambia a medianoche**: cambia a las **4:00 a. m.** (hora de corte) o **cuando el dueño lo cierra**. Un
local nocturno ve en Inicio las ventas de toda la noche a la 1:44 a. m., y puede cerrar la caja al terminar el turno.

- Cada venta, pago, abono y gasto pertenece a una **jornada** (su columna `fecha`): el día de Bogotá corrido por la
  hora de corte del restaurante (`restaurantes.hora_corte`, 4 por defecto; hoy solo se cambia en la base).
- **Cerrar el día a mano lo termina antes:** lo que se registre después entra al día siguiente y las cifras del cierre
  ya no se mueven. Inicio pasa a "Día cerrado"; la pantalla de Cierre sigue mostrando el día cerrado hasta las 4 a. m.
- **Anular el cierre** reabre el día y le devuelve lo que se había pasado al siguiente.
- Las fechas las pone un trigger (dejaron de ser columnas generadas porque la regla depende de datos). Migración
  `20261005000016_dia_de_trabajo.sql`.

## Cómo reiniciar los datos de ejemplo

- **Desde la app:** *Más → Reiniciar demo*. Borra lo creado (pedidos, gastos, cobros, fiado, cambios al menú) y
  recarga el menú de 25 platos, 6 mesas, 8 clientes con fiado y 7 días de ventas, gastos y cierres. Solo lo permite
  la base en restaurantes de demostración y solo al dueño. Las fotos que les hayas tomado a los platos de ejemplo se
  conservan (se reconocen por el nombre del plato).
- **PIN de reinicio (opcional):** en la demo todo el mundo entra con el mismo usuario, así que cualquiera con el enlace
  podría reiniciarla en plena visita. Para evitarlo, ponle un PIN **desde el SQL Editor de Supabase** (nunca desde la
  app, para que un visitante no pueda ponerlo ni cambiarlo):

  ```sql
  select public.fn_definir_pin_reinicio('4821');   -- ponerlo o cambiarlo (4 a 8 dígitos; usa el tuyo)
  select public.fn_definir_pin_reinicio(null);     -- quitarlo
  ```

  Con PIN, *Reiniciar demo* lo pide; se guarda cifrado en una tabla que nadie lee y cinco intentos fallidos bloquean
  el reinicio 5 minutos. Reiniciar no quita el PIN.
- **Modo local:** borra la carpeta `.local/`.
- **Supabase:** vuelve a ejecutar `supabase/seed.sql` (es idempotente).

Los totales se ven "vivos" porque los datos se generan relativos a hoy (sin azar: dos reinicios dan lo mismo).

## Poner la demo en Supabase + Vercel (lo haces tú, a mano)

> Nada de esto lo hace el código por ti, y **no pegues claves en el chat**. La `service_role` de Supabase
> **no se usa** en esta demo: solo hace falta la URL y la `anon key`.

1. **Supabase → New project.** Guarda la contraseña de la base en tu gestor de contraseñas.
2. **SQL Editor →** pega **todo** `supabase/esquema-completo.sql` → *Run*. (Es la unión de las migraciones; se
   regenera con `npm run esquema`.)
3. **Authentication → Users → Add user:** crea el usuario de la demo (correo + contraseña, con *Auto Confirm User*).
4. Abre `supabase/seed.sql`, cambia el correo de la línea marcada por el del usuario que acabas de crear y ejecútalo
   en el SQL Editor. Crea el restaurante ficticio y le carga los datos de ejemplo.
5. **Authentication → Providers → Email:** desactiva *Allow new users to sign up* (que nadie se registre solo).
6. **Project Settings → API:** copia la *Project URL* y la *anon public key*.
7. **Vercel → New Project** (importa el repositorio, o `vercel` desde la terminal) y define las variables de entorno:

   | Variable | Valor |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | la Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | la anon key (pública por diseño; la seguridad la da RLS) |
   | `DEMO_EMAIL` / `DEMO_PASSWORD` | el usuario del paso 3 (**solo servidor**, nunca con `NEXT_PUBLIC_`) |
   | `NEXT_PUBLIC_MARCA_NOMBRE`, `NEXT_PUBLIC_MARCA_LEMA` | opcional: marca y lema |
   | `NEXT_PUBLIC_CONTACTO_WHATSAPP` | opcional: tu WhatsApp (ej. `573001234567`); activa "Quiero esta app" |

   **No** definas `DEMO_BD` en Vercel (el modo local está bloqueado en producción de todos modos).
8. Despliega, abre la URL en el celular, **Chrome → menú → Instalar aplicación**.

> **Si la demo ya estaba en Supabase** (de antes de los pedidos en línea): en el *SQL Editor* ejecuta solo
> `supabase/migrations/20261005000010_pedidos_clientes.sql` ANTES de desplegar la versión nueva. Agrega el enlace
> público de cada restaurante, el estado "por confirmar", el marcado de platos y las funciones `publico_*` que puede
> ejecutar un visitante sin cuenta (y nada más: ninguna tabla se abre).
>
> Lo mismo con las migraciones siguientes, en orden y cada una antes de desplegar la versión que la usa:
> `20261005000011_avisos_push.sql`, `20261005000012_limpieza_avisos.sql`,
> `20261005000013_enlaces_anteriores_y_platos_quitados.sql`, `20261005000014_cocina_sin_bebidas_y_quitar_plato.sql`,
> `20261005000015_mesas_y_pin_de_reinicio.sql`, `20261005000016_dia_de_trabajo.sql`,
> `20261005000017_carta_del_cliente.sql` y `20261005000018_demo_al_dia.sql`. Las cinco últimas van juntas (la 18
> redefine los datos de ejemplo con todo lo de las cuatro anteriores); después, **Más → Reiniciar demo** para que la
> demo tome las descripciones de los platos y Bebidas quede fuera de la plancha.
> Luego `20261005000019_permisos_por_area.sql` (roles del equipo y permisos por área; al dueño no le cambia nada).

### Antes de enseñarla (lista rápida)

- [ ] Abre la URL en tu celular y toca **Entrar a la demo**: debe llegar a Inicio con números.
- [ ] Instálala como app y ábrela desde el ícono (debe abrir en pantalla completa).
- [ ] Haz un pedido de punta a punta y toca **Más → Reiniciar demo** para dejarla limpia.
- [ ] Prueba con mala señal / modo avión: el cascarón debe abrir (los datos nuevos necesitan red).
- [ ] **Pedidos en línea:** abre *En línea*, copia el enlace, ábrelo en otro celular y haz un pedido;
      en el tuyo debe sonar la alerta. Toca una vez la pantalla antes (el navegador no deja sonar sin un toque).
- [ ] **PIN de reinicio:** si vas a dejarle el celular a alguien, ponle un PIN a la demo (ver *Cómo reiniciar los
      datos de ejemplo*) para que no la reinicien en plena visita.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` / `npm start` | Compilar y servir en producción |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript sin emitir |
| `npm test` | Pruebas (Vitest) |
| `npm run verificar` | Lint + tipos + pruebas (lo que debe estar en verde) |
| `npm run esquema` | Regenera `supabase/esquema-completo.sql` desde las migraciones |
| `npm run iconos` | Regenera los íconos de la PWA (`public/icons`) |
| `npm run e2e` | Prueba de punta a punta del trabajo sin conexión (Chrome real; ~3 min) |
| `npm run e2e:clientes` | Prueba de punta a punta de pedidos en línea y plancha (3 celulares simulados; ~3 min) |

## Estructura

```
src/app/(app)/        Pantallas con barra de navegación: Inicio, Pendientes, Fiado, Más, Gastos, Menú, Mesas, Pedidos en línea
src/app/(tarea)/      Pantallas de una sola tarea, sin barra: Tomar pedido, Cobrar, Cierre, Nuevo gasto, Ficha de cliente, QR para imprimir
src/app/(cocina)/     La plancha, a todo el ancho (tableta o celular acostado)
src/app/(publico)/    Lo que ve el CLIENTE sin cuenta: /pedir/<local> (menú y pedido) y /seguimiento/<código>
src/app/api/          Consultas de las pantallas "en vivo": seguimiento (público, por código), plancha y por-confirmar (con sesión)
src/app/acciones/     Acciones del servidor: sync.ts (aplicarOperacion/obtenerSnapshot), clientes.ts, plancha.ts, publico.ts; validan con Zod y llaman funciones SQL
src/app/sc/           App sin conexión: una página estática con los mismos componentes y la copia local
src/lib/sync/         Trabajo sin conexión: tipos, vista local, motor de la cola, acciones del celular
src/app/api/foto/     Sirve las fotos de gastos solo con sesión y solo del propio restaurante
src/components/       ui (botón, hoja inferior, teclado numérico…), layout, fiado, gastos, sesión
src/lib/              dinero.ts (TODOS los cálculos), fechas (día de trabajo), horario (de atención), whatsapp, teclado, esquemas/ (Zod), datos/ (lecturas)
src/lib/local/        Modo local de desarrollo (PGlite)
supabase/migrations/  Tablas, RLS, funciones de lectura/escritura, demo, permisos, almacenamiento
supabase/seed.sql     Carga de la demo en Supabase (idempotente)
public/               sw.js (service worker: estáticos + app sin conexión), offline.html, íconos
```

## Reglas del proyecto

- **UI toda en español.** Marca configurable por variables de entorno.
- **Dinero en pesos enteros** (COP no usa decimales). Todos los cálculos viven en `src/lib/dinero.ts`, con pruebas;
  otra prueba verifica que den **lo mismo que la base de datos**.
- **Anular en vez de borrar:** pedidos, ítems, cobros, abonos, gastos y cierres se anulan con motivo (queda quién y
  cuándo). El borrado está bloqueado por trigger incluso para el dueño de la base.
- **Multi-restaurante desde la primera tabla:** toda tabla lleva `restaurante_id` y RLS; las llaves foráneas son
  compuestas, así que ninguna fila puede apuntar a datos de otro restaurante.
- **Los clientes no escriben tablas:** solo leen (con RLS). Toda escritura pasa por funciones SQL que validan
  restaurante y rol y **recalculan precios y totales desde la base** (el celular solo manda ids y cantidades).
- **Permisos por área, decididos por cada local** (migración `20261005000019_permisos_por_area.sql`): las áreas son
  *pedidos, plancha, caja, fiado, gastos y cierre*. Cada restaurante tiene sus roles (arranca con Mesero, Cocina y
  Caja) y elige qué áreas abre cada uno; una persona puede tener varios roles y ve la suma. El dueño lo ve todo. El
  candado está en la base: sin el área, la función de escritura falla y las tablas de plata no se leen.
- **Poco JavaScript:** una prueba impide que Zod (validación, solo servidor) llegue al navegador.
- El proyecto usa Next.js 16: antes de escribir código lee la guía correspondiente en `node_modules/next/dist/docs/`
  (ver `AGENTS.md`).

## Seguridad

- Sin secretos en el repositorio: `.env.example` solo trae nombres. `.env.local` está en `.gitignore`.
- HTTPS lo da Vercel. Cabeceras: CSP, HSTS, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- **Aislamiento entre restaurantes demostrado con pruebas** (`src/test/aislamiento.test.ts`, Postgres real): un
  usuario del restaurante A no puede leer, insertar, modificar, anular ni subir fotos en el B, por ninguna tabla ni
  función; sin sesión no se ejecuta ninguna función ni se lee ninguna tabla.
- **Lo que puede hacer alguien SIN cuenta** se limita a las funciones SQL `publico_*` (`publico_menu`, `publico_crear_pedido`,
  `publico_ver_pedido`, `publico_cancelar_pedido` y las dos de avisos push); una prueba falla si aparece otra ejecutable por `anon` y ninguna
  tabla se puede leer sin sesión. El seguimiento se consulta por un código aleatorio (uuid) imposible de adivinar, que
  devuelve **solo ese pedido** y nunca datos internos (quién lo atendió, cobros, otros pedidos). El enlace no se indexa
  (`noindex`) y no sale en el `Referer` hacia otros sitios.
- **Fotos:** las de los comprobantes de gastos son privadas (se sirven solo con sesión y solo del propio restaurante).
  Las de los **platos son públicas a propósito** (bucket `platos-fotos`): el menú lo ve cualquiera con el enlace. Solo
  el dueño sube, solo a la carpeta de su restaurante, y nadie puede listar el bucket ni editar o borrar.
- **PIN de reinicio de la demo:** se define únicamente desde el SQL Editor (`fn_definir_pin_reinicio`, que ningún
  usuario de la app puede ejecutar), se guarda cifrado en una tabla sin lectura para nadie y lo comprueba la base, no
  la pantalla. Cinco intentos fallidos bloquean el reinicio 5 minutos.
- **Recordar** (fiado) abre WhatsApp con el teléfono que se guardó al crear el cliente. Los clientes de ejemplo de
  la demo traen teléfonos inventados (bloque +57 300 000 0xxx, podrían ser de alguien real): a esos el enlace no
  les pone número y eliges tú a quién enviarlo. El resumen del cierre tampoco lleva número.

## Qué NO hace (aplazado a propósito)

Facturación electrónica, recetas/inventario con descuento, gráficas, WhatsApp automático u oficial, impresión
térmica, pagos en línea y multi-sede. Tampoco: costo de domicilio por zona, seguimiento del repartidor en mapa ni
CAPTCHA (el antiabuso va en la base). (Sin conexión funciona el trabajo del mostrador; el cierre, el menú, las mesas,
las anulaciones —incluido quitar un plato— y los pedidos en línea esperan a tener señal.)

## Problemas frecuentes

- **"La demo todavía no está configurada"** al entrar: faltan variables de entorno en Vercel
  (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `DEMO_EMAIL`, `DEMO_PASSWORD`) o el usuario no existe.
- **Entra pero todo sale vacío o da error:** falta correr `supabase/seed.sql` con el correo del usuario demo.
- **Cambié una migración:** corre `npm run esquema` (una prueba falla si el archivo unido no está al día) y vuelve a
  pegarlo; las funciones nuevas deben terminar con `select public.fn_aplicar_permisos();`.
