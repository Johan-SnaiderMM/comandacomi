-- =====================================================================
-- COMANDA · 0007 · ALMACENAMIENTO: foto opcional del gasto (comprobante)
--
-- Bucket PRIVADO "gastos-fotos". Convención de rutas: <restaurante_id>/<uuid>.jpg
-- RLS por carpeta: cada usuario solo ve y sube dentro de la carpeta de SU restaurante.
-- Sin UPDATE ni DELETE: la foto es evidencia; si el gasto se anula, la foto queda.
-- Las fotos llegan comprimidas del celular (~300 KB); el límite del bucket es solo un tope de seguridad.
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gastos-fotos', 'gastos-fotos', false, 1572864, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists gastos_fotos_select on storage.objects;
create policy gastos_fotos_select on storage.objects
  for select to authenticated
  using (bucket_id = 'gastos-fotos' and (storage.foldername(name))[1] = ((select public.mi_restaurante())::text));

drop policy if exists gastos_fotos_insert on storage.objects;
create policy gastos_fotos_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'gastos-fotos' and (storage.foldername(name))[1] = ((select public.mi_restaurante())::text));

select public.fn_aplicar_permisos();
