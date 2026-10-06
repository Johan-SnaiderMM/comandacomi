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
- Pedidos hechos sin señal llevan número provisional negativo: mostrar siempre con `numeroVisible()`.
- No agregar lo aplazado: facturación electrónica, cocina en tiempo real, inventario con recetas, gráficas,
  WhatsApp automático, impresión térmica, pagos en línea, multi-sede.
- No hacer push ni despliegues, ni tocar servicios externos, sin avisar antes. Commits pequeños están bien.
- Referencia de patrones (NO copiar módulos de taller ni su auto-deploy): `C:\Users\johan\Desktop\Polo Air Cool`.
