# Comanda (nombre provisional) · demo para restaurantes pequeños

PWA **mobile-first** para dueños de locales pequeños de comida rápida y carnes a la plancha en Colombia:
pedidos por mesa / para llevar / domicilio, cobro en efectivo y Nequi, **fiado**, gastos y **cierre del día**
con resumen por WhatsApp. Es una **demo para enseñar en visitas**: todos los datos son ficticios.

> Se diseña primero para 360×640 y 390×844 (celular Android de gama media/baja, una mano, poca luz o sol).
> En pantallas grandes solo se centra una columna.

## Cómo correrla

Requisitos: Node 22 y npm.

```bash
npm install
cp .env.example .env.local   # en Windows: copy .env.example .env.local
npm run dev                  # http://localhost:3000
```

La marca (nombre, lema, WhatsApp de contacto) se cambia con variables de entorno; ver `.env.example`.
Nunca subas `.env.local`.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` / `npm start` | Compilar y servir en producción |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript sin emitir |
| `npm test` | Pruebas (Vitest) |
| `npm run verificar` | Lint + tipos + pruebas (lo que debe estar en verde) |
| `npm run iconos` | Regenera los íconos de la PWA (`public/icons`) |

## Estructura

```
src/app/            Pantallas (App Router). (app)/ = con barra de navegación inferior
src/components/ui/  Botón, campo, chip, esqueleto, hoja inferior (estilo shadcn/ui, sin Radix)
src/components/layout/  Barra de navegación, barra de acción fija, encabezado
src/lib/            Marca, utilidades
public/             sw.js (solo el cascarón de la PWA), offline.html, íconos
supabase/           Migraciones SQL (se agregan en el paso 2)
```

## Reglas del proyecto

- **UI toda en español.**
- **Dinero en pesos enteros** (COP no usa decimales). Todos los cálculos viven en un solo módulo con pruebas.
- **Anular en vez de borrar**: pedidos, ítems, pagos y gastos se anulan con motivo.
- **Multi-restaurante desde la primera tabla** (`restaurante_id` + RLS).
- **Sin secretos en el repo.** La `service_role` de Supabase no se usa en esta demo.
- El proyecto usa Next.js 16: antes de escribir código lee la guía correspondiente en `node_modules/next/dist/docs/`
  (ver `AGENTS.md`).

## Estado

Paso 1 (cimientos) listo: tokens mobile-first, componentes base, navegación inferior, PWA instalable.
Siguientes: base de datos y RLS, luego pantalla por pantalla.
