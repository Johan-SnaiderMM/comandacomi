# Comanda (nombre provisional) · demo para restaurantes pequeños

PWA **mobile-first** para dueños de locales pequeños de comida rápida y carnes a la plancha en Colombia:
pedidos por mesa / para llevar / domicilio, cobro en efectivo y Nequi, **fiado**, gastos y **cierre del día**
con resumen por WhatsApp. Es una **demo para enseñar en visitas**: todos los datos son ficticios.

Se diseñó primero para **360×640 y 390×844** (celular Android de gama media/baja, una mano, poca luz o sol):
objetivos táctiles de 48 px, texto de 16 px, acciones abajo, sin `hover`, sin scroll horizontal. En pantallas
grandes solo se centra una columna.

## Recorrido de 5 minutos (una sola mano)

1. **Entrar a la demo** (un toque, sin datos) → **Inicio**: ventas de hoy, ganancia aproximada, por cobrar y pendientes.
2. **Tomar** (botón amarillo): mesa → toca los platos (un toque agrega; "Extras y nota" para adiciones) → **Enviar a cocina**.
3. **Pendientes**: **Marcar listo** → **Entregado**.
4. **Cobrar**: efectivo (teclado propio, vuelto), Nequi, o **fiado** (cliente nuevo y pago parcial).
5. **Fiado**: quién debe, **Abonar**, **Recordar** por WhatsApp.
6. **Más → Gastos del día**: registrar un gasto (monto → categoría → guardar, foto opcional).
7. **Más → Cierre del día**: contar el efectivo, ver la diferencia, cerrar y **Enviar resumen por WhatsApp**.
8. **Más → Reiniciar demo**: vuelve todo a los datos de ejemplo.

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

## Cómo reiniciar los datos de ejemplo

- **Desde la app:** *Más → Reiniciar demo*. Borra lo creado (pedidos, gastos, cobros, fiado, cambios al menú) y
  recarga el menú de 25 platos, 6 mesas, 8 clientes con fiado y 7 días de ventas, gastos y cierres. Solo lo permite
  la base en restaurantes de demostración y solo al dueño.
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

### Antes de enseñarla (lista rápida)

- [ ] Abre la URL en tu celular y toca **Entrar a la demo**: debe llegar a Inicio con números.
- [ ] Instálala como app y ábrela desde el ícono (debe abrir en pantalla completa).
- [ ] Haz un pedido de punta a punta y toca **Más → Reiniciar demo** para dejarla limpia.
- [ ] Prueba con mala señal / modo avión: el cascarón debe abrir (los datos nuevos necesitan red).

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

## Estructura

```
src/app/(app)/        Pantallas con barra de navegación: Inicio, Pendientes, Fiado, Más, Gastos, Menú
src/app/(tarea)/      Pantallas de una sola tarea, sin barra: Tomar pedido, Cobrar, Cierre, Nuevo gasto, Ficha de cliente
src/app/acciones/     Acciones del servidor (escrituras): validan con Zod y llaman funciones SQL
src/app/api/foto/     Sirve las fotos de gastos solo con sesión y solo del propio restaurante
src/components/       ui (botón, hoja inferior, teclado numérico…), layout, fiado, gastos, sesión
src/lib/              dinero.ts (TODOS los cálculos), fechas, whatsapp, teclado, esquemas/ (Zod), datos/ (lecturas)
src/lib/local/        Modo local de desarrollo (PGlite)
supabase/migrations/  Tablas, RLS, funciones de lectura/escritura, demo, permisos, almacenamiento
supabase/seed.sql     Carga de la demo en Supabase (idempotente)
public/               sw.js (solo el cascarón de la PWA), offline.html, íconos
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
- **Poco JavaScript:** una prueba impide que Zod (validación, solo servidor) llegue al navegador.
- El proyecto usa Next.js 16: antes de escribir código lee la guía correspondiente en `node_modules/next/dist/docs/`
  (ver `AGENTS.md`).

## Seguridad

- Sin secretos en el repositorio: `.env.example` solo trae nombres. `.env.local` está en `.gitignore`.
- HTTPS lo da Vercel. Cabeceras: CSP, HSTS, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- **Aislamiento entre restaurantes demostrado con pruebas** (`src/test/aislamiento.test.ts`, Postgres real): un
  usuario del restaurante A no puede leer, insertar, modificar, anular ni subir fotos en el B, por ninguna tabla ni
  función; sin sesión no se ejecuta ninguna función ni se lee ninguna tabla.
- **Recordar** (fiado) abre WhatsApp con el teléfono que se guardó al crear el cliente. Los clientes de ejemplo de
  la demo traen teléfonos inventados (bloque +57 300 000 0xxx, podrían ser de alguien real): a esos el enlace no
  les pone número y eliges tú a quién enviarlo. El resumen del cierre tampoco lleva número.

## Qué NO hace (aplazado a propósito)

Facturación electrónica, pantalla de cocina en tiempo real, recetas/inventario con descuento, gráficas, cola sin
conexión completa (solo el cascarón de la PWA está en caché), WhatsApp automático u oficial, impresión térmica,
pagos en línea y multi-sede.

## Problemas frecuentes

- **"La demo todavía no está configurada"** al entrar: faltan variables de entorno en Vercel
  (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `DEMO_EMAIL`, `DEMO_PASSWORD`) o el usuario no existe.
- **Entra pero todo sale vacío o da error:** falta correr `supabase/seed.sql` con el correo del usuario demo.
- **Cambié una migración:** corre `npm run esquema` (una prueba falla si el archivo unido no está al día) y vuelve a
  pegarlo; las funciones nuevas deben terminar con `select public.fn_aplicar_permisos();`.
