-- =====================================================================
-- COMANDA · 0001 · TABLAS (Supabase / PostgreSQL 15+)
--
-- Reglas de diseño:
--  * MULTI-RESTAURANTE desde la primera tabla: toda tabla de negocio lleva restaurante_id y RLS
--    (ver 0002). Las llaves foráneas son COMPUESTAS (restaurante_id, id): ninguna fila puede apuntar
--    a datos de otro restaurante, ni siquiera por error de código.
--  * DINERO en pesos colombianos ENTEROS (COP no usa decimales). Nunca numeric/float.
--  * ANULAR en vez de borrar: pedidos, ítems, pagos, abonos, gastos y cierres se anulan con motivo
--    (columnas anulado*, constraint chk_anulacion) y el borrado está bloqueado por trigger (0002).
--  * created_at y registrado_por (quién lo hizo) en todo lo que se registra.
--  * Zona horaria del negocio: America/Bogota (columnas "fecha" generadas).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Funciones de fecha (zona horaria de Colombia)
-- ---------------------------------------------------------------------
create or replace function public.fecha_bogota(p timestamptz)
returns date
language sql
immutable
parallel safe
set search_path = ''
as $$ select (p at time zone 'America/Bogota')::date $$;

create or replace function public.hoy_bogota()
returns date
language sql
stable
set search_path = public
as $$ select public.fecha_bogota(now()) $$;

-- ---------------------------------------------------------------------
-- Restaurantes y perfiles
-- ---------------------------------------------------------------------
create table if not exists public.restaurantes (
  id                 uuid primary key default gen_random_uuid(),
  nombre             text not null check (length(btrim(nombre)) > 0),
  es_demo            boolean not null default false,
  consecutivo_pedido integer not null default 0,
  created_at         timestamptz not null default now()
);
comment on table  public.restaurantes is 'Un restaurante = un inquilino (tenant). Todo lo demás cuelga de aquí.';
comment on column public.restaurantes.es_demo is 'true = datos ficticios; solo estos permiten reiniciar_demo().';

-- Un usuario pertenece a UN restaurante (por ahora). El rol se guarda aquí, no en el JWT.
create table if not exists public.perfiles (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  restaurante_id uuid not null references public.restaurantes(id),
  rol            text not null default 'dueno' check (rol in ('dueno', 'ayudante')),
  nombre         text not null check (length(btrim(nombre)) > 0),
  created_at     timestamptz not null default now()
);
create index if not exists idx_perfiles_restaurante on public.perfiles (restaurante_id);

-- ---------------------------------------------------------------------
-- Menú
-- ---------------------------------------------------------------------
create table if not exists public.categorias_producto (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id),
  nombre         text not null check (length(btrim(nombre)) > 0),
  icono          text,                                   -- un emoji; no pesa nada y se ve en cualquier celular
  orden          integer not null default 0,
  activa         boolean not null default true,
  created_at     timestamptz not null default now(),
  registrado_por uuid default auth.uid() references auth.users(id) on delete set null,
  unique (restaurante_id, id)
);
create unique index if not exists ux_categorias_nombre on public.categorias_producto (restaurante_id, lower(nombre)) where activa;

create table if not exists public.productos (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id),
  categoria_id   uuid not null,
  nombre         text not null check (length(btrim(nombre)) > 0),
  precio         integer not null check (precio >= 0 and precio <= 10000000),   -- COP enteros
  disponible     boolean not null default true,     -- "se acabó hoy" (un toque)
  activo         boolean not null default true,     -- archivado = false (no se borra: hay pedidos que lo usan)
  orden          integer not null default 0,
  created_at     timestamptz not null default now(),
  registrado_por uuid default auth.uid() references auth.users(id) on delete set null,
  unique (restaurante_id, id),
  foreign key (restaurante_id, categoria_id) references public.categorias_producto (restaurante_id, id)
);
create index if not exists idx_productos_categoria on public.productos (restaurante_id, categoria_id) where activo;

