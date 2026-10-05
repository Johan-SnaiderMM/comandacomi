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
