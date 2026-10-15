@AGENTS.md

# Contexto del proyecto

Demo vendible (PWA **mobile-first**) para restaurantes pequeños en Colombia. Datos SIEMPRE ficticios. Ver `README.md`.
El enunciado completo está en `PROMPT-DEMO-RESTAURANTES.md` (solo local, no versionado).

## Convenciones

- Responde y escribe todo en español (UI, comentarios, commits, README).
- Dinero: pesos enteros (`integer`), nunca decimales. Cálculos solo en el módulo central (`src/lib/dinero.ts`) con pruebas.
- Anular con motivo en vez de borrar. Tablas en español, `created_at` y `registrado_por`.
- Toda tabla de negocio lleva `restaurante_id` y RLS. Las escrituras van por funciones RPC (`security definer`),
  los clientes no escriben tablas directamente.
- Permisos por área (migración 19): áreas fijas `pedidos`, `plancha`, `caja`, `fiado`, `gastos`, `cierre` (`fn_areas` en
  SQL y `lib/areas.ts`, una prueba las compara). Cada local tiene sus roles (`roles_equipo`) y una persona puede tener
  varios (`perfil_roles`): ve la suma. El dueño las abre todas; menú, mesas, horario, pedidos en línea y equipo siguen
  siendo `requerir_dueno()`. Toda función de escritura nueva pide su área con `requerir_area('…')`, nunca solo
  `requerir_restaurante()` (`src/test/permisos-por-area.test.ts` fija la lista de las que no piden área). Las tablas de
  plata (pagos, fiado, clientes, gastos, cierres) se leen con `tiene_area` en su RLS: una lectura no falla, devuelve
  vacío o `null` en las cifras que no le tocan. Al redefinir una función copia la ÚLTIMA versión (la que ya pide área).
  En pantalla decide `lib/areas.ts` (`quienEs`, `puedeVer`, `PANTALLAS`, `pestanasDe`): toda página del personal empieza
  con `revisarPermiso("<pantalla>")` (`lib/permisos.ts`) y si no hay permiso muestra `<SinPermiso>` (una prueba,
  `src/test/pantallas-con-permiso.test.ts`, lo exige para cada `page.tsx`); los botones se esconden con
  `abre(quien, …)`. Una pantalla nueva del personal se agrega a `PANTALLAS`. Más → Equipo (`/equipo`) es del dueño.
  Las páginas sacan a quien entra con `obtenerQuien()` / `revisarPermiso()` (`lib/permisos.ts`), nunca con
  `quienEs(obtenerContexto())` suelto: ahí van el "Ver como" y la salida a `/unirme` de una sesión sin equipo.
- Equipo (migración 20): cada persona entra con un código de invitación (`crear_invitacion` → `/unirme` →
  `canjear_invitacion`, con una sesión ANÓNIMA de Supabase; nada de `service_role` ni de crear usuarios). Quitar del
  equipo borra su perfil (y con él sus roles y sus avisos push); reiniciar la demo saca al equipo y vuelve a los roles
  de siempre. Los avisos push se filtran por área al suscribirse Y al enviar (`listar_destinos_push`). "Ver como" es
  solo vista (cookie `ver_como`, solo vale para el dueño): nunca relajar ni endurecer la base con ella.
- Tres formas de entrar: la DEMO con un toque (portada, `DEMO_EMAIL`/`DEMO_PASSWORD` del servidor: cualquiera es su
  dueño), el dueño de un restaurante DE VERDAD con su correo y contraseña (`/entrar`; la cuenta la crea quien administra
  en Supabase y `fn_crear_restaurante` le da el local, migración 22) y el equipo con código (`/unirme`). La contraseña de
  la demo nunca se cambia desde la app ("Mi contraseña" solo para dueños de restaurantes que no son demo).
- Migraciones (`supabase/migrations/`): toda migración que agregue funciones termina con
  `select public.fn_aplicar_permisos();` (cierra EXECUTE a anon y a las `fn_*`/`requerir_*`) y se corre `npm run esquema`
  para regenerar `supabase/esquema-completo.sql` (una prueba lo verifica). Toda tabla nueva lleva `restaurante_id`
  NOT NULL + RLS (una prueba falla si no).