-- Adiciones ("queso extra +2.000"). categoria_id null = aplica a todos los platos.
create table if not exists public.modificadores (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id),
  categoria_id   uuid,
  nombre         text not null check (length(btrim(nombre)) > 0),
  precio_extra   integer not null default 0 check (precio_extra >= 0 and precio_extra <= 1000000),
  activo         boolean not null default true,
  created_at     timestamptz not null default now(),
  registrado_por uuid default auth.uid() references auth.users(id) on delete set null,
  unique (restaurante_id, id),
  foreign key (restaurante_id, categoria_id) references public.categorias_producto (restaurante_id, id)
);

create table if not exists public.mesas (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id),
  nombre         text not null check (length(btrim(nombre)) > 0),
  orden          integer not null default 0,
  activa         boolean not null default true,
  created_at     timestamptz not null default now(),
  registrado_por uuid default auth.uid() references auth.users(id) on delete set null,
  unique (restaurante_id, id)
);

-- ---------------------------------------------------------------------
-- Clientes (los que fían)
-- ---------------------------------------------------------------------
create table if not exists public.clientes (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id),
  nombre         text not null check (length(btrim(nombre)) > 0),
  -- WhatsApp en E.164, ej. +573001234567 (para el recordatorio de un toque con wa.me)
  telefono       text check (telefono is null or telefono ~ '^\+[1-9][0-9]{7,14}$'),
  activo         boolean not null default true,
  created_at     timestamptz not null default now(),
  registrado_por uuid default auth.uid() references auth.users(id) on delete set null,
  unique (restaurante_id, id)
);
create index if not exists idx_clientes_restaurante on public.clientes (restaurante_id) where activo;

-- ---------------------------------------------------------------------
-- Pedidos
-- ---------------------------------------------------------------------
create table if not exists public.pedidos (
  id                uuid primary key default gen_random_uuid(),
  restaurante_id    uuid not null references public.restaurantes(id),
  numero            integer not null,                       -- consecutivo por restaurante ("Pedido 23")
  tipo              text not null check (tipo in ('mesa', 'llevar', 'domicilio')),
  mesa_id           uuid,
  cliente_id        uuid,
  contacto_nombre   text,
  contacto_telefono text,
  direccion         text,
  estado            text not null default 'pendiente' check (estado in ('pendiente', 'listo', 'entregado')),
  listo_at          timestamptz,
  entregado_at      timestamptz,
  notas             text,
  total             integer not null default 0 check (total >= 0),     -- suma de ítems no anulados, SIN propina
  propina           integer not null default 0 check (propina >= 0),
  cobrado_at        timestamptz,                                        -- null = aún sin cobrar
  fecha             date generated always as (public.fecha_bogota(created_at)) stored,
  fecha_cobro       date generated always as (public.fecha_bogota(cobrado_at)) stored,
  anulado           boolean not null default false,
  anulado_motivo    text,
  anulado_por       uuid references auth.users(id) on delete set null,
  anulado_at        timestamptz,
  created_at        timestamptz not null default now(),
  registrado_por    uuid default auth.uid() references auth.users(id) on delete set null,
  unique (restaurante_id, id),
  unique (restaurante_id, numero),
  foreign key (restaurante_id, mesa_id)    references public.mesas (restaurante_id, id),
  foreign key (restaurante_id, cliente_id) references public.clientes (restaurante_id, id),
  constraint chk_pedido_mesa check (tipo <> 'mesa' or mesa_id is not null),
  constraint chk_anulacion check (
    (anulado = false and anulado_motivo is null and anulado_at is null)
    or (anulado = true and length(btrim(coalesce(anulado_motivo, ''))) > 0 and anulado_at is not null)
  )
);
create index if not exists idx_pedidos_cobro      on public.pedidos (restaurante_id, fecha_cobro) where not anulado;
create index if not exists idx_pedidos_pendientes on public.pedidos (restaurante_id, created_at)
  where not anulado and (cobrado_at is null or estado <> 'entregado');

