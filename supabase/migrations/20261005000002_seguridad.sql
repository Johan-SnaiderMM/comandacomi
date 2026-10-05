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
