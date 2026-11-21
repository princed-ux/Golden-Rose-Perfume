-- Golden Rose: owner-managed product photography.
-- Review and test in a disposable Supabase database before applying to production.
-- No existing product publication or POS values are modified.
begin;

create or replace function golden_rose_catalogue.media_owner_allowed()
returns boolean
language plpgsql stable security definer set search_path=''
as $function$
declare
  actor uuid := auth.uid();
  session_text text := auth.jwt()->>'session_id';
  session_id_claim uuid;
  allowed boolean;
begin
  if actor is null or coalesce(session_text,'') !~
     '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then return false; end if;
  session_id_claim := session_text::uuid;
  if not exists (
    select 1 from auth.sessions
    where id=session_id_claim and user_id=actor
  ) then return false; end if;
  select exists (
    select 1
    from golden_rose.staff_members s
    join auth.users u on u.id=s.user_id
    where s.user_id=actor
      and s.role in ('owner','manager')
      and s.status='active'
      and s.revoked_at is null
      and u.email_confirmed_at is not null
      and not coalesce(u.is_anonymous,false)
      and (u.banned_until is null or u.banned_until<=now())
  ) into allowed;
  if not allowed then return false; end if;
  if to_regprocedure('public.gr_employee_session_allowed(uuid,uuid)') is not null then
    execute 'select public.gr_employee_session_allowed($1,$2)'
      into allowed using actor,session_id_claim;
  end if;
  return allowed is true;
exception when others then
  return false;
end;
$function$;

revoke all on function golden_rose_catalogue.media_owner_allowed()
  from public,anon,authenticated,service_role;
grant execute on function golden_rose_catalogue.media_owner_allowed()
  to authenticated;

-- The existing generic storage policy permits users to operate on public
-- buckets. Add restrictive rules specifically for product media so customers
-- cannot upload, overwrite or delete Golden Rose product photography.
-- Policies on other buckets remain unchanged.
create policy "Golden Rose product media owner inserts"
on storage.objects as restrictive for insert to authenticated
with check (
  bucket_id <> 'golden-rose-products'
  or (
    golden_rose_catalogue.media_owner_allowed()
    and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|avif)$'
  )
);

create policy "Golden Rose product media owner updates"
on storage.objects as restrictive for update to authenticated
using (
  bucket_id <> 'golden-rose-products'
  or golden_rose_catalogue.media_owner_allowed()
)
with check (
  bucket_id <> 'golden-rose-products'
  or golden_rose_catalogue.media_owner_allowed()
);

create policy "Golden Rose product media owner deletes"
on storage.objects as restrictive for delete to authenticated
using (
  bucket_id <> 'golden-rose-products'
  or golden_rose_catalogue.media_owner_allowed()
);

create unique index if not exists product_images_storage_path_unique
  on golden_rose.product_images(storage_path);

create or replace function public.gr_manage_product_media(
  p_action text,
  p_product_id uuid,
  p_storage_path text,
  p_alt_text text default null
) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare
  image_count integer;
  image_sort integer;
  product_name text;
  result jsonb;
begin
  if not golden_rose_catalogue.media_owner_allowed() then
    raise exception 'Owner or manager access required.' using errcode='GR403';
  end if;
  if p_action not in ('attach','remove') or p_product_id is null
    or p_storage_path is null or length(p_storage_path)>255
    or p_storage_path !~* '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|avif)$'
    or left(p_storage_path,37) <> p_product_id::text || '/'
    or length(coalesce(p_alt_text,''))>180
  then
    raise exception 'Invalid product photo request.' using errcode='GR422';
  end if;

  select name into product_name from golden_rose.products
    where id=p_product_id and is_active for update;
  if not found then
    raise exception 'The product no longer exists or is inactive.' using errcode='GR404';
  end if;

  if p_action='attach' then
    if not exists (
      select 1 from storage.objects o
      where o.bucket_id='golden-rose-products'
        and o.name=p_storage_path
        and lower(coalesce(o.metadata->>'mimetype','')) in
          ('image/jpeg','image/png','image/webp','image/avif')
        and coalesce(nullif(o.metadata->>'size','')::bigint,0)
          between 1 and 4000000
    ) then
      raise exception 'Upload an approved photo before attaching it.' using errcode='GR422';
    end if;
    select count(*),coalesce(max(sort_order),-1)+1 into image_count,image_sort
    from golden_rose.product_images where product_id=p_product_id;
    if image_count>=8 then
      raise exception 'A perfume can have up to eight photos.' using errcode='GR409';
    end if;
    insert into golden_rose.product_images(
      product_id,storage_path,alt_text,sort_order
    ) values(
      p_product_id,p_storage_path,
      nullif(trim(coalesce(p_alt_text,product_name)),''),
      image_sort
    );
  else
    delete from golden_rose.product_images
      where product_id=p_product_id and storage_path=p_storage_path;
    if not found then
      raise exception 'The photo is no longer attached.' using errcode='GR404';
    end if;
  end if;

  update golden_rose.products set updated_at=clock_timestamp()
    where id=p_product_id;
  select coalesce(jsonb_agg(
    jsonb_build_object('storagePath',i.storage_path,'altText',i.alt_text)
    order by i.sort_order,i.created_at,i.id
  ),'[]'::jsonb) into result
  from golden_rose.product_images i where i.product_id=p_product_id;

  return jsonb_build_object('images',result);
exception
  when unique_violation then
    raise exception 'This photo is already attached.' using errcode='GR409';
end;
$function$;

revoke all on function public.gr_manage_product_media(text,uuid,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.gr_manage_product_media(text,uuid,text,text)
  to authenticated;
notify pgrst,'reload schema';
commit;