create table if not exists public.pedido_items (
  id               uuid primary key default gen_random_uuid(),
  restaurante_id   uuid not null references public.restaurantes(id),
  pedido_id        uuid not null,
  producto_id      uuid not null,
  nombre           text not null,                           -- copia del nombre al momento de vender
  precio_unitario  integer not null check (precio_unitario >= 0),   -- copia del precio: cambiar el menú no altera lo vendido
  cantidad         integer not null check (cantidad between 1 and 99),
  adiciones        jsonb not null default '[]'::jsonb,      -- [{id, nombre, precio}] copia de lo elegido
  adiciones_total  integer not null default 0 check (adiciones_total >= 0),
  notas            text,
  subtotal         integer not null check (subtotal >= 0),
  anulado          boolean not null default false,
  anulado_motivo   text,
  anulado_por      uuid references auth.users(id) on delete set null,
  anulado_at       timestamptz,
  created_at       timestamptz not null default now(),
  registrado_por   uuid default auth.uid() references auth.users(id) on delete set null,
  unique (restaurante_id, id),
  foreign key (restaurante_id, pedido_id)   references public.pedidos (restaurante_id, id),
  foreign key (restaurante_id, producto_id) references public.productos (restaurante_id, id),
  constraint chk_item_subtotal check (subtotal = (precio_unitario + adiciones_total) * cantidad),
  constraint chk_anulacion check (
    (anulado = false and anulado_motivo is null and anulado_at is null)
    or (anulado = true and length(btrim(coalesce(anulado_motivo, ''))) > 0 and anulado_at is not null)
  )
);
create index if not exists idx_items_pedido on public.pedido_items (restaurante_id, pedido_id);

-- ---------------------------------------------------------------------
-- Pagos y fiado
-- ---------------------------------------------------------------------
-- monto = lo aplicado a la cuenta (ya sin el vuelto). Para efectivo se guarda además lo recibido y el vuelto.
create table if not exists public.pagos_pedido (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id),
  pedido_id      uuid not null,
  medio          text not null check (medio in ('efectivo', 'transferencia', 'fiado')),   -- transferencia = Nequi/Daviplata/banco
  monto          integer not null check (monto > 0),
  recibido       integer check (recibido is null or recibido > 0),
  vuelto         integer check (vuelto is null or vuelto >= 0),
  referencia     text,                                      -- opcional: referencia de la transferencia
  cliente_id     uuid,                                      -- obligatorio si medio = 'fiado'
  fecha          date generated always as (public.fecha_bogota(created_at)) stored,
  anulado        boolean not null default false,
  anulado_motivo text,
  anulado_por    uuid references auth.users(id) on delete set null,
  anulado_at     timestamptz,
  created_at     timestamptz not null default now(),
  registrado_por uuid default auth.uid() references auth.users(id) on delete set null,
  unique (restaurante_id, id),
  foreign key (restaurante_id, pedido_id)  references public.pedidos (restaurante_id, id),
  foreign key (restaurante_id, cliente_id) references public.clientes (restaurante_id, id),
  constraint chk_pago_efectivo check (
    medio <> 'efectivo' or (recibido is not null and vuelto is not null and recibido >= monto and vuelto = recibido - monto)
  ),
  constraint chk_pago_fiado check (medio <> 'fiado' or cliente_id is not null),
  constraint chk_anulacion check (
    (anulado = false and anulado_motivo is null and anulado_at is null)
    or (anulado = true and length(btrim(coalesce(anulado_motivo, ''))) > 0 and anulado_at is not null)
  )
);
create index if not exists idx_pagos_pedido on public.pagos_pedido (restaurante_id, pedido_id);
create index if not exists idx_pagos_fecha  on public.pagos_pedido (restaurante_id, fecha) where not anulado;

