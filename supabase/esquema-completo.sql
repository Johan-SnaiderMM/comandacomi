-- =====================================================================
-- COMANDA · ESQUEMA COMPLETO (generado con `npm run esquema`; NO editar a mano)
-- Es la unión de supabase/migrations/*.sql en orden. Pégalo completo en Supabase > SQL Editor.
-- Después ejecuta supabase/seed.sql para cargar los datos de la demo.
-- =====================================================================

-- >>>>>>>>>> 20261005000001_tablas.sql >>>>>>>>>>
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

-- >>>>>>>>>> 20261005000002_seguridad.sql >>>>>>>>>>
-- =====================================================================
-- COMANDA · 0002 · SEGURIDAD: RLS por restaurante, borrado bloqueado, permisos mínimos
--
-- Modelo:
--   * Cada usuario pertenece a UN restaurante (tabla perfiles). mi_restaurante() lo resuelve.
--   * SELECT: una política repetida por tabla -> restaurante_id = mi_restaurante().
--   * ESCRITURA: los roles anon/authenticated NO tienen INSERT/UPDATE/DELETE sobre ninguna tabla.
--     Todo se escribe por funciones RPC (security definer, 0004) que validan restaurante y rol.
--     Así no hay forma de saltarse las reglas de dinero desde el cliente.
--   * BORRADO: además de no tener permiso, un trigger bloquea DELETE en las tablas de dinero
--     (solo se permite durante reiniciar_demo(), que activa una marca de sesión).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Funciones auxiliares (security definer: leen perfiles saltándose su RLS, sin recursión)
-- ---------------------------------------------------------------------
create or replace function public.mi_restaurante()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select restaurante_id from public.perfiles where user_id = auth.uid()
$$;

create or replace function public.es_dueno()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select rol = 'dueno' from public.perfiles where user_id = auth.uid()), false)
$$;

-- Para las funciones de escritura: falla con un mensaje claro si el usuario no tiene restaurante.
create or replace function public.requerir_restaurante()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v uuid := public.mi_restaurante();
begin
  if v is null then
    raise exception 'Tu usuario no tiene un restaurante asignado.' using errcode = '42501';
  end if;
  return v;
end $$;

create or replace function public.requerir_dueno()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v uuid := public.requerir_restaurante();
begin
  if not public.es_dueno() then
    raise exception 'Solo el dueño puede hacer esto.' using errcode = '42501';
  end if;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- RLS: activada en TODAS las tablas
-- ---------------------------------------------------------------------
alter table public.restaurantes        enable row level security;
alter table public.perfiles            enable row level security;
alter table public.categorias_producto enable row level security;
alter table public.productos           enable row level security;
alter table public.modificadores       enable row level security;
alter table public.mesas               enable row level security;
alter table public.clientes            enable row level security;
alter table public.pedidos             enable row level security;
alter table public.pedido_items        enable row level security;
alter table public.pagos_pedido        enable row level security;
alter table public.movimientos_fiado   enable row level security;
alter table public.gastos              enable row level security;
alter table public.cierres_dia         enable row level security;

drop policy if exists restaurantes_select on public.restaurantes;
create policy restaurantes_select on public.restaurantes
  for select to authenticated using (id = (select public.mi_restaurante()));

drop policy if exists perfiles_select on public.perfiles;
create policy perfiles_select on public.perfiles
  for select to authenticated using (restaurante_id = (select public.mi_restaurante()));

-- La misma política en todas las tablas de negocio (una sola definición, repetida).
do $$
declare
  t text;
begin
  foreach t in array array[
    'categorias_producto', 'productos', 'modificadores', 'mesas', 'clientes',
    'pedidos', 'pedido_items', 'pagos_pedido', 'movimientos_fiado', 'gastos', 'cierres_dia'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (restaurante_id = (select public.mi_restaurante()))',
      t || '_select', t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Permisos: solo lectura para usuarios autenticados; nada para anónimos.
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
grant select on
  public.restaurantes, public.perfiles, public.categorias_producto, public.productos,
  public.modificadores, public.mesas, public.clientes, public.pedidos, public.pedido_items,
  public.pagos_pedido, public.movimientos_fiado, public.gastos, public.cierres_dia
to authenticated;

-- Tablas nuevas que se creen después tampoco quedan abiertas por defecto.
alter default privileges in schema public revoke all on tables from anon, authenticated;

-- ---------------------------------------------------------------------
-- Anular en vez de borrar: DELETE bloqueado en las tablas de dinero (incluso para el dueño de la base).
-- Única excepción: reiniciar_demo() activa app.reiniciando_demo durante su transacción.
-- ---------------------------------------------------------------------
create or replace function public.fn_bloquear_borrado()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if coalesce(current_setting('app.reiniciando_demo', true), '') = 'on' then
    return old;
  end if;
  raise exception 'No se puede borrar %: se anula con motivo.', tg_table_name using errcode = '42501';
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['pedidos', 'pedido_items', 'pagos_pedido', 'movimientos_fiado', 'gastos', 'cierres_dia'] loop
    execute format('drop trigger if exists trg_bloquear_borrado on public.%I', t);
    execute format(
      'create trigger trg_bloquear_borrado before delete on public.%I for each row execute function public.fn_bloquear_borrado()',
      t
    );
  end loop;
end $$;

-- >>>>>>>>>> 20261005000003_lectura.sql >>>>>>>>>>
-- =====================================================================
-- COMANDA · 0003 · FUNCIONES DE LECTURA (una consulta por pantalla)
--
-- Cada pantalla pide TODO lo que necesita en una sola llamada (menos viajes = más rápido con mala señal).
-- Son "security invoker": se ejecutan con los permisos del usuario, así que el RLS de 0002 filtra por
-- restaurante automáticamente. Devuelven jsonb.
-- Las funciones fn_* son internas: no son ejecutables por usuarios (ver 0006).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Internas
-- ---------------------------------------------------------------------

-- Saldo de fiado de un cliente: cargos - abonos (sin anulados).
create or replace function public.fn_saldo_cliente(p_rest uuid, p_cliente uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(case tipo when 'cargo' then monto else -monto end), 0)::integer
    from public.movimientos_fiado
   where restaurante_id = p_rest and cliente_id = p_cliente and not anulado
$$;

-- Resumen de un día (ventas, gastos, ganancia, efectivo esperado). Lo usan el cierre y la pantalla de cierre.
--   ventas            = suma de pedidos cobrados ese día (sin propina), incluidos los fiados
--   ganancia          = ventas - gastos (aproximada: no descuenta costo de platos)
--   efectivo esperado = base + efectivo cobrado (con propina) + abonos en efectivo - gastos que salieron de caja
create or replace function public.fn_resumen_dia(p_rest uuid, p_fecha date, p_base integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_ventas int; v_propinas int; v_pedidos int;
  v_efectivo int; v_transf int; v_fiado int;
  v_gastos int; v_gastos_caja int;
  v_abonos_efectivo int; v_abonos_transf int;
begin
  select coalesce(sum(total), 0), coalesce(sum(propina), 0), count(*)
    into v_ventas, v_propinas, v_pedidos
    from public.pedidos
   where restaurante_id = p_rest and fecha_cobro = p_fecha and not anulado;

  select coalesce(sum(monto) filter (where medio = 'efectivo'), 0),
         coalesce(sum(monto) filter (where medio = 'transferencia'), 0),
         coalesce(sum(monto) filter (where medio = 'fiado'), 0)
    into v_efectivo, v_transf, v_fiado
    from public.pagos_pedido
   where restaurante_id = p_rest and fecha = p_fecha and not anulado;

  select coalesce(sum(monto), 0), coalesce(sum(monto) filter (where de_caja), 0)
    into v_gastos, v_gastos_caja
    from public.gastos
   where restaurante_id = p_rest and fecha = p_fecha and not anulado;

  select coalesce(sum(monto) filter (where medio = 'efectivo'), 0),
         coalesce(sum(monto) filter (where medio = 'transferencia'), 0)
    into v_abonos_efectivo, v_abonos_transf
    from public.movimientos_fiado
   where restaurante_id = p_rest and fecha = p_fecha and tipo = 'abono' and not anulado;

  return jsonb_build_object(
    'fecha', p_fecha,
    'pedidos', v_pedidos,
    'ventas', v_ventas,
    'propinas', v_propinas,
    'cobrado_efectivo', v_efectivo,
    'cobrado_transferencia', v_transf,
    'fiado_nuevo', v_fiado,
    'abonos_efectivo', v_abonos_efectivo,
    'abonos_transferencia', v_abonos_transf,
    'gastos', v_gastos,
    'gastos_caja', v_gastos_caja,
    'ganancia', v_ventas - v_gastos,
    'base_caja', p_base,
    'efectivo_esperado', p_base + v_efectivo + v_abonos_efectivo - v_gastos_caja
  );
end $$;

-- ---------------------------------------------------------------------
-- Contexto de la sesión (nombre del restaurante, rol)
-- ---------------------------------------------------------------------
create or replace function public.obtener_contexto()
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'restaurante', (select jsonb_build_object('id', r.id, 'nombre', r.nombre, 'es_demo', r.es_demo)
                      from public.restaurantes r limit 1),
    'perfil', (select jsonb_build_object('nombre', p.nombre, 'rol', p.rol)
                 from public.perfiles p where p.user_id = auth.uid())
  )
$$;

-- ---------------------------------------------------------------------
-- 2. Inicio: ventas de hoy, ganancia aproximada, por cobrar y pendientes
-- ---------------------------------------------------------------------
create or replace function public.obtener_inicio()
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_hoy date := public.hoy_bogota();
  v_ayer date := public.hoy_bogota() - 1;
  v_ventas_hoy int; v_ventas_ayer int; v_gastos_hoy int; v_gastos_ayer int; v_pedidos_hoy int;
  v_por_cobrar int; v_deudores int; v_pendientes int; v_sin_cobrar int;
begin
  select coalesce(sum(total) filter (where fecha_cobro = v_hoy), 0),
         coalesce(sum(total) filter (where fecha_cobro = v_ayer), 0),
         count(*) filter (where fecha_cobro = v_hoy)
    into v_ventas_hoy, v_ventas_ayer, v_pedidos_hoy
    from public.pedidos
   where not anulado and fecha_cobro in (v_hoy, v_ayer);

  select coalesce(sum(monto) filter (where fecha = v_hoy), 0),
         coalesce(sum(monto) filter (where fecha = v_ayer), 0)
    into v_gastos_hoy, v_gastos_ayer
    from public.gastos
   where not anulado and fecha in (v_hoy, v_ayer);

  select coalesce(sum(saldo), 0), count(*)
    into v_por_cobrar, v_deudores
    from (
      select sum(case tipo when 'cargo' then monto else -monto end) as saldo
        from public.movimientos_fiado
       where not anulado
       group by cliente_id
      having sum(case tipo when 'cargo' then monto else -monto end) > 0
    ) s;

  select count(*),
         count(*) filter (where cobrado_at is null)
    into v_pendientes, v_sin_cobrar
    from public.pedidos
   where not anulado and (cobrado_at is null or estado <> 'entregado');

  return jsonb_build_object(
    'fecha', v_hoy,
    'ventas_hoy', v_ventas_hoy,
    'gastos_hoy', v_gastos_hoy,
    'ganancia_hoy', v_ventas_hoy - v_gastos_hoy,
    'pedidos_hoy', v_pedidos_hoy,
    'ventas_ayer', v_ventas_ayer,
    'gastos_ayer', v_gastos_ayer,
    'ganancia_ayer', v_ventas_ayer - v_gastos_ayer,
    'por_cobrar', v_por_cobrar,
    'clientes_con_deuda', v_deudores,
    'pedidos_pendientes', v_pendientes,
    'pedidos_sin_cobrar', v_sin_cobrar
  );
end $$;

-- Solo el contador de la insignia de la barra de navegación (consulta mínima).
create or replace function public.contar_pendientes()
returns integer
language sql
stable
set search_path = public, pg_temp
as $$
  select count(*)::integer from public.pedidos where not anulado and (cobrado_at is null or estado <> 'entregado')
$$;

-- ---------------------------------------------------------------------
-- 3. Tomar pedido: menú, adiciones y mesas (con su estado) en una sola llamada
-- ---------------------------------------------------------------------
create or replace function public.obtener_menu_para_pedido()
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'categorias', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre, 'icono', c.icono) order by c.orden, c.nombre)
        from public.categorias_producto c where c.activa), '[]'::jsonb),
    'productos', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'categoria_id', p.categoria_id, 'nombre', p.nombre,
                                          'precio', p.precio, 'disponible', p.disponible) order by p.orden, p.nombre)
        from public.productos p where p.activo), '[]'::jsonb),
    'modificadores', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'categoria_id', m.categoria_id, 'nombre', m.nombre,
                                          'precio_extra', m.precio_extra) order by m.precio_extra, m.nombre)
        from public.modificadores m where m.activo), '[]'::jsonb),
    'mesas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id, 'nombre', t.nombre,
               'pedido_abierto', (select o.id from public.pedidos o
                                   where o.mesa_id = t.id and not o.anulado and o.cobrado_at is null
                                   order by o.created_at desc limit 1)
             ) order by t.orden, t.nombre)
        from public.mesas t where t.activa), '[]'::jsonb)
  )
$$;

-- ---------------------------------------------------------------------
-- 4. Pedidos pendientes (cocina simple): por entregar o por cobrar, el más viejo primero
-- ---------------------------------------------------------------------
create or replace function public.listar_pedidos_pendientes()
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(x.fila order by x.created_at, x.numero), '[]'::jsonb)
    from (
      select p.created_at, p.numero,
             jsonb_build_object(
               'id', p.id, 'numero', p.numero, 'tipo', p.tipo, 'estado', p.estado,
               'created_at', p.created_at, 'total', p.total, 'cobrado', p.cobrado_at is not null,
               'mesa', m.nombre, 'contacto_nombre', p.contacto_nombre,
               'contacto_telefono', p.contacto_telefono, 'direccion', p.direccion, 'notas', p.notas,
               'items', coalesce((
                 select jsonb_agg(jsonb_build_object('id', i.id, 'nombre', i.nombre, 'cantidad', i.cantidad,
                                                     'notas', i.notas, 'adiciones', i.adiciones)
                                  order by i.created_at, i.id)
                   from public.pedido_items i where i.pedido_id = p.id and not i.anulado), '[]'::jsonb)
             ) as fila
        from public.pedidos p
        left join public.mesas m on m.id = p.mesa_id
       where not p.anulado and (p.cobrado_at is null or p.estado <> 'entregado')
    ) x
$$;

-- Pedidos cobrados hoy (para revisar o anular un cobro con motivo).
create or replace function public.listar_pedidos_cobrados_hoy()
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(x.fila order by x.cobrado_at desc), '[]'::jsonb)
    from (
      select p.cobrado_at,
             jsonb_build_object(
               'id', p.id, 'numero', p.numero, 'tipo', p.tipo, 'mesa', m.nombre,
               'contacto_nombre', p.contacto_nombre, 'total', p.total, 'propina', p.propina,
               'cobrado_at', p.cobrado_at,
               'medios', coalesce((select jsonb_agg(distinct g.medio) from public.pagos_pedido g
                                    where g.pedido_id = p.id and not g.anulado), '[]'::jsonb)
             ) as fila
        from public.pedidos p
        left join public.mesas m on m.id = p.mesa_id
       where not p.anulado and p.fecha_cobro = public.hoy_bogota()
       order by p.cobrado_at desc
       limit 40
    ) x
$$;

-- ---------------------------------------------------------------------
-- 5. Cobrar: el pedido con sus ítems y los clientes que pueden fiar
-- ---------------------------------------------------------------------
create or replace function public.obtener_pedido(p_pedido_id uuid)
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v jsonb;
begin
  select jsonb_build_object(
    'pedido', jsonb_build_object(
      'id', p.id, 'numero', p.numero, 'tipo', p.tipo, 'estado', p.estado, 'created_at', p.created_at,
      'mesa', m.nombre, 'contacto_nombre', p.contacto_nombre, 'contacto_telefono', p.contacto_telefono,
      'direccion', p.direccion, 'notas', p.notas, 'total', p.total, 'propina', p.propina,
      'cobrado', p.cobrado_at is not null, 'cobrado_at', p.cobrado_at, 'anulado', p.anulado
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'nombre', i.nombre, 'cantidad', i.cantidad,
                                          'precio_unitario', i.precio_unitario, 'adiciones', i.adiciones,
                                          'adiciones_total', i.adiciones_total, 'notas', i.notas,
                                          'subtotal', i.subtotal)
                       order by i.created_at, i.id)
        from public.pedido_items i where i.pedido_id = p.id and not i.anulado), '[]'::jsonb),
    'pagos', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'medio', g.medio, 'monto', g.monto, 'recibido', g.recibido,
                                          'vuelto', g.vuelto, 'referencia', g.referencia, 'cliente_id', g.cliente_id)
                       order by g.created_at, g.id)
        from public.pagos_pedido g where g.pedido_id = p.id and not g.anulado), '[]'::jsonb)
  )
    into v
    from public.pedidos p
    left join public.mesas m on m.id = p.mesa_id
   where p.id = p_pedido_id;

  if v is null then
    raise exception 'El pedido no existe.' using errcode = 'P0002';
  end if;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- 6. Fiado: quién debe y cuánto
-- ---------------------------------------------------------------------
-- Clientes activos con su saldo y desde cuándo deben (las deudas se pagan de la más vieja a la más nueva).
create or replace function public.listar_clientes()
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(x.fila order by x.saldo desc, x.nombre), '[]'::jsonb)
    from (
      select c.nombre, s.saldo,
             jsonb_build_object(
               'id', c.id, 'nombre', c.nombre, 'telefono', c.telefono, 'saldo', s.saldo,
               'debe_desde', case when s.saldo > 0 then (
                 select min(y.fecha)
                   from (
                     select g.fecha,
                            sum(g.monto) over (order by g.created_at desc, g.id desc
                                               rows between unbounded preceding and 1 preceding) as antes
                       from public.movimientos_fiado g
                      where g.cliente_id = c.id and g.tipo = 'cargo' and not g.anulado
                   ) y
                  where coalesce(y.antes, 0) < s.saldo
               ) end
             ) as fila
        from public.clientes c
        cross join lateral (
          select coalesce(sum(case g.tipo when 'cargo' then g.monto else -g.monto end), 0)::integer as saldo
            from public.movimientos_fiado g
           where g.cliente_id = c.id and not g.anulado
        ) s
       where c.activo
    ) x
$$;

create or replace function public.obtener_cliente_fiado(p_cliente_id uuid)
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v jsonb;
begin
  select jsonb_build_object(
    'cliente', jsonb_build_object('id', c.id, 'nombre', c.nombre, 'telefono', c.telefono),
    'saldo', (select coalesce(sum(case g.tipo when 'cargo' then g.monto else -g.monto end), 0)
                from public.movimientos_fiado g where g.cliente_id = c.id and not g.anulado),
    'movimientos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', g.id, 'tipo', g.tipo, 'monto', g.monto, 'medio', g.medio, 'referencia', g.referencia,
               'pedido_numero', o.numero, 'created_at', g.created_at, 'fecha', g.fecha,
               'anulado', g.anulado, 'anulado_motivo', g.anulado_motivo)
             order by g.created_at desc, g.id desc)
        from (select * from public.movimientos_fiado
               where cliente_id = c.id order by created_at desc, id desc limit 60) g
        left join public.pedidos o on o.id = g.pedido_id), '[]'::jsonb)
  )
    into v
    from public.clientes c
   where c.id = p_cliente_id;

  if v is null then
    raise exception 'El cliente no existe.' using errcode = 'P0002';
  end if;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- 7. Gastos del día
-- ---------------------------------------------------------------------
create or replace function public.listar_gastos(p_fecha date default null)
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_fecha date := coalesce(p_fecha, public.hoy_bogota());
begin
  return jsonb_build_object(
    'fecha', v_fecha,
    'total', (select coalesce(sum(monto), 0) from public.gastos where fecha = v_fecha and not anulado),
    'gastos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', g.id, 'monto', g.monto, 'categoria', g.categoria, 'nota', g.nota, 'foto_path', g.foto_path,
               'de_caja', g.de_caja, 'created_at', g.created_at, 'anulado', g.anulado,
               'anulado_motivo', g.anulado_motivo) order by g.created_at desc, g.id desc)
        from public.gastos g where g.fecha = v_fecha), '[]'::jsonb)
  );
end $$;

-- ---------------------------------------------------------------------
-- 8. Cierre del día
-- ---------------------------------------------------------------------
create or replace function public.obtener_resumen_dia(p_fecha date default null, p_base integer default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_restaurante();
  v_fecha date := coalesce(p_fecha, public.hoy_bogota());
  v_cierre jsonb;
  v_base int;
begin
  select to_jsonb(c) into v_cierre
    from public.cierres_dia c
   where c.restaurante_id = v_rest and c.fecha = v_fecha and not c.anulado;

  v_base := coalesce(p_base, (v_cierre ->> 'base_caja')::int, 0);

  return jsonb_build_object(
    'resumen', public.fn_resumen_dia(v_rest, v_fecha, v_base),
    'cierre', v_cierre,
    'cierres_recientes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'fecha', c.fecha, 'ventas', c.ventas, 'gastos', c.gastos, 'ganancia', c.ganancia,
               'efectivo_esperado', c.efectivo_esperado, 'efectivo_contado', c.efectivo_contado,
               'diferencia', c.diferencia) order by c.fecha desc)
        from (select * from public.cierres_dia
               where restaurante_id = v_rest and not anulado order by fecha desc limit 7) c), '[]'::jsonb)
  );
end $$;

-- ---------------------------------------------------------------------
-- 9. Menú (administración)
-- ---------------------------------------------------------------------
create or replace function public.listar_menu_admin()
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'categorias', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'nombre', c.nombre, 'icono', c.icono, 'orden', c.orden, 'activa', c.activa,
               'productos', coalesce((
                 select jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre, 'precio', p.precio,
                                                     'disponible', p.disponible, 'orden', p.orden)
                                  order by p.orden, p.nombre)
                   from public.productos p where p.categoria_id = c.id and p.activo), '[]'::jsonb)
             ) order by c.orden, c.nombre)
        from public.categorias_producto c), '[]'::jsonb),
    'modificadores', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'categoria_id', m.categoria_id, 'nombre', m.nombre,
                                          'precio_extra', m.precio_extra) order by m.categoria_id nulls first, m.nombre)
        from public.modificadores m where m.activo), '[]'::jsonb)
  )
$$;

-- >>>>>>>>>> 20261005000004_escritura.sql >>>>>>>>>>
-- =====================================================================
-- COMANDA · 0004 · FUNCIONES DE ESCRITURA (única vía para crear o cambiar datos)
--
-- Son "security definer": se ejecutan con permisos del dueño de la base y por eso CADA UNA:
--   1. resuelve el restaurante del usuario con requerir_restaurante() / requerir_dueno(),
--   2. filtra TODO por ese restaurante_id (nunca confía en ids que mande el cliente),
--   3. recalcula precios y totales desde la base (el cliente no puede mandar un precio),
--   4. anula con motivo en vez de borrar.
-- Los mensajes de error van en español porque llegan tal cual a la pantalla.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Internas
-- ---------------------------------------------------------------------
create or replace function public.fn_pesos(n integer)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$ select '$ ' || replace(to_char(n, 'FM999,999,999,999'), ',', '.') $$;

-- Motivo de anulación: obligatorio, recortado a 200 caracteres.
create or replace function public.fn_motivo(p_motivo text)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v text := left(btrim(coalesce(p_motivo, '')), 200);
begin
  if length(v) = 0 then
    raise exception 'Escribe el motivo de la anulación.';
  end if;
  return v;
end $$;

-- Teléfono -> E.164 (+57...). Acepta "300 123 4567", "573001234567", "+573001234567". Devuelve null si no es válido.
create or replace function public.fn_normalizar_telefono(p_tel text)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_digitos text := regexp_replace(coalesce(p_tel, ''), '\D', '', 'g');
begin
  if length(v_digitos) = 10 and left(v_digitos, 1) = '3' then
    return '+57' || v_digitos;
  elsif length(v_digitos) = 12 and left(v_digitos, 2) = '57' then
    return '+' || v_digitos;
  elsif left(btrim(coalesce(p_tel, '')), 1) = '+' and length(v_digitos) between 8 and 15 then
    return '+' || v_digitos;
  end if;
  return null;
end $$;

-- Agrega ítems a un pedido leyendo precios y adiciones DE LA BASE, y recalcula el total.
-- p_items: [{producto_id, cantidad, adiciones: [modificador_id], notas}]
create or replace function public.fn_agregar_items(p_rest uuid, p_pedido uuid, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_it jsonb;
  v_prod public.productos%rowtype;
  v_cant int;
  v_ids uuid[];
  v_pedidas int;
  v_encontradas int;
  v_adic jsonb;
  v_adic_total int;
  v_notas text;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Agrega al menos un plato.';
  end if;
  if jsonb_array_length(p_items) > 60 then
    raise exception 'El pedido tiene demasiados platos.';
  end if;

  for v_it in select value from jsonb_array_elements(p_items) loop
    v_cant := coalesce((v_it ->> 'cantidad')::int, 1);
    if v_cant < 1 or v_cant > 99 then
      raise exception 'La cantidad debe estar entre 1 y 99.';
    end if;

    select * into v_prod
      from public.productos
     where id = (v_it ->> 'producto_id')::uuid and restaurante_id = p_rest and activo;
    if not found then
      raise exception 'Uno de los platos ya no existe.' using errcode = 'P0002';
    end if;
    if not v_prod.disponible then
      raise exception '% no está disponible hoy.', v_prod.nombre;
    end if;

    select coalesce(array_agg(distinct value::uuid), '{}')
      into v_ids
      from jsonb_array_elements_text(coalesce(v_it -> 'adiciones', '[]'::jsonb));
    v_pedidas := coalesce(array_length(v_ids, 1), 0);

    select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'nombre', m.nombre, 'precio', m.precio_extra)
                              order by m.precio_extra, m.nombre), '[]'::jsonb),
           coalesce(sum(m.precio_extra), 0)::int,
           count(*)
      into v_adic, v_adic_total, v_encontradas
      from public.modificadores m
     where m.restaurante_id = p_rest and m.activo and m.id = any (v_ids)
       and (m.categoria_id is null or m.categoria_id = v_prod.categoria_id);
    if v_encontradas <> v_pedidas then
      raise exception 'Una adición de % ya no está disponible.', v_prod.nombre;
    end if;

    v_notas := nullif(left(btrim(coalesce(v_it ->> 'notas', '')), 120), '');

    insert into public.pedido_items
      (restaurante_id, pedido_id, producto_id, nombre, precio_unitario, cantidad, adiciones, adiciones_total, notas, subtotal)
    values
      (p_rest, p_pedido, v_prod.id, v_prod.nombre, v_prod.precio, v_cant, v_adic, v_adic_total, v_notas,
       (v_prod.precio + v_adic_total) * v_cant);
  end loop;

  update public.pedidos
     set total = (select coalesce(sum(subtotal), 0) from public.pedido_items where pedido_id = p_pedido and not anulado)
   where id = p_pedido and restaurante_id = p_rest;
end $$;

-- ---------------------------------------------------------------------
-- 3. Pedidos
-- ---------------------------------------------------------------------
create or replace function public.crear_pedido(
  p_tipo text,
  p_mesa_id uuid,
  p_items jsonb,
  p_contacto_nombre text default null,
  p_contacto_telefono text default null,
  p_direccion text default null,
  p_notas text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_restaurante();
  v_id uuid := gen_random_uuid();
  v_num int;
  v_tel text;
  v_total int;
begin
  if p_tipo is null or p_tipo not in ('mesa', 'llevar', 'domicilio') then
    raise exception 'El tipo de pedido no es válido.';
  end if;

  if p_tipo = 'mesa' then
    if p_mesa_id is null then
      raise exception 'Elige una mesa.';
    end if;
    perform 1 from public.mesas where id = p_mesa_id and restaurante_id = v_rest and activa;
    if not found then
      raise exception 'La mesa no existe.' using errcode = 'P0002';
    end if;
  else
    p_mesa_id := null;
  end if;

  if p_tipo = 'domicilio' and length(btrim(coalesce(p_direccion, ''))) = 0 then
    raise exception 'Escribe la dirección del domicilio.';
  end if;

  v_tel := null;
  if length(btrim(coalesce(p_contacto_telefono, ''))) > 0 then
    v_tel := public.fn_normalizar_telefono(p_contacto_telefono);
    if v_tel is null then
      raise exception 'El teléfono no es válido. Escríbelo con 10 dígitos, por ejemplo 300 123 4567.';
    end if;
  end if;

  update public.restaurantes
     set consecutivo_pedido = consecutivo_pedido + 1
   where id = v_rest
  returning consecutivo_pedido into v_num;

  insert into public.pedidos
    (id, restaurante_id, numero, tipo, mesa_id, contacto_nombre, contacto_telefono, direccion, notas)
  values
    (v_id, v_rest, v_num, p_tipo, p_mesa_id,
     nullif(left(btrim(coalesce(p_contacto_nombre, '')), 60), ''), v_tel,
     nullif(left(btrim(coalesce(p_direccion, '')), 120), ''),
     nullif(left(btrim(coalesce(p_notas, '')), 200), ''));

  perform public.fn_agregar_items(v_rest, v_id, p_items);

  select total into v_total from public.pedidos where id = v_id;
  return jsonb_build_object('id', v_id, 'numero', v_num, 'total', v_total);
end $$;

-- Agregar platos a un pedido que todavía no se cobra (la mesa pidió más).
create or replace function public.agregar_items_pedido(p_pedido_id uuid, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_restaurante();
  v_ped public.pedidos%rowtype;
  v_total int;
begin
  select * into v_ped from public.pedidos where id = p_pedido_id and restaurante_id = v_rest for update;
  if not found or v_ped.anulado then
    raise exception 'El pedido no existe o está anulado.' using errcode = 'P0002';
  end if;
  if v_ped.cobrado_at is not null then
    raise exception 'Este pedido ya está cobrado: crea uno nuevo.';
  end if;

  perform public.fn_agregar_items(v_rest, p_pedido_id, p_items);

  -- Lo nuevo hay que prepararlo: el pedido vuelve a "pendiente".
  update public.pedidos
     set estado = 'pendiente', listo_at = null, entregado_at = null
   where id = p_pedido_id and restaurante_id = v_rest;

  select total into v_total from public.pedidos where id = p_pedido_id;
  return jsonb_build_object('id', p_pedido_id, 'numero', v_ped.numero, 'total', v_total);
end $$;

create or replace function public.cambiar_estado_pedido(p_pedido_id uuid, p_estado text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_restaurante();
  v_ped public.pedidos%rowtype;
begin
  if p_estado is null or p_estado not in ('pendiente', 'listo', 'entregado') then
    raise exception 'El estado no es válido.';
  end if;

  select * into v_ped from public.pedidos where id = p_pedido_id and restaurante_id = v_rest for update;
  if not found or v_ped.anulado then
    raise exception 'El pedido no existe o está anulado.' using errcode = 'P0002';
  end if;

  update public.pedidos
     set estado = p_estado,
         listo_at = case p_estado when 'pendiente' then null else coalesce(listo_at, now()) end,
         entregado_at = case p_estado when 'entregado' then now() else null end
   where id = p_pedido_id and restaurante_id = v_rest;

  return jsonb_build_object('id', p_pedido_id, 'estado', p_estado);
end $$;

-- ---------------------------------------------------------------------
-- 5. Cobrar
-- ---------------------------------------------------------------------
-- p_pagos: [{medio: 'efectivo'|'transferencia'|'fiado', monto, recibido?, referencia?, cliente_id?}]
-- La suma de los montos debe ser exactamente total + propina. El vuelto se calcula aquí.
create or replace function public.cobrar_pedido(p_pedido_id uuid, p_propina integer, p_pagos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_restaurante();
  v_ped public.pedidos%rowtype;
  v_pago jsonb;
  v_medio text;
  v_monto int;
  v_recibido int;
  v_cliente uuid;
  v_ref text;
  v_pago_id uuid;
  v_suma int := 0;
  v_vuelto int := 0;
  v_fiado int := 0;
  v_debido int;
begin
  select * into v_ped from public.pedidos where id = p_pedido_id and restaurante_id = v_rest for update;
  if not found or v_ped.anulado then
    raise exception 'El pedido no existe o está anulado.' using errcode = 'P0002';
  end if;
  if v_ped.cobrado_at is not null then
    raise exception 'Este pedido ya está cobrado.';
  end if;
  if v_ped.total <= 0 then
    raise exception 'El pedido no tiene platos para cobrar.';
  end if;

  p_propina := coalesce(p_propina, 0);
  if p_propina < 0 or p_propina > v_ped.total then
    raise exception 'La propina no es válida.';
  end if;
  if p_pagos is null or jsonb_typeof(p_pagos) <> 'array' or jsonb_array_length(p_pagos) = 0 then
    raise exception 'Elige cómo se paga.';
  end if;

  v_debido := v_ped.total + p_propina;

  -- Primera pasada: validar todo y sumar.
  for v_pago in select value from jsonb_array_elements(p_pagos) loop
    v_medio := v_pago ->> 'medio';
    v_monto := (v_pago ->> 'monto')::int;
    if v_medio is null or v_medio not in ('efectivo', 'transferencia', 'fiado') then
      raise exception 'El medio de pago no es válido.';
    end if;
    if v_monto is null or v_monto <= 0 then
      raise exception 'El valor de cada pago debe ser mayor que cero.';
    end if;
    v_suma := v_suma + v_monto;
  end loop;

  if v_suma <> v_debido then
    raise exception 'Los pagos suman % y el total a cobrar es %.', public.fn_pesos(v_suma), public.fn_pesos(v_debido);
  end if;

  -- Segunda pasada: registrar.
  for v_pago in select value from jsonb_array_elements(p_pagos) loop
    v_medio := v_pago ->> 'medio';
    v_monto := (v_pago ->> 'monto')::int;
    v_pago_id := gen_random_uuid();

    if v_medio = 'efectivo' then
      v_recibido := coalesce((v_pago ->> 'recibido')::int, v_monto);
      if v_recibido < v_monto then
        raise exception 'El efectivo recibido (%) es menor que lo que se cobra en efectivo (%).',
          public.fn_pesos(v_recibido), public.fn_pesos(v_monto);
      end if;
      insert into public.pagos_pedido (id, restaurante_id, pedido_id, medio, monto, recibido, vuelto)
      values (v_pago_id, v_rest, p_pedido_id, 'efectivo', v_monto, v_recibido, v_recibido - v_monto);
      v_vuelto := v_vuelto + (v_recibido - v_monto);

    elsif v_medio = 'transferencia' then
      v_ref := nullif(left(btrim(coalesce(v_pago ->> 'referencia', '')), 60), '');
      insert into public.pagos_pedido (id, restaurante_id, pedido_id, medio, monto, referencia)
      values (v_pago_id, v_rest, p_pedido_id, 'transferencia', v_monto, v_ref);

    else -- fiado
      v_cliente := (v_pago ->> 'cliente_id')::uuid;
      if v_cliente is null then
        raise exception 'Elige a quién se le fía.';
      end if;
      perform 1 from public.clientes where id = v_cliente and restaurante_id = v_rest and activo;
      if not found then
        raise exception 'El cliente no existe.' using errcode = 'P0002';
      end if;
      insert into public.pagos_pedido (id, restaurante_id, pedido_id, medio, monto, cliente_id)
      values (v_pago_id, v_rest, p_pedido_id, 'fiado', v_monto, v_cliente);
      insert into public.movimientos_fiado (restaurante_id, cliente_id, tipo, monto, pedido_id, pago_id)
      values (v_rest, v_cliente, 'cargo', v_monto, p_pedido_id, v_pago_id);
      v_fiado := v_fiado + v_monto;
    end if;
  end loop;

  update public.pedidos
     set propina = p_propina, cobrado_at = now()
   where id = p_pedido_id and restaurante_id = v_rest;

  return jsonb_build_object(
    'pedido_id', p_pedido_id, 'numero', v_ped.numero, 'total', v_ped.total, 'propina', p_propina,
    'cobrado', v_debido, 'vuelto', v_vuelto, 'fiado', v_fiado
  );
end $$;

-- ---------------------------------------------------------------------
-- Anulaciones (siempre con motivo; nada se borra)
-- ---------------------------------------------------------------------
create or replace function public.anular_pedido(p_pedido_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_restaurante();
  v_motivo text := public.fn_motivo(p_motivo);
  v_ped public.pedidos%rowtype;
begin
  select * into v_ped from public.pedidos where id = p_pedido_id and restaurante_id = v_rest for update;
  if not found or v_ped.anulado then
    raise exception 'El pedido no existe o ya está anulado.' using errcode = 'P0002';
  end if;

  update public.pedidos
     set anulado = true, anulado_motivo = v_motivo, anulado_por = auth.uid(), anulado_at = now()
   where id = p_pedido_id and restaurante_id = v_rest;

  -- Lo cobrado y lo fiado de ese pedido se anula con él.
  update public.movimientos_fiado
     set anulado = true, anulado_motivo = 'Pedido anulado: ' || v_motivo, anulado_por = auth.uid(), anulado_at = now()
   where restaurante_id = v_rest and pedido_id = p_pedido_id and not anulado;
  update public.pagos_pedido
     set anulado = true, anulado_motivo = 'Pedido anulado: ' || v_motivo, anulado_por = auth.uid(), anulado_at = now()
   where restaurante_id = v_rest and pedido_id = p_pedido_id and not anulado;

  return jsonb_build_object('id', p_pedido_id, 'numero', v_ped.numero);
end $$;

-- Deshace un cobro (se equivocaron de medio o de monto): anula los pagos y el pedido queda por cobrar de nuevo.
create or replace function public.anular_cobro(p_pedido_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_restaurante();
  v_motivo text := public.fn_motivo(p_motivo);
  v_ped public.pedidos%rowtype;
begin
  select * into v_ped from public.pedidos where id = p_pedido_id and restaurante_id = v_rest for update;
  if not found or v_ped.anulado then
    raise exception 'El pedido no existe o está anulado.' using errcode = 'P0002';
  end if;
  if v_ped.cobrado_at is null then
    raise exception 'Este pedido no está cobrado.';
  end if;

  update public.movimientos_fiado
     set anulado = true, anulado_motivo = 'Cobro anulado: ' || v_motivo, anulado_por = auth.uid(), anulado_at = now()
   where restaurante_id = v_rest and pedido_id = p_pedido_id and not anulado;
  update public.pagos_pedido
     set anulado = true, anulado_motivo = 'Cobro anulado: ' || v_motivo, anulado_por = auth.uid(), anulado_at = now()
   where restaurante_id = v_rest and pedido_id = p_pedido_id and not anulado;
  update public.pedidos
     set cobrado_at = null, propina = 0
   where id = p_pedido_id and restaurante_id = v_rest;

  return jsonb_build_object('id', p_pedido_id, 'numero', v_ped.numero);
end $$;

create or replace function public.anular_item_pedido(p_item_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_restaurante();
  v_motivo text := public.fn_motivo(p_motivo);
  v_item public.pedido_items%rowtype;
  v_ped public.pedidos%rowtype;
begin
  select * into v_item from public.pedido_items where id = p_item_id and restaurante_id = v_rest for update;
  if not found or v_item.anulado then
    raise exception 'El plato no existe o ya está anulado.' using errcode = 'P0002';
  end if;

  select * into v_ped from public.pedidos where id = v_item.pedido_id and restaurante_id = v_rest for update;
  if v_ped.anulado or v_ped.cobrado_at is not null then
    raise exception 'El pedido ya está cobrado o anulado: anula el cobro primero.';
  end if;

  update public.pedido_items
     set anulado = true, anulado_motivo = v_motivo, anulado_por = auth.uid(), anulado_at = now()
   where id = p_item_id and restaurante_id = v_rest;

  update public.pedidos
     set total = (select coalesce(sum(subtotal), 0) from public.pedido_items where pedido_id = v_ped.id and not anulado)
   where id = v_ped.id and restaurante_id = v_rest;

  return jsonb_build_object('id', p_item_id, 'pedido_id', v_ped.id);
end $$;

-- ---------------------------------------------------------------------
-- 6. Fiado
-- ---------------------------------------------------------------------
create or replace function public.crear_cliente(p_nombre text, p_telefono text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_restaurante();
  v_nombre text := left(btrim(coalesce(p_nombre, '')), 60);
  v_tel text := null;
  v_id uuid := gen_random_uuid();
begin
  if length(v_nombre) = 0 then
    raise exception 'Escribe el nombre del cliente.';
  end if;
  if length(btrim(coalesce(p_telefono, ''))) > 0 then
    v_tel := public.fn_normalizar_telefono(p_telefono);
    if v_tel is null then
      raise exception 'El teléfono no es válido. Escríbelo con 10 dígitos, por ejemplo 300 123 4567.';
    end if;
  end if;

  insert into public.clientes (id, restaurante_id, nombre, telefono) values (v_id, v_rest, v_nombre, v_tel);
  return jsonb_build_object('id', v_id, 'nombre', v_nombre, 'telefono', v_tel);
end $$;

create or replace function public.registrar_abono(
  p_cliente_id uuid,
  p_monto integer,
  p_medio text,
  p_referencia text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_restaurante();
  v_saldo int;
  v_id uuid := gen_random_uuid();
begin
  if p_medio is null or p_medio not in ('efectivo', 'transferencia') then
    raise exception 'Elige si pagó en efectivo o por transferencia.';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El abono debe ser mayor que cero.';
  end if;

  -- Bloquea al cliente mientras se valida el saldo (dos abonos a la vez no pueden pasarse de la deuda).
  perform 1 from public.clientes where id = p_cliente_id and restaurante_id = v_rest for update;
  if not found then
    raise exception 'El cliente no existe.' using errcode = 'P0002';
  end if;

  v_saldo := public.fn_saldo_cliente(v_rest, p_cliente_id);
  if p_monto > v_saldo then
    raise exception 'El abono (%) es mayor que lo que debe (%).', public.fn_pesos(p_monto), public.fn_pesos(v_saldo);
  end if;

  insert into public.movimientos_fiado (id, restaurante_id, cliente_id, tipo, monto, medio, referencia)
  values (v_id, v_rest, p_cliente_id, 'abono', p_monto, p_medio,
          case when p_medio = 'transferencia' then nullif(left(btrim(coalesce(p_referencia, '')), 60), '') end);

  return jsonb_build_object('id', v_id, 'saldo', v_saldo - p_monto);
end $$;

-- Solo se anulan abonos; un cargo se anula anulando el cobro o el pedido que lo originó.
create or replace function public.anular_abono(p_movimiento_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_restaurante();
  v_motivo text := public.fn_motivo(p_motivo);
  v_mov public.movimientos_fiado%rowtype;
begin
  select * into v_mov from public.movimientos_fiado
   where id = p_movimiento_id and restaurante_id = v_rest and tipo = 'abono' and not anulado for update;
  if not found then
    raise exception 'El abono no existe o ya está anulado.' using errcode = 'P0002';
  end if;

  update public.movimientos_fiado
     set anulado = true, anulado_motivo = v_motivo, anulado_por = auth.uid(), anulado_at = now()
   where id = p_movimiento_id and restaurante_id = v_rest;

  return jsonb_build_object('id', p_movimiento_id, 'saldo', public.fn_saldo_cliente(v_rest, v_mov.cliente_id));
end $$;

-- ---------------------------------------------------------------------
-- 7. Gastos
-- ---------------------------------------------------------------------
create or replace function public.registrar_gasto(
  p_monto integer,
  p_categoria text,
  p_nota text default null,
  p_foto_path text default null,
  p_de_caja boolean default true,
  p_fecha date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_restaurante();
  v_fecha date := coalesce(p_fecha, public.hoy_bogota());
  v_id uuid := gen_random_uuid();
  v_foto text := nullif(btrim(coalesce(p_foto_path, '')), '');
begin
  if p_monto is null or p_monto <= 0 or p_monto > 100000000 then
    raise exception 'Escribe cuánto fue el gasto.';
  end if;
  if p_categoria is null or p_categoria not in
       ('carnes', 'verduras', 'pan', 'bebidas', 'gas', 'domiciliario', 'empaques', 'servicios', 'ayudante', 'otros') then
    raise exception 'Elige la categoría del gasto.';
  end if;
  if v_fecha > public.hoy_bogota() or v_fecha < public.hoy_bogota() - 31 then
    raise exception 'La fecha del gasto no es válida.';
  end if;
  -- La foto vive en la carpeta del restaurante (Storage): no se acepta una ruta de otro.
  if v_foto is not null and (length(v_foto) > 200 or left(v_foto, 37) <> (v_rest::text || '/')) then
    raise exception 'La foto no es válida.';
  end if;

  insert into public.gastos (id, restaurante_id, fecha, monto, categoria, nota, foto_path, de_caja)
  values (v_id, v_rest, v_fecha, p_monto, p_categoria, nullif(left(btrim(coalesce(p_nota, '')), 120), ''),
          v_foto, coalesce(p_de_caja, true));

  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.anular_gasto(p_gasto_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_restaurante();
  v_motivo text := public.fn_motivo(p_motivo);
begin
  update public.gastos
     set anulado = true, anulado_motivo = v_motivo, anulado_por = auth.uid(), anulado_at = now()
   where id = p_gasto_id and restaurante_id = v_rest and not anulado;
  if not found then
    raise exception 'El gasto no existe o ya está anulado.' using errcode = 'P0002';
  end if;
  return jsonb_build_object('id', p_gasto_id);
end $$;

-- ---------------------------------------------------------------------
-- 8. Cierre del día
-- ---------------------------------------------------------------------
create or replace function public.registrar_cierre(
  p_fecha date,
  p_base_caja integer,
  p_efectivo_contado integer,
  p_notas text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_restaurante();
  v_fecha date := coalesce(p_fecha, public.hoy_bogota());
  v_base int := coalesce(p_base_caja, 0);
  v_r jsonb;
  v_id uuid := gen_random_uuid();
  v_esperado int;
begin
  if v_fecha > public.hoy_bogota() then
    raise exception 'No se puede cerrar un día que todavía no llega.';
  end if;
  if v_base < 0 then
    raise exception 'La base de la caja no es válida.';
  end if;
  if p_efectivo_contado is null or p_efectivo_contado < 0 then
    raise exception 'Escribe cuánto efectivo contaste.';
  end if;

  v_r := public.fn_resumen_dia(v_rest, v_fecha, v_base);
  v_esperado := (v_r ->> 'efectivo_esperado')::int;

  begin
    insert into public.cierres_dia
      (id, restaurante_id, fecha, ventas, propinas, gastos, ganancia, cobrado_efectivo, cobrado_transferencia,
       fiado_nuevo, abonos_efectivo, abonos_transferencia, gastos_caja, base_caja, efectivo_esperado,
       efectivo_contado, diferencia, notas)
    values
      (v_id, v_rest, v_fecha, (v_r ->> 'ventas')::int, (v_r ->> 'propinas')::int, (v_r ->> 'gastos')::int,
       (v_r ->> 'ganancia')::int, (v_r ->> 'cobrado_efectivo')::int, (v_r ->> 'cobrado_transferencia')::int,
       (v_r ->> 'fiado_nuevo')::int, (v_r ->> 'abonos_efectivo')::int, (v_r ->> 'abonos_transferencia')::int,
       (v_r ->> 'gastos_caja')::int, v_base, v_esperado, p_efectivo_contado, p_efectivo_contado - v_esperado,
       nullif(left(btrim(coalesce(p_notas, '')), 200), ''));
  exception when unique_violation then
    raise exception 'Ese día ya está cerrado. Anula el cierre para hacerlo de nuevo.';
  end;

  return jsonb_build_object('id', v_id, 'fecha', v_fecha, 'diferencia', p_efectivo_contado - v_esperado);
end $$;

create or replace function public.anular_cierre(p_cierre_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_restaurante();
  v_motivo text := public.fn_motivo(p_motivo);
begin
  update public.cierres_dia
     set anulado = true, anulado_motivo = v_motivo, anulado_por = auth.uid(), anulado_at = now()
   where id = p_cierre_id and restaurante_id = v_rest and not anulado;
  if not found then
    raise exception 'El cierre no existe o ya está anulado.' using errcode = 'P0002';
  end if;
  return jsonb_build_object('id', p_cierre_id);
end $$;

-- ---------------------------------------------------------------------
-- 9. Menú (solo el dueño crea y edita; cualquiera del equipo marca "se acabó")
-- ---------------------------------------------------------------------
create or replace function public.guardar_categoria(
  p_id uuid,
  p_nombre text,
  p_icono text default null,
  p_orden integer default null,
  p_activa boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_dueno();
  v_nombre text := left(btrim(coalesce(p_nombre, '')), 40);
  v_id uuid := coalesce(p_id, gen_random_uuid());
begin
  if length(v_nombre) = 0 then
    raise exception 'Escribe el nombre de la categoría.';
  end if;

  begin
    if p_id is null then
      insert into public.categorias_producto (id, restaurante_id, nombre, icono, orden, activa)
      values (v_id, v_rest, v_nombre, nullif(left(btrim(coalesce(p_icono, '')), 8), ''),
              coalesce(p_orden, (select coalesce(max(orden), 0) + 1 from public.categorias_producto where restaurante_id = v_rest)),
              coalesce(p_activa, true));
    else
      update public.categorias_producto
         set nombre = v_nombre, icono = nullif(left(btrim(coalesce(p_icono, '')), 8), ''),
             orden = coalesce(p_orden, orden), activa = coalesce(p_activa, activa)
       where id = p_id and restaurante_id = v_rest;
      if not found then
        raise exception 'La categoría no existe.' using errcode = 'P0002';
      end if;
    end if;
  exception when unique_violation then
    raise exception 'Ya hay una categoría con ese nombre.';
  end;

  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.guardar_producto(
  p_id uuid,
  p_categoria_id uuid,
  p_nombre text,
  p_precio integer,
  p_disponible boolean default true,
  p_activo boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_dueno();
  v_nombre text := left(btrim(coalesce(p_nombre, '')), 60);
  v_id uuid := coalesce(p_id, gen_random_uuid());
begin
  if length(v_nombre) = 0 then
    raise exception 'Escribe el nombre del plato.';
  end if;
  if p_precio is null or p_precio < 0 or p_precio > 10000000 then
    raise exception 'El precio no es válido.';
  end if;
  perform 1 from public.categorias_producto where id = p_categoria_id and restaurante_id = v_rest;
  if not found then
    raise exception 'Elige una categoría.' using errcode = 'P0002';
  end if;

  if p_id is null then
    insert into public.productos (id, restaurante_id, categoria_id, nombre, precio, disponible, activo, orden)
    values (v_id, v_rest, p_categoria_id, v_nombre, p_precio, coalesce(p_disponible, true), coalesce(p_activo, true),
            (select coalesce(max(orden), 0) + 1 from public.productos where restaurante_id = v_rest and categoria_id = p_categoria_id));
  else
    update public.productos
       set categoria_id = p_categoria_id, nombre = v_nombre, precio = p_precio,
           disponible = coalesce(p_disponible, disponible), activo = coalesce(p_activo, activo)
     where id = p_id and restaurante_id = v_rest;
    if not found then
      raise exception 'El plato no existe.' using errcode = 'P0002';
    end if;
  end if;

  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.guardar_modificador(
  p_id uuid,
  p_categoria_id uuid,
  p_nombre text,
  p_precio_extra integer,
  p_activo boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_dueno();
  v_nombre text := left(btrim(coalesce(p_nombre, '')), 40);
  v_id uuid := coalesce(p_id, gen_random_uuid());
begin
  if length(v_nombre) = 0 then
    raise exception 'Escribe el nombre de la adición.';
  end if;
  if p_precio_extra is null or p_precio_extra < 0 or p_precio_extra > 1000000 then
    raise exception 'El precio de la adición no es válido.';
  end if;
  if p_categoria_id is not null then
    perform 1 from public.categorias_producto where id = p_categoria_id and restaurante_id = v_rest;
    if not found then
      raise exception 'La categoría no existe.' using errcode = 'P0002';
    end if;
  end if;

  if p_id is null then
    insert into public.modificadores (id, restaurante_id, categoria_id, nombre, precio_extra, activo)
    values (v_id, v_rest, p_categoria_id, v_nombre, p_precio_extra, coalesce(p_activo, true));
  else
    update public.modificadores
       set categoria_id = p_categoria_id, nombre = v_nombre, precio_extra = p_precio_extra,
           activo = coalesce(p_activo, activo)
     where id = p_id and restaurante_id = v_rest;
    if not found then
      raise exception 'La adición no existe.' using errcode = 'P0002';
    end if;
  end if;

  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.cambiar_disponibilidad(p_producto_id uuid, p_disponible boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_restaurante();
begin
  update public.productos
     set disponible = coalesce(p_disponible, true)
   where id = p_producto_id and restaurante_id = v_rest and activo;
  if not found then
    raise exception 'El plato no existe.' using errcode = 'P0002';
  end if;
  return jsonb_build_object('id', p_producto_id, 'disponible', coalesce(p_disponible, true));
end $$;

-- >>>>>>>>>> 20261005000005_demo.sql >>>>>>>>>>
-- =====================================================================
-- COMANDA · 0005 · DATOS DE LA DEMO (ficticios) y reinicio
--
-- Un restaurante inventado de comida rápida / plancha: 25 platos, 6 mesas, 8 clientes con fiado y los
-- últimos 7 días de ventas, gastos y cierres. TODO ES FICTICIO (nombres y teléfonos inventados).
--
--   fn_cargar_datos_demo(restaurante)  borra lo del restaurante y vuelve a cargar los datos de ejemplo.
--                                      Es idempotente: se puede correr cuantas veces se quiera.
--   fn_provisionar_demo(usuario, ...)  crea el restaurante demo + perfil de dueño y carga los datos
--                                      (lo usan supabase/seed.sql y las pruebas).
--   reiniciar_demo()                   lo llama el botón "Reiniciar demo". Solo funciona en restaurantes
--                                      marcados es_demo y solo para el dueño.
--
-- Las cifras se generan de forma DETERMINISTA (hash de la posición, sin azar) y relativas a "hoy", así los
-- totales siempre se ven vivos y dos reinicios dan los mismos datos.
-- Es el único lugar donde se borran filas de dinero (activa app.reiniciando_demo para el trigger de 0002).
-- =====================================================================

create or replace function public.fn_demo_hash(p_texto text, p_modulo integer)
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$ select (abs(hashtext(p_texto)::bigint) % p_modulo)::integer $$;

-- Crea un pedido de ejemplo con ítems elegidos de forma determinista y, si p_cobrar, su cobro.
create or replace function public.fn_demo_pedido(
  p_rest uuid,
  p_ts timestamptz,
  p_s integer,
  p_tipo text,
  p_mesa uuid,
  p_medio text,
  p_cliente uuid,
  p_estado text,
  p_cobrar boolean,
  p_contacto text default null,
  p_direccion text default null,
  p_nota_pedido text default null,
  p_nota_item text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid := gen_random_uuid();
  v_pago uuid := gen_random_uuid();
  v_num int;
  v_mains uuid[];
  v_bebidas uuid[];
  v_items jsonb;
  v_m1 uuid;
  v_cat1 uuid;
  v_mod uuid;
  v_adic jsonb := '[]'::jsonb;
  v_nota text;
  v_total int;
  v_prop int := 0;
  v_due int;
  v_recibido int;
  v_t_cobro timestamptz;
  v_s text := p_s::text;
begin
  select array_agg(p.id order by p.orden, p.nombre) filter (where c.nombre <> 'Bebidas'),
         array_agg(p.id order by p.orden, p.nombre) filter (where c.nombre = 'Bebidas')
    into v_mains, v_bebidas
    from public.productos p
    join public.categorias_producto c on c.id = p.categoria_id
   where p.restaurante_id = p_rest and p.activo;

  v_m1 := v_mains[1 + public.fn_demo_hash(v_s || 'a', cardinality(v_mains))];
  select categoria_id into v_cat1 from public.productos where id = v_m1;

  if public.fn_demo_hash(v_s || 'q', 100) < 30 then
    select id into v_mod from public.modificadores
     where restaurante_id = p_rest and activo and categoria_id = v_cat1
     order by precio_extra, nombre limit 1;
    if v_mod is not null then
      v_adic := jsonb_build_array(v_mod);
    end if;
  end if;

  v_nota := coalesce(p_nota_item,
    case when public.fn_demo_hash(v_s || 'z', 100) < 18
      then (array['Sin cebolla', 'Sin salsa', 'Bien cocida', 'Poca sal'])[1 + public.fn_demo_hash(v_s || 'y', 4)]
    end);

  v_items := jsonb_build_array(jsonb_build_object(
    'producto_id', v_m1,
    'cantidad', case when public.fn_demo_hash(v_s || 'n', 100) < 20 then 2 else 1 end,
    'adiciones', v_adic,
    'notas', v_nota));

  if public.fn_demo_hash(v_s || 'b', 100) < 35 then
    v_items := v_items || jsonb_build_object(
      'producto_id', v_mains[1 + public.fn_demo_hash(v_s || 'c', cardinality(v_mains))], 'cantidad', 1);
  end if;
  if public.fn_demo_hash(v_s || 'd', 100) < 75 then
    v_items := v_items || jsonb_build_object(
      'producto_id', v_bebidas[1 + public.fn_demo_hash(v_s || 'e', cardinality(v_bebidas))], 'cantidad', 1);
  end if;

  update public.restaurantes set consecutivo_pedido = consecutivo_pedido + 1
   where id = p_rest returning consecutivo_pedido into v_num;

  insert into public.pedidos
    (id, restaurante_id, numero, tipo, mesa_id, cliente_id, contacto_nombre, direccion, notas, estado,
     listo_at, entregado_at, created_at)
  values
    (v_id, p_rest, v_num, p_tipo, p_mesa, p_cliente, p_contacto, p_direccion, p_nota_pedido, p_estado,
     case when p_estado in ('listo', 'entregado') then p_ts + interval '12 minutes' end,
     case when p_estado = 'entregado' then p_ts + interval '18 minutes' end,
     p_ts);

  perform public.fn_agregar_items(p_rest, v_id, v_items);
  update public.pedido_items set created_at = p_ts where pedido_id = v_id;

  if not p_cobrar then
    return v_id;
  end if;

  select total into v_total from public.pedidos where id = v_id;
  if p_tipo = 'mesa' and p_medio <> 'fiado' and public.fn_demo_hash(v_s || 'p', 100) < 40 then
    v_prop := (round(v_total * 0.10 / 500.0) * 500)::int;
  end if;
  v_due := v_total + v_prop;
  v_t_cobro := p_ts + case p_tipo when 'mesa' then interval '38 minutes'
                                  when 'llevar' then interval '14 minutes'
                                  else interval '32 minutes' end;

  if p_medio = 'efectivo' then
    v_recibido := case
      when public.fn_demo_hash(v_s || 'r', 10) < 3 then v_due
      when public.fn_demo_hash(v_s || 'r', 10) < 7 then (ceil(v_due / 10000.0) * 10000)::int
      else (ceil(v_due / 5000.0) * 5000)::int end;
    insert into public.pagos_pedido (id, restaurante_id, pedido_id, medio, monto, recibido, vuelto, created_at)
    values (v_pago, p_rest, v_id, 'efectivo', v_due, v_recibido, v_recibido - v_due, v_t_cobro);
  elsif p_medio = 'transferencia' then
    insert into public.pagos_pedido (id, restaurante_id, pedido_id, medio, monto, referencia, created_at)
    values (v_pago, p_rest, v_id, 'transferencia', v_due,
            'NEQ' || lpad(public.fn_demo_hash(v_s || 'f', 999999)::text, 6, '0'), v_t_cobro);
  else
    insert into public.pagos_pedido (id, restaurante_id, pedido_id, medio, monto, cliente_id, created_at)
    values (v_pago, p_rest, v_id, 'fiado', v_due, p_cliente, v_t_cobro);
    insert into public.movimientos_fiado (restaurante_id, cliente_id, tipo, monto, pedido_id, pago_id, created_at)
    values (p_rest, p_cliente, 'cargo', v_due, v_id, v_pago, v_t_cobro);
  end if;

  update public.pedidos
     set propina = v_prop, cobrado_at = v_t_cobro, estado = 'entregado',
         listo_at = coalesce(listo_at, p_ts + interval '12 minutes'),
         entregado_at = coalesce(entregado_at, p_ts + interval '18 minutes')
   where id = v_id;

  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Carga completa de la demo para un restaurante
-- ---------------------------------------------------------------------
create or replace function public.fn_cargar_datos_demo(p_rest uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hoy date := public.hoy_bogota();
  v_ahora timestamptz := now();
  v_cli uuid[] := array(select gen_random_uuid() from generate_series(1, 8));
  v_mesas uuid[];
  v_conteos int[] := array[17, 19, 16, 22, 25, 21];   -- pedidos por día: hace 6, 5, 4, 3, 2 y 1 días
  v_direcciones text[] := array['Cra 15 #8-22', 'Calle 20 #4-10, apto 201', 'Mz C casa 7, Los Pinos', 'Cll 9 #12-40', 'Cra 7 #19-33, local 2'];
  v_nombres text[] := array['Marleny Ríos', 'Don Jairo Cárdenas', 'Yeison Torres', 'Luisa Gómez', 'Camilo Ortega', 'Doña Nubia', 'Andrés Rojas', 'Stiven Castaño'];
  v_d int; v_k int; v_n int; v_seq int := 0; v_fiado_n int := 0;
  v_min int; v_ts timestamptz; v_r int; v_tipo text; v_mesa uuid; v_medio text; v_cliente uuid;
  v_contacto text; v_dir text;
  v_res jsonb; v_adj int[] := array[0, -2000, 0, 5000, -1000, 0];   -- diferencia de caja de hace 6..1 días
  v_dia date; v_abono int; v_cargos int; v_c int;
  v_anular uuid;
begin
  -- 1) Limpiar (es la única excepción al "no se borra": solo en la demo y solo aquí).
  perform set_config('app.reiniciando_demo', 'on', true);
  delete from public.movimientos_fiado where restaurante_id = p_rest;
  delete from public.pagos_pedido      where restaurante_id = p_rest;
  delete from public.pedido_items      where restaurante_id = p_rest;
  delete from public.pedidos           where restaurante_id = p_rest;
  delete from public.gastos            where restaurante_id = p_rest;
  delete from public.cierres_dia       where restaurante_id = p_rest;
  perform set_config('app.reiniciando_demo', 'off', true);
  delete from public.modificadores       where restaurante_id = p_rest;
  delete from public.productos           where restaurante_id = p_rest;
  delete from public.categorias_producto where restaurante_id = p_rest;
  delete from public.mesas               where restaurante_id = p_rest;
  delete from public.clientes            where restaurante_id = p_rest;
  update public.restaurantes set consecutivo_pedido = 0 where id = p_rest;

  -- 2) Menú
  insert into public.categorias_producto (restaurante_id, nombre, icono, orden) values
    -- Emojis antiguos (Unicode ≤ 6): se ven bien incluso en Androids viejos de gama baja.
    (p_rest, 'Hamburguesas', '🍔', 1), (p_rest, 'Perros', '🌭', 2), (p_rest, 'Salchipapas', '🍟', 3),
    (p_rest, 'A la plancha', '🍖', 4), (p_rest, 'Pollo', '🍗', 5), (p_rest, 'Arepas', '🌮', 6),
    (p_rest, 'Bebidas', '🍹', 7);

  insert into public.productos (restaurante_id, categoria_id, nombre, precio, orden)
  select p_rest, c.id, v.nombre, v.precio, v.orden
    from (values
      ('Hamburguesas', 'Hamburguesa sencilla', 14000, 1),
      ('Hamburguesas', 'Hamburguesa doble carne', 19000, 2),
      ('Hamburguesas', 'Hamburguesa especial', 22000, 3),
      ('Perros', 'Perro caliente', 9000, 1),
      ('Perros', 'Perro americano', 11000, 2),
      ('Perros', 'Perro especial', 13000, 3),
      ('Salchipapas', 'Salchipapa sencilla', 12000, 1),
      ('Salchipapas', 'Salchipapa especial', 18000, 2),
      ('Salchipapas', 'Salchipapa para dos', 28000, 3),
      ('A la plancha', 'Carne a la plancha', 24000, 1),
      ('A la plancha', 'Churrasco', 32000, 2),
      ('A la plancha', 'Cerdo a la plancha', 22000, 3),
      ('A la plancha', 'Pechuga a la plancha', 21000, 4),
      ('Pollo', 'Pollo asado 1/4', 16000, 1),
      ('Pollo', 'Pollo asado 1/2', 29000, 2),
      ('Pollo', 'Alitas BBQ x6', 18000, 3),
      ('Arepas', 'Arepa rellena de carne', 12000, 1),
      ('Arepas', 'Arepa rellena de pollo', 11000, 2),
      ('Arepas', 'Arepa con todo', 15000, 3),
      ('Bebidas', 'Gaseosa personal', 3500, 1),
      ('Bebidas', 'Gaseosa 1,5 L', 8000, 2),
      ('Bebidas', 'Jugo en agua', 5500, 3),
      ('Bebidas', 'Jugo en leche', 7000, 4),
      ('Bebidas', 'Limonada natural', 5000, 5),
      ('Bebidas', 'Agua en botella', 2500, 6)
    ) as v(categoria, nombre, precio, orden)
    join public.categorias_producto c on c.restaurante_id = p_rest and c.nombre = v.categoria;

  insert into public.modificadores (restaurante_id, categoria_id, nombre, precio_extra)
  select p_rest, c.id, v.nombre, v.precio
    from (values
      ('Hamburguesas', 'Queso extra', 2000), ('Hamburguesas', 'Tocineta', 3000),
      ('Hamburguesas', 'Huevo', 2000), ('Hamburguesas', 'Carne extra', 6000),
      ('Perros', 'Queso extra', 2000), ('Perros', 'Tocineta', 3000), ('Perros', 'Papitas', 1500),
      ('Salchipapas', 'Queso gratinado', 3000), ('Salchipapas', 'Huevo', 2000), ('Salchipapas', 'Papas extra', 4000),
      ('A la plancha', 'Porción de papas', 4000), ('A la plancha', 'Arroz', 3000), ('A la plancha', 'Ensalada', 2500),
      ('Pollo', 'Porción de papas', 4000), ('Pollo', 'Arroz', 3000), ('Pollo', 'Ensalada', 2500),
      ('Arepas', 'Queso extra', 2000), ('Arepas', 'Aguacate', 2500)
    ) as v(categoria, nombre, precio)
    join public.categorias_producto c on c.restaurante_id = p_rest and c.nombre = v.categoria;
  insert into public.modificadores (restaurante_id, categoria_id, nombre, precio_extra)
  values (p_rest, null, 'Salsa de la casa', 500);

  insert into public.mesas (restaurante_id, nombre, orden)
  select p_rest, 'Mesa ' || i, i from generate_series(1, 6) i;
  select array_agg(id order by orden) into v_mesas from public.mesas where restaurante_id = p_rest;

  -- 3) Clientes (nombres y teléfonos INVENTADOS)
  insert into public.clientes (id, restaurante_id, nombre, telefono)
  select v_cli[n.i], p_rest, n.nombre, '+5730000001' || lpad(n.i::text, 2, '0')
    from unnest(v_nombres) with ordinality as n(nombre, i);

  -- 4) Ventas de los 6 días anteriores (de más viejo a más nuevo, para que el consecutivo sea cronológico)
  for v_d in reverse 6..1 loop
    v_n := v_conteos[7 - v_d];
    for v_k in 1..v_n loop
      v_seq := v_seq + 1;
      v_min := 11 * 60 + ((v_k - 1) * 600 / v_n) + public.fn_demo_hash('h' || v_seq, 12);
      v_ts := ((v_hoy - v_d)::timestamp + make_interval(mins => v_min)) at time zone 'America/Bogota';
      v_r := public.fn_demo_hash('t' || v_seq, 100);
      v_tipo := case when v_r < 58 then 'mesa' when v_r < 82 then 'llevar' else 'domicilio' end;
      v_mesa := case when v_tipo = 'mesa' then v_mesas[1 + public.fn_demo_hash('m' || v_seq, 6)] end;
      v_cliente := null; v_contacto := null; v_dir := null;

      if v_seq % 9 = 0 then
        v_fiado_n := v_fiado_n + 1;
        v_medio := 'fiado';
        v_cliente := v_cli[1 + (v_fiado_n - 1) % 8];
        v_contacto := v_nombres[1 + (v_fiado_n - 1) % 8];
      else
        v_medio := case when public.fn_demo_hash('p' || v_seq, 100) < 62 then 'efectivo' else 'transferencia' end;
      end if;
      if v_tipo = 'domicilio' then
        v_dir := v_direcciones[1 + public.fn_demo_hash('d' || v_seq, 5)];
        v_contacto := coalesce(v_contacto, v_nombres[1 + public.fn_demo_hash('c' || v_seq, 8)]);
      end if;

      perform public.fn_demo_pedido(p_rest, v_ts, v_seq, v_tipo, v_mesa, v_medio, v_cliente, 'entregado', true, v_contacto, v_dir);
    end loop;
  end loop;

  -- 5) Hoy: cobrados (hacia atrás desde ahora, cada 27 min, mientras sigan siendo de hoy) ...
  for v_k in reverse 10..1 loop
    v_ts := v_ahora - make_interval(mins => 40 + (v_k - 1) * 27);
    continue when public.fecha_bogota(v_ts) <> v_hoy;
    v_seq := v_seq + 1;
    v_r := public.fn_demo_hash('t' || v_seq, 100);
    v_tipo := case when v_r < 58 then 'mesa' when v_r < 82 then 'llevar' else 'domicilio' end;
    v_mesa := case when v_tipo = 'mesa' then v_mesas[1 + public.fn_demo_hash('m' || v_seq, 6)] end;
    v_cliente := null; v_contacto := null; v_dir := null;
    if v_seq % 9 = 0 then
      v_fiado_n := v_fiado_n + 1;
      v_medio := 'fiado';
      v_cliente := v_cli[1 + (v_fiado_n - 1) % 8];
      v_contacto := v_nombres[1 + (v_fiado_n - 1) % 8];
    else
      v_medio := case when public.fn_demo_hash('p' || v_seq, 100) < 62 then 'efectivo' else 'transferencia' end;
    end if;
    if v_tipo = 'domicilio' then
      v_dir := v_direcciones[1 + public.fn_demo_hash('d' || v_seq, 5)];
      v_contacto := coalesce(v_contacto, v_nombres[1 + public.fn_demo_hash('c' || v_seq, 8)]);
    end if;
    perform public.fn_demo_pedido(p_rest, v_ts, v_seq, v_tipo, v_mesa, v_medio, v_cliente, 'entregado', true, v_contacto, v_dir);
  end loop;

  -- ... y cuatro pedidos en curso para que "Pendientes" se vea vivo (con tiempos de espera distintos).
  perform public.fn_demo_pedido(p_rest, v_ahora - interval '31 minutes', 901, 'mesa', v_mesas[5], 'efectivo', null,
                                'entregado', false, null, null, null, 'Sin picante');
  perform public.fn_demo_pedido(p_rest, v_ahora - interval '17 minutes', 902, 'llevar', null, 'efectivo', null,
                                'listo', false, 'Daniela', null, null, null);
  perform public.fn_demo_pedido(p_rest, v_ahora - interval '9 minutes', 903, 'domicilio', null, 'efectivo', null,
                                'pendiente', false, v_nombres[3], 'Cll 9 #12-40, apto 301', 'Llamar al llegar', null);
  perform public.fn_demo_pedido(p_rest, v_ahora - interval '4 minutes', 904, 'mesa', v_mesas[2], 'efectivo', null,
                                'pendiente', false, null, null, null, 'Sin cebolla');

  -- 6) Abonos de fiado (el 50 % de lo que debían hasta ese día) para que haya movimiento y saldos distintos
  for v_c in select unnest(array[1, 4, 6]) loop
    v_dia := v_hoy - (array[4, 3, 2])[array_position(array[1, 4, 6], v_c)];
    v_ts := ((v_dia)::timestamp + interval '15 hours 20 minutes') at time zone 'America/Bogota';
    select coalesce(sum(monto), 0) into v_cargos from public.movimientos_fiado
     where restaurante_id = p_rest and cliente_id = v_cli[v_c] and tipo = 'cargo' and created_at <= v_ts;
    v_abono := (floor(v_cargos * 0.5 / 1000.0) * 1000)::int;
    if v_abono > 0 then
      insert into public.movimientos_fiado (restaurante_id, cliente_id, tipo, monto, medio, referencia, created_at)
      values (p_rest, v_cli[v_c], 'abono', v_abono,
              case when v_c = 4 then 'transferencia' else 'efectivo' end,
              case when v_c = 4 then 'NEQ' || lpad(public.fn_demo_hash('ab' || v_c, 999999)::text, 6, '0') end,
              v_ts);
    end if;
  end loop;

  -- 7) Gastos de los últimos 7 días
  for v_d in reverse 6..0 loop
    v_dia := v_hoy - v_d;
    v_ts := least(v_ahora - interval '5 minutes', ((v_dia)::timestamp + interval '8 hours 30 minutes') at time zone 'America/Bogota');
    -- La carne y las bebidas se pagan por transferencia al proveedor (no salen del efectivo de la caja).
    insert into public.gastos (restaurante_id, fecha, monto, categoria, nota, de_caja, created_at)
    select p_rest, v_dia, g.monto, g.categoria, g.nota, g.de_caja, v_ts
      from (values
        ('carnes', 110000 + 8000 * public.fn_demo_hash('g1' || v_d, 5), 'Carne molida, res y chorizo', true, false),
        ('pan', 26000 + 3000 * public.fn_demo_hash('g2' || v_d, 3), 'Pan de hamburguesa y perro', true, true),
        ('verduras', 21000 + 2000 * public.fn_demo_hash('g3' || v_d, 4), 'Tomate, cebolla, lechuga', true, true),
        ('ayudante', 40000, 'Jornal del ayudante', v_d > 0, true),
        ('bebidas', 45000, 'Gaseosas y jugos', v_d in (6, 3), false),
        ('gas', 52000, 'Pipeta de gas', v_d in (5, 1), true),
        ('domiciliario', 18000, 'Domiciliario', v_d in (6, 4, 2), true),
        ('empaques', 22000, 'Cajas y servilletas', v_d = 4, true)
      ) as g(categoria, monto, nota, aplica, de_caja)
     where g.aplica;
  end loop;
  -- Un gasto anulado ayer (para ver la anulación con motivo en acción).
  insert into public.gastos (restaurante_id, fecha, monto, categoria, nota, created_at, anulado, anulado_motivo, anulado_at)
  values (p_rest, v_hoy - 1, 180000, 'domiciliario', 'Domiciliario',
          ((v_hoy - 1)::timestamp + interval '17 hours') at time zone 'America/Bogota',
          true, 'Monto mal digitado (eran $ 18.000)', ((v_hoy - 1)::timestamp + interval '17 hours 5 minutes') at time zone 'America/Bogota');

  -- 8) Un pedido anulado hace dos días (con su cobro) para ver la anulación con motivo
  select id into v_anular from public.pedidos p
   where p.restaurante_id = p_rest and p.fecha = v_hoy - 2
     and not exists (select 1 from public.pagos_pedido g where g.pedido_id = p.id and g.medio = 'fiado')
   order by p.numero offset 3 limit 1;
  if v_anular is not null then
    update public.pedidos set anulado = true, anulado_motivo = 'Cliente se fue antes de que estuviera listo',
           anulado_at = created_at + interval '25 minutes' where id = v_anular;
    update public.pagos_pedido set anulado = true, anulado_motivo = 'Pedido anulado: Cliente se fue antes de que estuviera listo',
           anulado_at = created_at where pedido_id = v_anular;
  end if;

  -- 9) Cierres de los 6 días anteriores (con pequeñas diferencias de caja)
  for v_d in reverse 6..1 loop
    v_dia := v_hoy - v_d;
    v_res := public.fn_resumen_dia(p_rest, v_dia, 100000);
    insert into public.cierres_dia
      (restaurante_id, fecha, ventas, propinas, gastos, ganancia, cobrado_efectivo, cobrado_transferencia, fiado_nuevo,
       abonos_efectivo, abonos_transferencia, gastos_caja, base_caja, efectivo_esperado, efectivo_contado, diferencia, created_at)
    values
      (p_rest, v_dia, (v_res ->> 'ventas')::int, (v_res ->> 'propinas')::int, (v_res ->> 'gastos')::int,
       (v_res ->> 'ganancia')::int, (v_res ->> 'cobrado_efectivo')::int, (v_res ->> 'cobrado_transferencia')::int,
       (v_res ->> 'fiado_nuevo')::int, (v_res ->> 'abonos_efectivo')::int, (v_res ->> 'abonos_transferencia')::int,
       (v_res ->> 'gastos_caja')::int, 100000, (v_res ->> 'efectivo_esperado')::int,
       (v_res ->> 'efectivo_esperado')::int + v_adj[7 - v_d], v_adj[7 - v_d],
       ((v_dia)::timestamp + interval '21 hours 40 minutes') at time zone 'America/Bogota');
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Crear (o reutilizar) el restaurante demo de un usuario y cargarle los datos
-- ---------------------------------------------------------------------
create or replace function public.fn_provisionar_demo(p_user uuid, p_nombre_restaurante text, p_nombre_dueno text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid;
begin
  select restaurante_id into v_rest from public.perfiles where user_id = p_user;
  if v_rest is null then
    insert into public.restaurantes (nombre, es_demo) values (p_nombre_restaurante, true) returning id into v_rest;
    insert into public.perfiles (user_id, restaurante_id, rol, nombre) values (p_user, v_rest, 'dueno', p_nombre_dueno);
  end if;
  perform public.fn_cargar_datos_demo(v_rest);
  return v_rest;
end $$;

-- ---------------------------------------------------------------------
-- Botón "Reiniciar demo"
-- ---------------------------------------------------------------------
create or replace function public.reiniciar_demo()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_dueno();
begin
  if not coalesce((select es_demo from public.restaurantes where id = v_rest), false) then
    raise exception 'Solo la demo se puede reiniciar.' using errcode = '42501';
  end if;
  perform public.fn_cargar_datos_demo(v_rest);
  return jsonb_build_object('ok', true);
end $$;

-- >>>>>>>>>> 20261005000006_permisos.sql >>>>>>>>>>
-- =====================================================================
-- COMANDA · 0006 · PERMISOS DE FUNCIONES
--
-- Supabase le da EXECUTE a anon y authenticated sobre toda función nueva. Aquí se cierra:
--   * anon (sin sesión): no ejecuta NINGUNA función.
--   * authenticated: ejecuta la API pública (todo lo que NO empiece por fn_ ni requerir_).
--   * fn_* y requerir_*: internas; solo las llaman otras funciones (security definer).
--
-- fn_aplicar_permisos() es idempotente: CORRERLA AL FINAL DE CADA MIGRACIÓN que agregue funciones.
-- (Una prueba verifica esta regla sobre la base real.)
-- =====================================================================

create or replace function public.fn_aplicar_permisos()
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as firma, p.proname as nombre
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.firma);
    if r.nombre not like 'fn\_%' and r.nombre not like 'requerir\_%' then
      execute format('grant execute on function %s to authenticated', r.firma);
    end if;
  end loop;
end $$;

select public.fn_aplicar_permisos();

-- Las funciones que se creen después no heredan EXECUTE abierto (hay que correr fn_aplicar_permisos()).
alter default privileges in schema public revoke all on functions from anon, authenticated;
alter default privileges revoke execute on functions from public;
