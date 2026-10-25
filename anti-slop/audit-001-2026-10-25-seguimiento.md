# Seguimiento de la auditoría antislop 001 · 25 de octubre de 2026

Johan aprobó los números 1, 2, 3, 4, 6, 8, 9, 10, 12 y 13. Los demás (5, 7, 11 y 14) quedaron sin tocar.

## Qué se hizo

**1. El foco de «Volver a dueño» ya se ve.** El botón lleva su anillo en amarillo (11,4:1 sobre el negro). La regla general del foco pasó a la capa base del CSS (`globals.css`); fuera de ella le ganaba a cualquier clase y el arreglo no surtía efecto. En el resto de la app el anillo sigue negro.

**2. El texto de ejemplo de los campos pasa el contraste.** En los campos normales (`input.tsx`) pasó del 70 % al 80 %: 5,76:1. Salió otro caso con el mismo problema: el código grande de `/unirme` estaba al 25 % (1,74:1). Ahora va al 50 %: 3,46:1, suficiente para letra grande.

**3. Los gastos y abonos anulados se leen.** Sin transparencia: tachado, monto en gris (`text-tinta-2`) e ícono con borde punteado y fondo gris, como el resto de lo apagado. La línea «Anulado: motivo» ya existía y se conserva.

**4. Siete pantallas tienen estado de carga.** `/pedir/[slug]`, `/seguimiento/[token]`, `/pedir/[slug]/datos`, `/pedidos-en-linea`, `/mas`, `/gastos/nuevo` y `/qr`. Cada una repite la forma de su página y dice qué está cargando («Cargando el menú…», «Buscando tu pedido…», «Armando el cartel…»).
Consecuencia, documentada por Next 16: con pantalla de carga, la respuesta sale antes de saber si el restaurante existe. Por eso un enlace de un local que no existe llega con código 200 en vez de 404. La pantalla sigue diciendo «Este enlace ya no está disponible» y Next le pone `noindex`, así que los buscadores no la indexan. La prueba de punta a punta ahora comprueba eso en lugar del código.

**6. Raya larga del README.** Cambiada por paréntesis.

**8. La urgencia de la plancha ya no depende solo del color.** «Urgente» lleva un triángulo de alerta y «atención» un reloj de arena, más el texto para lectores de pantalla.

**9. Separadores decorativos.** Las 43 líneas de `src/` y `scripts/` quedaron como una línea simple con el nombre de la sección. Las 12 del guion de pedidos se borraron, porque repetían el `console.log` de la línea siguiente. Las migraciones no se tocaron.

**10. Comentarios largos.** Los 45 bloques de 6 líneas o más quedaron en 2 o 3 líneas con la regla que explican. Se tocaron solo comentarios: las líneas de código son las mismas antes y después (13.868), y los comentarios bajaron de 1.612 a 1.449 líneas.

**12. Interruptor apagado.** Sin `opacity`: riel punteado y gris, texto en gris legible. Hoy ninguna pantalla lo apaga; se revisó leyendo el código.

**13. Color sin uso.** Se borró `--color-linea`.

## Cómo se comprobó

- **Pruebas:** `npm run verificar` pasa (lint, tipos y 660 pruebas). Pasan también `npm run e2e` (trabajo sin conexión) y `npm run e2e:clientes` (pedidos en línea y plancha). Al primer intento la de clientes se cayó dos veces: una por el código 200 del punto 4 y otra porque leía el número del pedido mientras se veía la pantalla de carga. Las dos se corrigieron en la prueba.
- **Recorrido con Chrome** (servidor local, 360×640), elemento por elemento:
  - Entrar a la demo lleva a Inicio.
  - Anular un gasto deja la fila tachada, legible y con «Anulado: Monto mal digitado».
  - En «Ver la app como… → Mesero», al llegar con Tab a «Volver a dueño» se ve el anillo amarillo de 3 px; tocarlo vuelve a la vista de dueño.
  - En `/entrar`, el texto de ejemplo «nombre@gmail.com» sale al 80 % y el foco del campo sigue negro.
  - En la plancha, el pedido de «atención» muestra el reloj de arena (captura de la prueba de punta a punta).
  - La pantalla de carga del seguimiento aparece antes que el pedido (la prueba la vio).
  - Ningún error de JavaScript.
- **Lo que no se pudo ver en pantalla:**
  - El interruptor apagado, porque ninguna pantalla lo usa así; se revisó en el código.
  - Las pantallas de carga del personal, que con la base local duran muy poco para capturarlas; se revisó en el código.

## Pendientes de la auditoría

- **5.** Confirmar si el logo de la llama es definitivo.
- **7.** Escribir por qué se usan los íconos de Lucide (una línea).
- **11.** Insignia de Pendientes a 11,2 px.
- **14.** Diales de diseño (opcional).