-- Libro del fiado: el saldo de un cliente = cargos - abonos (sin anulados).
create table if not exists public.movimientos_fiado (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id),
  cliente_id     uuid not null,
  tipo           text not null check (tipo in ('cargo', 'abono')),
  monto          integer not null check (monto > 0),
  medio          text check (medio in ('efectivo', 'transferencia')),   -- solo abonos
  referencia     text,
  pedido_id      uuid,                                      -- solo cargos
  pago_id        uuid,                                      -- solo cargos
  nota           text,
  fecha          date generated always as (public.fecha_bogota(created_at)) stored,
  anulado        boolean not null default false,
  anulado_motivo text,
  anulado_por    uuid references auth.users(id) on delete set null,
  anulado_at     timestamptz,
  created_at     timestamptz not null default now(),
  registrado_por uuid default auth.uid() references auth.users(id) on delete set null,
  unique (restaurante_id, id),
  foreign key (restaurante_id, cliente_id) references public.clientes (restaurante_id, id),
  foreign key (restaurante_id, pedido_id)  references public.pedidos (restaurante_id, id),
  foreign key (restaurante_id, pago_id)    references public.pagos_pedido (restaurante_id, id),
  constraint chk_mov_cargo check (tipo <> 'cargo' or (pedido_id is not null and pago_id is not null and medio is null)),
  constraint chk_mov_abono check (tipo <> 'abono' or (medio is not null and pedido_id is null and pago_id is null)),
  constraint chk_anulacion check (
    (anulado = false and anulado_motivo is null and anulado_at is null)
    or (anulado = true and length(btrim(coalesce(anulado_motivo, ''))) > 0 and anulado_at is not null)
  )
);
create index if not exists idx_fiado_cliente on public.movimientos_fiado (restaurante_id, cliente_id) where not anulado;
create index if not exists idx_fiado_fecha   on public.movimientos_fiado (restaurante_id, fecha) where not anulado;

-- ---------------------------------------------------------------------
-- Gastos y cierre del día
-- ---------------------------------------------------------------------
create table if not exists public.gastos (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id),
  fecha          date not null default public.hoy_bogota(),
  monto          integer not null check (monto > 0 and monto <= 100000000),
  categoria      text not null check (categoria in
                   ('carnes', 'verduras', 'pan', 'bebidas', 'gas', 'domiciliario', 'empaques', 'servicios', 'ayudante', 'otros')),
  nota           text,
  foto_path      text,                                      -- ruta en Storage: <restaurante_id>/<archivo>
  de_caja        boolean not null default true,             -- true = salió del efectivo de la caja
  anulado        boolean not null default false,
  anulado_motivo text,
  anulado_por    uuid references auth.users(id) on delete set null,
  anulado_at     timestamptz,
  created_at     timestamptz not null default now(),
  registrado_por uuid default auth.uid() references auth.users(id) on delete set null,
  unique (restaurante_id, id),
  constraint chk_anulacion check (
    (anulado = false and anulado_motivo is null and anulado_at is null)
    or (anulado = true and length(btrim(coalesce(anulado_motivo, ''))) > 0 and anulado_at is not null)
  )
);
create index if not exists idx_gastos_fecha on public.gastos (restaurante_id, fecha) where not anulado;

-- Foto instantánea de lo calculado al cerrar el día (para revisar después sin recalcular).
create table if not exists public.cierres_dia (
  id                  uuid primary key default gen_random_uuid(),
  restaurante_id      uuid not null references public.restaurantes(id),
  fecha               date not null,
  ventas              integer not null,
  propinas            integer not null default 0,
  gastos              integer not null,
  ganancia            integer not null,                     -- ventas - gastos (puede ser negativa)
  cobrado_efectivo    integer not null default 0,
  cobrado_transferencia integer not null default 0,
  fiado_nuevo         integer not null default 0,
  abonos_efectivo     integer not null default 0,
  abonos_transferencia integer not null default 0,
  gastos_caja         integer not null default 0,
  base_caja           integer not null default 0 check (base_caja >= 0),
  efectivo_esperado   integer not null,
  efectivo_contado    integer not null check (efectivo_contado >= 0),
  diferencia          integer not null,                     -- contado - esperado
  notas               text,
  anulado             boolean not null default false,
  anulado_motivo      text,
  anulado_por         uuid references auth.users(id) on delete set null,
  anulado_at          timestamptz,
  created_at          timestamptz not null default now(),
  registrado_por      uuid default auth.uid() references auth.users(id) on delete set null,
  unique (restaurante_id, id),
  constraint chk_anulacion check (
    (anulado = false and anulado_motivo is null and anulado_at is null)
    or (anulado = true and length(btrim(coalesce(anulado_motivo, ''))) > 0 and anulado_at is not null)
  )
);
-- Un solo cierre vigente por día; para rehacerlo hay que anular el anterior con motivo.
create unique index if not exists ux_cierre_vigente on public.cierres_dia (restaurante_id, fecha) where not anulado;
