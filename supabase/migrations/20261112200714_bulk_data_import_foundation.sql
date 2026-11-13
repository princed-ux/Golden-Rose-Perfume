begin;

create schema golden_rose_import;
revoke all on schema golden_rose_import from public, anon, authenticated;
grant usage on schema golden_rose_import to authenticated;

create table golden_rose_import.jobs (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  kind text not null check (kind in ('template','variant','brand','category')),
  fingerprint text not null unique check (fingerprint ~ '^[0-9a-f]{64}$'),
  filename text not null check (length(filename) between 1 and 160),
  extension text not null check (extension in ('csv','xlsx','json','zip')),
  expected integer not null check (expected between 1 and 25000),
  status text not null default 'uploading' check (status in ('uploading','ready','processing','cancelled','complete')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table golden_rose_import.rows (
  job_id uuid not null references golden_rose_import.jobs(id),
  row_number integer not null check (row_number between 2 and 25001),
  state text not null check (state in ('pending','new','updated','invalid','skipped')),
  payload jsonb,
  message text not null default '' check (length(message) <= 300),
  target_id uuid,
  primary key (job_id, row_number),
  check (state <> 'pending' or payload is not null)
);
create index import_pending on golden_rose_import.rows(job_id,row_number) where state = 'pending';

create table golden_rose_import.source_links (
  source text not null,
  kind text not null check (kind in ('template','variant','brand','category')),
  id_type text not null check (id_type in ('external','database')),
  source_id text not null check (length(source_id) between 1 and 180),
  target_id uuid not null,
  last_job uuid not null references golden_rose_import.jobs(id),
  primary key (source,kind,id_type,source_id)
);

create table golden_rose_import.events (
  id bigint generated always as identity primary key,
  job_id uuid not null references golden_rose_import.jobs(id),
  actor uuid references auth.users(id) on delete set null,
  event text not null,
  created_at timestamptz not null default now()
);

alter table golden_rose_import.jobs enable row level security;
alter table golden_rose_import.rows enable row level security;
alter table golden_rose_import.source_links enable row level security;
alter table golden_rose_import.events enable row level security;
revoke all on all tables in schema golden_rose_import from public, anon, authenticated;

create function golden_rose_import.is_owner()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from golden_rose.staff_members
    where user_id = (select auth.uid()) and role = 'owner' and status = 'active'
  );
$$;

create function golden_rose_import.file_access(p_name text, p_write boolean)
returns boolean language sql stable security definer set search_path = ''
as $$
  select golden_rose_import.is_owner() and exists (
    select 1 from golden_rose_import.jobs
    where id::text || '/source.' || extension = p_name and (not p_write or status = 'uploading')
  );
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('golden-rose-imports','golden-rose-imports',false,4000000,
  array['text/csv','application/json','application/zip','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);

create policy "Owners read registered import sources" on storage.objects for select to authenticated
  using (bucket_id = 'golden-rose-imports' and golden_rose_import.file_access(name, false));
create policy "Owners upload registered import sources" on storage.objects for insert to authenticated
  with check (bucket_id = 'golden-rose-imports' and golden_rose_import.file_access(name, true));

create function golden_rose_import.lookup(p_source text, p_kind text, p_external text, p_database text)
returns uuid language plpgsql stable security invoker set search_path = ''
as $$
declare ids uuid[];
begin
  select array_agg(distinct target_id) into ids from (
    select target_id from golden_rose_import.source_links
    where source = p_source and kind = p_kind
      and ((id_type = 'external' and source_id = p_external) or (id_type = 'database' and source_id = p_database))
    union all
    select id from golden_rose.products where p_source = 'odoo' and p_kind = 'template' and odoo_template_id::text = p_database
    union all
    select id from golden_rose.product_variants where p_source = 'odoo' and p_kind = 'variant' and odoo_variant_id::text = p_database
  ) candidates;
  if coalesce(cardinality(ids),0) > 1 then
    raise exception 'The external and database IDs point to different records.' using errcode = '22023';
  end if;
  return ids[1];
end;
$$;

create function golden_rose_import.inspect_row(p_source text, p_kind text, d jsonb)
returns uuid language plpgsql stable security invoker set search_path = ''
as $$
declare
  target uuid;
  parent uuid;
  ext text := d->>'externalId';
  db text := d->>'databaseId';
begin
  if p_kind not in ('template','variant','brand','category')
    or (ext is null and db is null)
    or (ext is not null and (length(trim(ext)) not between 1 and 180 or ext ~ '[[:cntrl:]]'))
    or (db is not null and db !~ '^[1-9][0-9]{0,17}$')
    or length(coalesce(d->>'description','')) > 5000
    or length(coalesce(d->>'imageReference','')) > 512
  then raise exception 'Invalid source identifiers or field lengths.' using errcode = '22023'; end if;

  target := golden_rose_import.lookup(p_source,p_kind,ext,db);
  if p_kind <> 'variant' and length(trim(coalesce(d->>'name',''))) not between 1 and 200 then
    raise exception 'Name is required and must be at most 200 characters.' using errcode = '22023';
  end if;
  if p_kind = 'variant' then
    if coalesce(d->>'currency','') <> 'NGN' or coalesce(d->>'priceMinor','') !~ '^[0-9]{1,16}$'
      or coalesce(d->>'costMinor','0') !~ '^[0-9]{1,16}$'
      or (d ? 'sizeMl' and (coalesce(d->>'sizeMl','') !~ '^[0-9]{1,8}(\.[0-9]{1,2})?$' or (d->>'sizeMl')::numeric <= 0))
      or length(coalesce(d->>'sku','')) > 100 or length(coalesce(d->>'barcode','')) > 80
      or length(coalesce(d->>'name','')) > 200
    then raise exception 'Invalid variant price, currency, size or identifier.' using errcode = '22023'; end if;
    parent := golden_rose_import.lookup(p_source,'template',d->>'parentExternalId',d->>'parentDatabaseId');
    if parent is null or not exists (select 1 from golden_rose.products where id = parent) then
      raise exception 'Parent product is unresolved. Import its template first.' using errcode = '22023';
    end if;
    if target is not null and not exists (select 1 from golden_rose.product_variants where id = target and product_id = parent) then
      raise exception 'This source variant is linked to a different or missing product.' using errcode = '22023';
    end if;
    if exists (select 1 from golden_rose.product_variants
      where id is distinct from target and (lower(sku) = lower(d->>'sku') or barcode = d->>'barcode')) then
      raise exception 'SKU or barcode already belongs to another Golden Rose variant. Reconcile its source ID first.' using errcode = '22023';
    end if;
  elsif p_kind = 'template' then
    if target is not null and not exists (select 1 from golden_rose.products where id = target) then
      raise exception 'The mapped product is missing.' using errcode = '22023';
    end if;
    if d ? 'brandExternalId' and not exists (select 1 from golden_rose.brands where id =
      golden_rose_import.lookup(p_source,'brand',d->>'brandExternalId',null)) then
      raise exception 'Brand source ID is unresolved. Import its brand first.' using errcode = '22023';
    end if;
    if d ? 'categoryExternalId' and not exists (select 1 from golden_rose.categories where id =
      golden_rose_import.lookup(p_source,'category',d->>'categoryExternalId',null)) then
      raise exception 'Category source ID is unresolved. Import its category first.' using errcode = '22023';
    end if;
  elsif p_kind = 'brand' then
    if (target is not null and not exists (select 1 from golden_rose.brands where id = target))
      or exists (select 1 from golden_rose.brands where id is distinct from target and lower(name) = lower(trim(d->>'name'))) then
      raise exception 'Brand needs reconciliation with an existing Golden Rose record.' using errcode = '22023';
    end if;
  elsif p_kind = 'category' then
    if (target is not null and not exists (select 1 from golden_rose.categories where id = target))
      or exists (select 1 from golden_rose.categories where id is distinct from target and lower(name) = lower(trim(d->>'name'))) then
      raise exception 'Category needs reconciliation with an existing Golden Rose record.' using errcode = '22023';
    end if;
  end if;
  return target;
end;
$$;

create function golden_rose_import.write_row(j golden_rose_import.jobs, d jsonb, target uuid)
returns uuid language plpgsql security invoker set search_path = ''
as $$
declare
  record_id uuid := coalesce(target,gen_random_uuid());
  key record;
  brand uuid := golden_rose_import.lookup(j.source,'brand',d->>'brandExternalId',null);
  category uuid := golden_rose_import.lookup(j.source,'category',d->>'categoryExternalId',null);
  parent uuid := golden_rose_import.lookup(j.source,'template',d->>'parentExternalId',d->>'parentDatabaseId');
begin
  case j.kind
  when 'template' then
    insert into golden_rose.products (id,name,slug,description,brand_id,category_id,is_published)
      values (record_id,trim(d->>'name'),'import-' || record_id::text,d->>'description',brand,category,false)
    on conflict (id) do update set name = excluded.name, description = coalesce(excluded.description, products.description),
      brand_id = coalesce(excluded.brand_id,products.brand_id), category_id = coalesce(excluded.category_id,products.category_id), updated_at = now();
  when 'variant' then
    insert into golden_rose.product_variants (id,product_id,name,sku,barcode,size_ml,price_minor,cost_minor,currency)
      values (record_id,parent,d->>'name',d->>'sku',d->>'barcode',(d->>'sizeMl')::numeric,(d->>'priceMinor')::bigint,(d->>'costMinor')::bigint,'NGN')
    on conflict (id) do update set name = coalesce(excluded.name,product_variants.name),
      sku = coalesce(excluded.sku,product_variants.sku), barcode = coalesce(excluded.barcode,product_variants.barcode),
      size_ml = coalesce(excluded.size_ml,product_variants.size_ml), price_minor = excluded.price_minor,
      cost_minor = coalesce(excluded.cost_minor,product_variants.cost_minor), updated_at = now()
      where product_variants.currency = 'NGN';
    if not found then raise exception 'Existing variant has a different currency.' using errcode = '22023'; end if;
  when 'brand' then
    insert into golden_rose.brands (id,name,slug,description)
      values (record_id,trim(d->>'name'),'import-' || record_id::text,d->>'description')
    on conflict (id) do update set name = excluded.name, description = coalesce(excluded.description,brands.description);
  when 'category' then
    insert into golden_rose.categories (id,name,slug)
      values (record_id,trim(d->>'name'),'import-' || record_id::text)
    on conflict (id) do update set name = excluded.name;
  end case;

  for key in select * from (values ('external',d->>'externalId'),('database',d->>'databaseId')) ids(id_type,source_id)
    where source_id is not null loop
    insert into golden_rose_import.source_links (source,kind,id_type,source_id,target_id,last_job)
    values (j.source,j.kind,key.id_type,key.source_id,record_id,j.id)
    on conflict (source,kind,id_type,source_id) do update set last_job = excluded.last_job
      where source_links.target_id = excluded.target_id;
    if not found then raise exception 'Source ID is already mapped to a different record.' using errcode = '22023'; end if;
  end loop;
  return record_id;
end;
$$;

create function golden_rose_import.snapshot(j golden_rose_import.jobs, include_issues boolean default false)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object('id',j.id,'status',j.status,'filename',j.filename,'source',j.source,'kind',j.kind,
    'expected',j.expected,'createdAt',j.created_at,'staged',count(*),
    'new',count(*) filter (where state='new'),'updated',count(*) filter (where state='updated'),
    'invalid',count(*) filter (where state='invalid'),'skipped',count(*) filter (where state='skipped'),
    'pending',count(*) filter (where state='pending'),
    'issues',case when include_issues then coalesce(jsonb_agg(
      jsonb_build_object('row',row_number,'status',state,'message',message) order by row_number
    ) filter (where state in ('invalid','skipped')), '[]'::jsonb) else '[]'::jsonb end)
  from golden_rose_import.rows where job_id=j.id;
$$;

create function golden_rose_import.manage(p_action text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  j golden_rose_import.jobs;
  r record;
  d jsonb;
  match_id uuid;
  result jsonb := '[]'::jsonb;
  who uuid := auth.uid();
  model text := p_payload->>'kind';
  source_key text := p_payload->>'source';
begin
  if not golden_rose_import.is_owner() then raise exception 'Active owner access required.' using errcode = '42501'; end if;
  if p_action = 'history' then
    select coalesce(jsonb_agg(golden_rose_import.snapshot(jobs) order by jobs.created_at desc),'[]'::jsonb)
    into result from (select * from golden_rose_import.jobs order by created_at desc limit 25) jobs;
    return jsonb_build_object('available',true,'jobs',result);
  elsif p_action = 'preflight' then
    if model not in ('template','variant','brand','category') or coalesce(source_key,'') !~ '^[a-z0-9][a-z0-9-]{1,63}$'
      or jsonb_typeof(p_payload->'rows') is distinct from 'array' or jsonb_array_length(p_payload->'rows') > 200 then
      raise exception 'Invalid preflight batch.' using errcode = '22023';
    end if;
    for d in select value from jsonb_array_elements(p_payload->'rows') loop
      begin
        match_id := golden_rose_import.inspect_row(source_key,model,d);
        result := result || jsonb_build_array(jsonb_build_object('row',d->'row','status',case when match_id is null then 'new' else 'updated' end,
          'message',case when match_id is null then 'Ready to create.' else 'Matched by source ID.' end));
      exception when data_exception or integrity_constraint_violation then
        result := result || jsonb_build_array(jsonb_build_object('row',d->'row','status','invalid','message',left(sqlerrm,200)));
      end;
    end loop;
    return jsonb_build_object('results',result);
  elsif p_action = 'begin' then
    insert into golden_rose_import.jobs(source,kind,fingerprint,filename,extension,expected,created_by)
      values (source_key,model,p_payload->>'fingerprint',p_payload->>'filename',p_payload->>'extension',(p_payload->>'expected')::integer,who)
      on conflict (fingerprint) do nothing returning * into j;
    if found then
      insert into golden_rose_import.events(job_id,actor,event) values (j.id,who,'created');
    else
      select * into strict j from golden_rose_import.jobs where fingerprint = p_payload->>'fingerprint';
    end if;
    return jsonb_build_object('id',j.id,'status',j.status,'objectPath',j.id::text || '/source.' || j.extension);
  end if;

  select * into strict j from golden_rose_import.jobs where id = (p_payload->>'job')::uuid for update;
  if p_action = 'stage' and j.status = 'uploading' then
    if jsonb_typeof(p_payload->'rows') is distinct from 'array' or jsonb_array_length(p_payload->'rows') > 200 then
      raise exception 'Invalid staging batch.' using errcode = '22023';
    end if;
    insert into golden_rose_import.rows(job_id,row_number,state,payload,message)
      select j.id, (value->>'row')::integer,
        case when value->>'status' in ('new','updated') then 'pending' else value->>'status' end,
        case when value->>'status' in ('new','updated') then value->'data' end, left(coalesce(value->>'message',''),300)
      from jsonb_array_elements(p_payload->'rows')
      where (value->>'row')::integer between 2 and j.expected + 1 and value->>'status' in ('new','updated','invalid','skipped')
      on conflict (job_id,row_number) do nothing;
    return jsonb_build_object('ok',true);
  elsif p_action = 'ready' and j.status = 'uploading' then
    if (select count(*) from golden_rose_import.rows where job_id=j.id) <> j.expected
      or not exists (select 1 from storage.objects where bucket_id='golden-rose-imports' and name=j.id::text || '/source.' || j.extension) then
      raise exception 'Source upload or staging is incomplete.' using errcode = '22023';
    end if;
    j.status := 'ready';
  elsif p_action = 'cancel' and j.status <> 'complete' then
    j.status := 'cancelled';
  elsif p_action = 'resume' and j.status = 'cancelled' then
    j.status := case when (select count(*) from golden_rose_import.rows where job_id=j.id)=j.expected
      and exists (select 1 from storage.objects where bucket_id='golden-rose-imports' and name=j.id::text || '/source.' || j.extension)
      then 'ready' else 'uploading' end;
  elsif p_action = 'apply' and j.status in ('ready','processing') then
    perform pg_advisory_xact_lock(hashtextextended(j.source,0));
    for r in select row_number,payload from golden_rose_import.rows
      where job_id=j.id and state='pending' order by row_number limit 200 loop
      begin
        match_id := golden_rose_import.inspect_row(j.source,j.kind,r.payload);
        update golden_rose_import.rows
        set target_id = golden_rose_import.write_row(j,r.payload,match_id),
          state = case when match_id is null then 'new' else 'updated' end, message = ''
        where job_id=j.id and row_number=r.row_number;
      exception when data_exception or integrity_constraint_violation then
        update golden_rose_import.rows set state='invalid',message=left(sqlerrm,200)
        where job_id=j.id and row_number=r.row_number;
      end;
    end loop;
    j.status := case when exists (select 1 from golden_rose_import.rows where job_id=j.id and state='pending')
      then 'processing' else 'complete' end;
  elsif p_action = 'job' then
    return golden_rose_import.snapshot(j,true);
  elsif p_action not in ('apply','cancel','resume','ready','stage') then
    raise exception 'Unsupported import action.' using errcode = '22023';
  else
    return golden_rose_import.snapshot(j);
  end if;

  update golden_rose_import.jobs set status=j.status,updated_at=now() where id=j.id;
  insert into golden_rose_import.events(job_id,actor,event) values (j.id,who,p_action || ':' || j.status);
  return golden_rose_import.snapshot(j);
end;
$$;

create function public.gr_bulk_import(p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path = ''
as $$ select golden_rose_import.manage(p_action,p_payload); $$;

revoke all on all functions in schema golden_rose_import from public, anon, authenticated;
grant execute on function golden_rose_import.file_access(text,boolean), golden_rose_import.manage(text,jsonb) to authenticated;
revoke all on function public.gr_bulk_import(text,jsonb) from public,anon,authenticated;
grant execute on function public.gr_bulk_import(text,jsonb) to authenticated;

commit;
