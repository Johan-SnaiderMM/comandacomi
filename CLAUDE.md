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
- Migraciones (`supabase/migrations/`): toda migración que agregue funciones termina con
  `select public.fn_aplicar_permisos();` (cierra EXECUTE a anon y a las `fn_*`/`requerir_*`) y se corre `npm run esquema`
  para regenerar `supabase/esquema-completo.sql` (una prueba lo verifica). Toda tabla nueva lleva `restaurante_id`
  NOT NULL + RLS (una prueba falla si no).
- Pruebas de SQL/RLS: Postgres real en memoria con PGlite (`src/test/base-datos.ts`), no hay Docker ni CLI de Supabase.
- Diseño: objetivos táctiles ≥ 48 px, texto ≥ 16 px, acciones principales abajo, sin `hover`, sin scroll horizontal.
  Verifica cada pantalla a 360×640 y 390×844.
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
- No agregar lo aplazado: facturación electrónica, inventario con recetas, gráficas, WhatsApp automático, impresión
  térmica, pagos en línea, multi-sede, costo de domicilio por zona. Avisos push (`lib/push/`): la llave privada VAPID
  es solo del servidor; los avisos se envían con `after()` y nunca deben hacer fallar la acción que los dispara. Un
  celular deja de recibirlos al salir de la sesión y al reiniciar la demo (salvo el que reinicia): no dejar caminos
  por los que un celular siga suscrito sin que nadie del equipo lo use.
- No hacer push ni despliegues, ni tocar servicios externos, sin avisar antes. Commits pequeños están bien.
- Referencia de patrones (NO copiar módulos de taller ni su auto-deploy): `C:\Users\johan\Desktop\Polo Air Cool`.
