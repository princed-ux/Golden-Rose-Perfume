begin;

create table public.gr_customer_bag (
  user_id uuid not null references auth.users(id) on delete cascade,
  variant_id uuid not null,
  quantity smallint not null check (quantity between 1 and 20),
  added_at timestamptz not null default now(),
  primary key (user_id, variant_id)
);

create table public.gr_customer_wishlist (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null,
  saved_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

-- Keep references to discontinued selections so customers can review and remove them.
alter table public.gr_customer_bag enable row level security;
alter table public.gr_customer_wishlist enable row level security;
revoke all on public.gr_customer_bag, public.gr_customer_wishlist from public, anon, authenticated;
grant select, insert, update, delete on public.gr_customer_bag to authenticated;
grant select, insert, delete on public.gr_customer_wishlist to authenticated;

create policy "Customers manage their own bag"
on public.gr_customer_bag for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Customers manage their own wishlist"
on public.gr_customer_wishlist for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create function public.gr_merge_customer_bag(p_lines jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  customer_id uuid := auth.uid();
begin
  if customer_id is null then
    raise exception 'Sign in to merge a shopping bag' using errcode = '42501';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) > 50 then
    raise exception 'Invalid shopping bag' using errcode = '22023';
  end if;

  -- Retrying an import retains the higher quantity without duplicating the same selection.
  insert into public.gr_customer_bag as bag (user_id, variant_id, quantity)
  select customer_id, line."variantId", max(line.quantity)
  from jsonb_to_recordset(p_lines) as line("variantId" uuid, quantity smallint)
  group by line."variantId"
  order by line."variantId"
  on conflict (user_id, variant_id) do update
    set quantity = greatest(bag.quantity, excluded.quantity);
end;
$$;

revoke all on function public.gr_merge_customer_bag(jsonb) from public, anon, authenticated;
grant execute on function public.gr_merge_customer_bag(jsonb) to authenticated;

-- Only trusted dashboard operators upload customer-facing photos to this public bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('golden-rose-products', 'golden-rose-products', true, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do nothing;

-- Retain the deployed Edge Function's RPC signature and items field.
create or replace function public.gr_public_catalog(
  p_limit integer default 30, p_offset integer default 0, p_search text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with published as (
    select p.id, p.name, p.slug, p.description, p.created_at, b.name as brand, c.name as category
    from golden_rose.products p
    left join golden_rose.brands b on b.id = p.brand_id
    left join golden_rose.categories c on c.id = p.category_id
    where p.is_active and p.is_published
      and exists (select 1 from golden_rose.product_variants v where v.product_id = p.id and v.is_active)
  ), filtered as (
    select * from published
    where nullif(trim(p_search), '') is null or
      strpos(lower(concat_ws(' ', name, brand, category)), lower(left(trim(p_search), 120))) > 0
  ), page as (
    select *, false as is_arrival from filtered
    order by name, id
    limit least(greatest(coalesce(p_limit, 30), 1), 100)
    offset least(greatest(coalesce(p_offset, 0), 0), 1000000)
  ), arrivals as (
    select *, true as is_arrival from published
    where coalesce(p_offset, 0) = 0 and nullif(trim(p_search), '') is null
    order by created_at desc, id
    limit 6
  ), selected as (
    select * from page union all select * from arrivals
  ), assembled as (
    select s.name, s.id, s.created_at, s.is_arrival,
      jsonb_build_object(
        'id', s.id, 'name', s.name, 'slug', s.slug, 'brand', s.brand, 'category', s.category,
        'description', s.description, 'createdAt', s.created_at,
        'variants', coalesce((
          select jsonb_agg(jsonb_build_object('id', v.id, 'sku', v.sku, 'sizeMl', v.size_ml,
            'priceMinor', v.price_minor, 'currency', v.currency) order by v.price_minor, v.id)
          from golden_rose.product_variants v
          where v.product_id = s.id and v.is_active
        ), '[]'::jsonb),
        'images', coalesce((
          select jsonb_agg(jsonb_build_object('storagePath', i.storage_path, 'altText', i.alt_text)
            order by i.sort_order, i.created_at, i.id)
          from golden_rose.product_images i
          where i.product_id = s.id and exists (
            select 1 from storage.objects o where o.bucket_id = 'golden-rose-products' and o.name = i.storage_path
          )
        ), '[]'::jsonb)
      ) as item
    from selected s
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(item order by name, id) filter (where not is_arrival), '[]'::jsonb),
    'newArrivals', coalesce(jsonb_agg(item order by created_at desc, id) filter (where is_arrival), '[]'::jsonb),
    'categories', case when coalesce(p_offset, 0) = 0 then (
      select coalesce(jsonb_agg(category order by category), '[]'::jsonb)
      from (select distinct category from filtered where category is not null) categories
    ) else '[]'::jsonb end
  ) from assembled;
$$;

revoke all on function public.gr_public_catalog(integer, integer, text) from public, anon, authenticated;
grant execute on function public.gr_public_catalog(integer, integer, text) to service_role;

commit;