- Pruebas de SQL/RLS: Postgres real en memoria con PGlite (`src/test/base-datos.ts`), no hay Docker ni CLI de Supabase.
- Diseño: objetivos táctiles ≥ 48 px, texto ≥ 16 px, acciones principales abajo, sin `hover`, sin scroll horizontal.
  Verifica cada pantalla a 360×640 y 390×844. Solo bajan a 14 px (`text-sm`) las etiquetas cortas en MAYÚSCULAS, las
  insignias y lo que no cabe (la cuadrícula de categorías de gasto); las etiquetas de la barra de abajo van en 12 px.
  Lo apagado (botón deshabilitado, plato agotado) se ve con borde punteado, fondo gris y texto legible: nunca con
  `opacity`, que lo vuelve ilegible.
- Los componentes `"use client"` NO pueden importar Zod ni `server-only` (directa ni indirectamente): una prueba
  (`src/test/peso-del-cliente.test.ts`) lo verifica. Las constantes que necesite el cliente viven fuera de `lib/esquemas/`.
- Después de cobrar/guardar, la acción revalida todo (`revalidatePath("/", "layout")`) y la página refresca: una pantalla
  que muestra una confirmación debe conservarla (la página siempre renderiza el mismo componente, ver Cobrar).
- Trabajo sin conexión: toda escritura del mostrador (pedido, estado, cobro, cliente, abono, gasto) pasa por
  `src/lib/sync/acciones.ts` → `Motor` (cola en localStorage) → acción `aplicarOperacion` → `aplicar_operacion` en la base
  (clave única = idempotente; trae `ocurrido_en`). Las pantallas usan `Enlace`/`useIr` de `src/lib/navegacion.tsx` (no `next/link`
  ni `useRouter` directos) para que sirvan también en `/sc`. Un tipo de operación nuevo toca: `lib/sync/tipos.ts`, `vista.ts`,
  `describir.ts`, `lib/esquemas/operacion.ts`, el `case` de `aplicar_operacion` (migración nueva) y la prueba
  `src/test/contrato-operaciones.test.ts`. Antes de dar por buena una de esas piezas corre `npm run e2e`.
  `aplicarOperacion` distingue el rechazo de la base (definitivo: queda "con problema") del fallo pasajero
  (`reintentable`, ver `esFalloPasajero` en `lib/errores.ts`: se reintenta solo, con tope). Con la red caída (`sinRed`)
  el `Motor` no hace esperar a nadie: guarda de una vez y sube por detrás.
- Pedidos hechos sin señal llevan número provisional negativo: mostrar siempre con `numeroVisible()`.
- "Hoy" es el DÍA DE TRABAJO, no la fecha del calendario: cambia a la hora de corte (`restaurantes.hora_corte`, 4 a. m.)
  o cuando el dueño cierra el día a mano. En SQL: `jornada_actual()` (a qué día entra lo que se registre ahora; Inicio,
  cobrados, gastos), `dia_de_trabajo()` (el del reloj; la pantalla de Cierre) y `fn_jornada(restaurante, instante)`;
  nunca `hoy_bogota()` para algo del negocio. Las columnas `fecha` de pedidos, pagos y movimientos las pone un trigger
  (no son generadas). En el navegador: `hoyDeTrabajo()` de `lib/fechas.ts`. Las pruebas de fechas usan instantes FIJOS
  lejos de la última semana (la demo trae cierres de ejemplo de esos días), nunca el reloj.
- Lo que no se cocina (categoría con `se_prepara = false`, p. ej. Bebidas) no sale en la plancha ni frena el pedido; el
  dato se copia a `pedido_items.se_prepara` al vender. Toda función que cuente o liste platos "por preparar" filtra por
  `se_prepara`.
- Una función SQL que deba RECORDAR un intento fallido (el PIN de reinicio) devuelve `{ok:false}` en vez de lanzar: un
  `raise` deshace la transacción y con ella el conteo. El PIN se define solo desde el SQL Editor
  (`fn_definir_pin_reinicio`), nunca desde la app.
- Fotos: las de gastos son privadas (`/api/foto`, con sesión); las de platos son públicas a propósito (bucket
  `platos-fotos`) y su dirección la arma el servidor con `urlFotoPlato` (`lib/fotos.ts`), nunca el navegador.
