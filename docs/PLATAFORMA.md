# Plataforma multi-negocio (diseño, aún sin construir)

> Documento de arquitectura. Nada de esto está implementado: es el rumbo acordado para cuando Restaurantes
> deje de ser solo restaurantes. No se construye hasta tener demanda real de un segundo tipo de negocio.

## Visión

Una marca paraguas con un solo despliegue y una sola base. Cada cliente es un **negocio** con su subdominio
(`lagranja.tumarca.com`) y un **tipo** (`comida`, `taller`, `hospedaje`, …). El tipo decide qué pantallas
y módulos se muestran; el núcleo (caja, clientes, fiado, gastos, cierre, sin conexión) es el mismo.

## Decisiones tomadas

| Tema | Decisión |
| --- | --- |
| Dinero | **Pesos enteros** (`integer`) en todo lo nuevo y en lo que se porte. Nadie paga centavos. |
| Usuarios | Un usuario puede pertenecer a **varios negocios** (tabla de membresías, rol por negocio). |
| Marca | Nombre neutro (no de comida); submarcas por vertical solo para páginas de venta. |
| URL | `slug.tumarca.com` para todos los negocios. El tipo es un dato, no parte de la URL. |
| Repos | Restaurantes es el núcleo. **Polo Air Cool no se toca** hasta que haya un segundo taller que lo pida. |

## Núcleo común vs. módulos por tipo

**Núcleo (ya existe en Restaurantes):** negocio (tenant), perfiles y roles, clientes, pagos con anulación y
motivo, gastos con foto, fiado/cartera, cierre del día, cola sin conexión idempotente (`aplicar_operacion`),
modo demo, almacenamiento con prefijo por negocio.

**Módulo comida:** mesas, productos, modificadores, pedidos e ítems.

**Módulo taller (viene de Polo Air Cool, se porta como patrón, no se copia):** vehículos, órdenes de servicio,
evidencias fotográficas, garantías, cotizaciones, citas, inventario, portal público por token.

## Modelo de datos propuesto

1. `restaurantes` → `negocios` con `slug` (único, minúsculas, sin reservados) y `tipo`.
   `restaurante_id` → `negocio_id` en todas las tablas, políticas y funciones.
2. `perfiles` (1 usuario = 1 restaurante) se parte en:
   - `personas`: `user_id`, `nombre` (único solo para mostrar, no global).
   - `membresias`: `user_id`, `negocio_id`, `rol`, `activa`. Única por (`user_id`, `negocio_id`).
3. Negocio activo: lo da el **subdominio**. Las escrituras ya van por RPC, así que cada RPC recibe `negocio_id`
   y verifica la membresía. Las lecturas (RLS) usan "mis negocios" (`negocio_id in (select … membresias …)`) y la
   app filtra por el negocio activo.
4. Reglas heredadas que se mantienen: llaves foráneas compuestas `(negocio_id, id)`, anular con motivo,
   `registrado_por`, RLS en toda tabla nueva.

## Subdominios

- DNS comodín `*.tumarca.com` apuntando al mismo despliegue (en Vercel exige delegar nameservers).
- Un interceptor de Next lee el host, extrae el slug y lo resuelve a un negocio. Antes de escribirlo, leer la guía
  en `node_modules/next/dist/docs/` (esta versión de Next tiene cambios de API: middleware/proxy).
- Cada subdominio es un origen distinto: PWA, service worker y cola sin conexión (localStorage) quedan aislados por
  negocio. Es deseable.
- Slugs reservados: `www`, `app`, `admin`, `api`, `soporte`, y los nombres de verticales.
- Más adelante: dominio propio por cliente apuntando a la misma app.

## Obstáculos conocidos al portar Polo Air Cool

- No tiene tenant: hay que agregar `negocio_id` a todas sus tablas y reescribir RLS.
- `placa` única global y nombre de perfil único global: pasar a únicos por negocio.
- `telefono` obligatorio en E.164 en `clientes`: en el núcleo debe ser opcional.
- Dinero `numeric(12,2)`: migrar a enteros y revisar cada cálculo.
- Está en producción con un cliente real: cualquier cambio exige plan de migración y respaldo.

## Orden sugerido (cuando se decida construir)

1. Vender el producto actual a panaderías y cafeterías (sin desarrollo).
2. Migración `negocios` + `slug` + `tipo` + membresías, con pruebas de RLS entre negocios.
3. Interceptor por subdominio y pantalla de elegir negocio.
4. Segundo vertical como módulo (taller u hospedaje), solo con un cliente que lo pida.

## Fuera de alcance por ahora

Lo aplazado en `CLAUDE.md` sigue aplazado. Comprar dominio, tocar Vercel o DNS requiere aviso y visto bueno
explícito antes de hacerlo.
