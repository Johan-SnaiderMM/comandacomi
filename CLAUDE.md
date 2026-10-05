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
- Diseño: objetivos táctiles ≥ 48 px, texto ≥ 16 px, acciones principales abajo, sin `hover`, sin scroll horizontal.
  Verifica cada pantalla a 360×640 y 390×844.
- No agregar lo aplazado: facturación electrónica, cocina en tiempo real, inventario con recetas, gráficas,
  cola sin conexión completa, WhatsApp automático, impresión térmica, pagos en línea, multi-sede.
- No hacer push ni despliegues, ni tocar servicios externos, sin avisar antes. Commits pequeños están bien.
- Referencia de patrones (NO copiar módulos de taller ni su auto-deploy): `C:\Users\johan\Desktop\Polo Air Cool`.