- Horario de atención: la cuenta "¿a esta hora se atiende?" existe en SQL (`fn_abierto_por_horario`, la que decide) y en
  TypeScript (`lib/horario.ts`, para explicar); `src/test/carta-del-cliente.test.ts` las compara. Lo que dependa del
  reloj ("abre hoy a las…") se calcula en el servidor y viaja como texto (no rompe la hidratación).
- Datos de ejemplo: `fn_cargar_datos_demo` es una función larga. Una migración que les cambie algo la redefine ENTERA y
  una sola vez (como la 18, que recoge lo de la 14 a la 17), no a pedazos en varias migraciones.
- Grupos de rutas: `(app)` con barra de navegación, `(tarea)` una sola tarea, ambos en la columna angosta de celular
  (`.columna-app`); `(cocina)` (la plancha) a todo el ancho, para tableta o celular acostado; `(publico)` sin sesión.
- La pantalla de "no existe" es UNA (`app/not-found.tsx` → `components/no-existe.tsx`) y cambia el texto según a quién
  le habla (`zonaDeRuta`): a un cliente nunca se le ofrece ir a la app del personal.
- El pedido a medio armar (el del personal y el carrito del cliente) NO vive en el estado de la pantalla: vive en
  `src/lib/borrador-local.ts` (memoria + localStorage, se vence solo, se borra al enviar y al salir de la sesión), para
  que salir de la pantalla o recargar no lo borre. Al retomarlo se pone al día con `reconciliarConMenu`.
- Pedidos en línea y plancha (lo que ve el cliente sin cuenta): los visitantes SOLO ejecutan funciones SQL `publico_*`
  (la única familia abierta a `anon`; `fn_aplicar_permisos` las concede por el prefijo y una prueba fija la lista).
  Se llaman desde el servidor con `consultarPublico`/`ejecutarPublico` (`lib/datos/llamar.ts`), nunca con tablas ni
  `service_role`. Un pedido con `origen = 'cliente'` NO está en cocina (`en_cocina`) hasta que el personal lo acepta
  (`confirmar_pedido_cliente`): toda función nueva que liste o cuente pedidos de cocina debe filtrar por `en_cocina`.
  El seguimiento va por `token_seguimiento` (uuid) y devuelve solo ese pedido y solo lo que el cliente puede ver. Las
  páginas públicas viven en `src/app/(publico)/` (ver `lib/rutas-publicas.ts`: ahí no corren ProveedorSync ni el
  service worker). "Tiempo real" = consulta periódica (GET `no-store`), no websockets. Cambios en esta parte: corre
  `npm run e2e:clientes`.
- Consultas en vivo del personal (migración 24): cada consulta cuesta, así que una pantalla en vivo NO pone su propio
  reloj: escucha el pulso de la pestaña (`lib/pulso.ts` → `/api/pulso` → `pulso()`), pide su ritmo (`lib/ritmo.ts`,
  rápido tras un cambio o un toque, más espaciado si nada cambia) y trae sus datos solo si cambió la huella
  (`huella_pedidos()`, que resume las filas de `pedidos` y `pedido_items` que se ven). La huella se pide ANTES que los
  datos que acompaña (`obtenerHuella`). Si una pantalla en vivo empieza a mostrar algo que no vive en esas tablas,
  agrégalo a `huella_pedidos()` o no se refrescará.
- No agregar lo aplazado: facturación electrónica, inventario con recetas, gráficas, WhatsApp automático, impresión
  térmica, pagos en línea, multi-sede, costo de domicilio por zona. (El cartel del QR sí se imprime, con la impresora
  normal: `/qr` y las reglas `@media print` de `globals.css`.) Avisos push (`lib/push/`): la llave privada VAPID
  es solo del servidor; los avisos se envían con `after()` y nunca deben hacer fallar la acción que los dispara. Un
  celular deja de recibirlos al salir de la sesión y al reiniciar la demo (salvo el que reinicia): no dejar caminos
  por los que un celular siga suscrito sin que nadie del equipo lo use.
- No hacer push ni despliegues, ni tocar servicios externos, sin avisar antes. Commits pequeños están bien.
- Referencia de patrones (NO copiar módulos de taller ni su auto-deploy): `C:\Users\johan\Desktop\Polo Air Cool`.
