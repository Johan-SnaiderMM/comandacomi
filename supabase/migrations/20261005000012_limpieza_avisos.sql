-- =====================================================================
-- 12 · Avisos push: que los celulares de visitas anteriores no se queden para siempre
--
-- En la demo todo el mundo entra con el mismo usuario. Quien activó los avisos en una visita seguía recibiendo los
-- pedidos de las visitas siguientes (con el nombre del cliente), y el tope de 30 celulares se iba llenando hasta que
-- nadie más podía activar los suyos. Dos cambios:
--
--   1. Al llegar al tope ya no se rechaza al celular nuevo: le cede el puesto el que lleva más tiempo sin activar o
--      cambiar sus avisos. (Un restaurante de verdad nunca llega a 30; el tope solo evita que la tabla crezca sin fin.)
--   2. "Reiniciar demo" borra los avisos de los celulares del personal, salvo el del celular desde el que se reinicia
--      (quien enseña la demo no tiene que volver a activarlos en cada visita). Los de los clientes ya se iban solos con
--      sus pedidos.
--
-- Además, al salir de la sesión la app da de baja ese celular (quitar_suscripcion_push, que ya existía).
-- =====================================================================

create or replace function public.guardar_suscripcion_push(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_canales jsonb,
  p_agente text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_restaurante();
  v_canales text[];
begin
  if p_canales is null or jsonb_typeof(p_canales) <> 'array' then
    raise exception 'Elige qué avisos quieres recibir en este celular.';
  end if;
  select coalesce(array_agg(distinct c order by c), '{}') into v_canales
    from jsonb_array_elements_text(p_canales) c;
  if cardinality(v_canales) = 0 or not (v_canales <@ array['pedidos', 'cocina', 'listos']::text[]) then
    raise exception 'Elige qué avisos quieres recibir en este celular.';
  end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or length(p_endpoint) > 800 then
    raise exception 'Este celular no pudo activar los avisos. Intenta de nuevo.';
  end if;

  -- Tope de 30 celulares por restaurante. Un celular nuevo siempre entra: si no hay puesto, salen los que llevan más
  -- tiempo sin activar o cambiar sus avisos (se conservan los 29 más recientes).
  if not exists (select 1 from public.suscripciones_push where endpoint = p_endpoint) then
    delete from public.suscripciones_push
     where id in (
       select s.id
         from public.suscripciones_push s
        where s.restaurante_id = v_rest and s.pedido_id is null
        order by s.actualizada_at desc, s.created_at desc, s.id
       offset 29
     );
  end if;

  insert into public.suscripciones_push (restaurante_id, canales, endpoint, clave_p256dh, clave_auth, agente)
  values (v_rest, v_canales, p_endpoint, p_p256dh, p_auth, left(p_agente, 200))
  on conflict (endpoint) do update
     set canales = excluded.canales, clave_p256dh = excluded.clave_p256dh, clave_auth = excluded.clave_auth,
         agente = excluded.agente, actualizada_at = now(), registrado_por = auth.uid()
   where public.suscripciones_push.restaurante_id = v_rest and public.suscripciones_push.pedido_id is null;
  if not found then
    raise exception 'Este celular ya tiene avisos de otro restaurante. Desactívalos allá primero.';
  end if;

  return jsonb_build_object('canales', to_jsonb(v_canales));
end $$;

-- Reiniciar la demo ahora también recibe (opcional) el celular que se conserva con sus avisos. Los llamados anteriores,
-- con solo el nombre o sin nada, siguen funcionando.
drop function if exists public.reiniciar_demo(text);

create or replace function public.reiniciar_demo(p_nombre text default null, p_conservar_endpoint text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_dueno();
  v_nombre text := nullif(btrim(coalesce(p_nombre, '')), '');
begin
  if not coalesce((select es_demo from public.restaurantes where id = v_rest), false) then
    raise exception 'Solo la demo se puede reiniciar.' using errcode = '42501';
  end if;
  if p_nombre is not null and v_nombre is null then
    raise exception 'Escribe el nombre del restaurante.' using errcode = '22023';
  end if;
  if length(coalesce(v_nombre, '')) > 60 then
    raise exception 'El nombre es muy largo (máximo 60 caracteres).' using errcode = '22023';
  end if;

  if v_nombre is not null then
    update public.restaurantes
       set nombre = v_nombre, slug = public.fn_slug_unico(v_nombre, v_rest)
     where id = v_rest;
  end if;
  update public.restaurantes set pedidos_en_linea = true where id = v_rest;

  -- Cada visita empieza limpia: quien probó la demo antes deja de recibir los pedidos de la siguiente.
  delete from public.suscripciones_push
   where restaurante_id = v_rest and pedido_id is null
     and endpoint is distinct from p_conservar_endpoint;

  perform public.fn_cargar_datos_demo(v_rest);
  return jsonb_build_object('ok', true);
end $$;

select public.fn_aplicar_permisos();
