begin;

create schema golden_rose_import;
revoke all on schema golden_rose_import from public, anon, authenticated, service_role;
grant usage on schema golden_rose_import to service_role;

create table golden_rose_import.jobs (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  kind text not null check (kind in ('template','variant','brand','category')),
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  entry text check (length(entry) between 1 and 512),
  mapping jsonb not null check (jsonb_typeof(mapping) = 'object'),
  currency text not null check (currency in ('', 'NGN')),
  review text not null check (review ~ '^[0-9a-f]{64}$'),
  filename text not null check (length(filename) between 1 and 160),
  extension text not null check (extension in ('csv','xlsx','json','zip')),
  expected integer not null check (expected between 1 and 25000),
  status text not null default 'uploading' check (status in ('uploading','ready','processing','cancelled','complete')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, kind, fingerprint),
  check (fingerprint = encode(sha256(convert_to(source_hash || ':' || coalesce(entry, ''), 'UTF8')), 'hex')),
  check ((extension = 'zip') = (entry is not null))
);

create table golden_rose_import.rows (
  job_id uuid not null references golden_rose_import.jobs(id),
  row_number integer not null check (row_number between 2 and 25001),
  state text not null check (state in ('pending','new','updated','invalid','skipped')),
  payload jsonb,
  message text not null default '' check (length(message) <= 300),
  target_id uuid,
  reviewed_target uuid,
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
  primary key (source,kind,id_type,source_id),
  unique (source,kind,id_type,target_id)
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
revoke all on all tables in schema golden_rose_import from public, anon, authenticated, service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('golden-rose-imports','golden-rose-imports',false,4000000,
  array['text/csv','application/json','application/zip','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);

-- Even if another Storage policy allows broad access, import sources stay server-only.
create policy "Import sources are server-only" on storage.objects
  as restrictive for all to anon, authenticated
  using (bucket_id <> 'golden-rose-imports')
  with check (bucket_id <> 'golden-rose-imports');

create function golden_rose_import.validate_fields(p_kind text, d jsonb)
returns void language plpgsql immutable security invoker set search_path = ''
as $$
declare
  allowed text[] := array['row','externalId','databaseId','name'];
  f record;
begin
  if p_kind = 'variant' then
    allowed := allowed || array['parentExternalId','parentDatabaseId','sku','barcode','sizeMl','priceMinor','costMinor','currency','imageReference'];
  elsif p_kind = 'template' then
    allowed := allowed || array['description','brandExternalId','categoryExternalId','imageReference'];
  elsif p_kind = 'brand' then
    allowed := allowed || array['description'];
  elsif p_kind is distinct from 'category' then
    raise exception 'Unsupported record type.' using errcode = '22023';
  end if;
  if jsonb_typeof(d) is distinct from 'object' or jsonb_typeof(d->'row') is distinct from 'number'
    or (d->>'row') !~ '^[0-9]{1,5}$' or (d->>'row')::int not between 2 and 25001 then
    raise exception 'Invalid staged row.' using errcode = '22023';
  end if;
  for f in select key, value from jsonb_each(d) loop
    if f.key <> all(allowed) or jsonb_typeof(f.value) <>
      (case when f.key in ('row','priceMinor','costMinor','sizeMl') then 'number' else 'string' end) then
      raise exception 'Unexpected or invalid field for this record type: %.', f.key using errcode = '22023';
    end if;
  end loop;
  if (d->>'externalId' is null and d->>'databaseId' is null)
    or exists (select 1 from jsonb_each_text(d) x where key in ('externalId','parentExternalId','brandExternalId','categoryExternalId')
      and (length(value) not between 1 and 180 or value <> btrim(value) or value ~ '[[:cntrl:]]'))
    or exists (select 1 from jsonb_each_text(d) x where key in ('databaseId','parentDatabaseId') and value !~ '^[1-9][0-9]{0,17}$')
  then raise exception 'Invalid source identifiers.' using errcode = '22023'; end if;
end;
$$;

create function golden_rose_import.validate_mapping(p_kind text, mapping jsonb)
returns void language plpgsql immutable security invoker set search_path = ''
as $$
declare
  allowed text[] := array['externalId','databaseId','name'];
begin
  if p_kind = 'variant' then
    allowed := allowed || array['parentExternalId','parentDatabaseId','sku','barcode','sizeMl','priceMinor','costMinor','currency','imageReference'];
  elsif p_kind = 'template' then
    allowed := allowed || array['description','brandExternalId','categoryExternalId','imageReference'];
  elsif p_kind = 'brand' then
    allowed := allowed || array['description'];
  end if;
  if jsonb_typeof(mapping) is distinct from 'object' or not (mapping ?| array['externalId','databaseId'])
    or (p_kind <> 'variant' and not (mapping ? 'name'))
    or (p_kind = 'variant' and (not (mapping ? 'priceMinor') or not (mapping ?| array['parentExternalId','parentDatabaseId'])))
    or exists (select 1 from jsonb_each(mapping) where key <> all(allowed) or jsonb_typeof(value) <> 'number' or value::text !~ '^[0-9]{1,2}$')
    or exists (select 1 from jsonb_each(mapping) group by value having count(*) > 1)
  then raise exception 'Invalid column mapping for the selected record type.' using errcode = '22023'; end if;
end;
$$;

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
  if ids[1] is not null and (
    exists (select 1 from golden_rose_import.source_links
      where source = p_source and kind = p_kind and target_id = ids[1]
        and ((id_type = 'external' and p_external is not null and source_id <> p_external)
          or (id_type = 'database' and p_database is not null and source_id <> p_database)))
    or (p_source = 'odoo' and p_database is not null and (
      exists (select 1 from golden_rose.products where p_kind = 'template' and id = ids[1]
        and odoo_template_id::text <> p_database)
      or exists (select 1 from golden_rose.product_variants where p_kind = 'variant' and id = ids[1]
        and odoo_variant_id::text <> p_database)))
  ) then
    raise exception 'Source identifier contradicts an existing alias for this record.' using errcode = '22023';
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

  perform golden_rose_import.validate_fields(p_kind, d);
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
    if exists (select 1 from golden_rose.product_variants where id = target and currency <> 'NGN') then
      raise exception 'Existing variant has a different currency.' using errcode = '22023';
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
      brand_id = coalesce(excluded.brand_id,products.brand_id), category_id = coalesce(excluded.category_id,products.category_id), updated_at = now()
    where (products.name, products.description, products.brand_id, products.category_id) is distinct from
      (excluded.name, coalesce(excluded.description,products.description), coalesce(excluded.brand_id,products.brand_id), coalesce(excluded.category_id,products.category_id));
  when 'variant' then
    insert into golden_rose.product_variants (id,product_id,name,sku,barcode,size_ml,price_minor,cost_minor,currency)
      values (record_id,parent,d->>'name',d->>'sku',d->>'barcode',(d->>'sizeMl')::numeric,(d->>'priceMinor')::bigint,(d->>'costMinor')::bigint,'NGN')
    on conflict (id) do update set name = coalesce(excluded.name,product_variants.name),
      sku = coalesce(excluded.sku,product_variants.sku), barcode = coalesce(excluded.barcode,product_variants.barcode),
      size_ml = coalesce(excluded.size_ml,product_variants.size_ml), price_minor = excluded.price_minor,
      cost_minor = coalesce(excluded.cost_minor,product_variants.cost_minor), updated_at = now()
      where product_variants.currency = 'NGN'
        and (product_variants.name,product_variants.sku,product_variants.barcode,product_variants.size_ml,product_variants.price_minor,product_variants.cost_minor)
          is distinct from (coalesce(excluded.name,product_variants.name),coalesce(excluded.sku,product_variants.sku),
          coalesce(excluded.barcode,product_variants.barcode),coalesce(excluded.size_ml,product_variants.size_ml),
          excluded.price_minor,coalesce(excluded.cost_minor,product_variants.cost_minor));
  when 'brand' then
    insert into golden_rose.brands (id,name,slug,description)
      values (record_id,trim(d->>'name'),'import-' || record_id::text,d->>'description')
    on conflict (id) do update set name = excluded.name, description = coalesce(excluded.description,brands.description)
    where (brands.name, brands.description) is distinct from (excluded.name, coalesce(excluded.description,brands.description));
  when 'category' then
    insert into golden_rose.categories (id,name,slug)
      values (record_id,trim(d->>'name'),'import-' || record_id::text)
    on conflict (id) do update set name = excluded.name where categories.name is distinct from excluded.name;
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
  who uuid := (p_payload->>'actor')::uuid;
  prior golden_rose_import.rows;
  row_no integer;
  row_state text;
  row_message text;
  reviewed uuid;
  model text := p_payload->>'kind';
  source_key text := p_payload->>'source';
begin
  perform 1 from golden_rose.staff_members
    where user_id = who and role = 'owner' and status = 'active' for share;
  if not found then raise exception 'Active owner access required.' using errcode = '42501'; end if;
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
          'targetId',match_id,'message',case when match_id is null then 'Ready to create.' else 'Matched by source ID.' end));
      exception when data_exception or integrity_constraint_violation then
        result := result || jsonb_build_array(jsonb_build_object('row',d->'row','status','invalid','message',left(sqlerrm,200)));
      end;
    end loop;
    return jsonb_build_object('results',result);
  elsif p_action in ('find','begin') then
    perform golden_rose_import.validate_mapping(model,p_payload->'mapping');
    if p_action = 'begin' then
      insert into golden_rose_import.jobs(source,kind,fingerprint,source_hash,entry,mapping,currency,review,filename,extension,expected,created_by)
        values (source_key,model,p_payload->>'fingerprint',p_payload->>'sourceHash',p_payload->>'entry',p_payload->'mapping',
          p_payload->>'currency',p_payload->>'review',p_payload->>'filename',p_payload->>'extension',(p_payload->>'expected')::integer,who)
        on conflict (source,kind,fingerprint) do nothing returning * into j;
      if found then
        insert into golden_rose_import.events(job_id,actor,event) values (j.id,who,'created');
      end if;
    end if;
    if j.id is null then
      select * into j from golden_rose_import.jobs
        where source = source_key and kind = model and fingerprint = p_payload->>'fingerprint';
    end if;
    if j.id is null then return '{}'::jsonb; end if;
    if (j.source_hash,j.entry,j.mapping,j.currency,j.extension,j.expected) is distinct from
      (p_payload->>'sourceHash',p_payload->>'entry',p_payload->'mapping',p_payload->>'currency',
       p_payload->>'extension',(p_payload->>'expected')::integer)
    then raise exception 'A job for this source file already exists with different import metadata.' using errcode = '22023'; end if;
    if p_action = 'begin' then
      select * into strict j from golden_rose_import.jobs where id=j.id for update;
      if j.status = 'uploading' and j.review is distinct from p_payload->>'review' then
        -- A new explicit review can replace interrupted staging before the job is sealed.
        delete from golden_rose_import.rows where job_id=j.id;
        update golden_rose_import.jobs set review=p_payload->>'review',updated_at=now() where id=j.id returning * into j;
        insert into golden_rose_import.events(job_id,actor,event) values(j.id,who,'review_replaced');
      end if;
    end if;
    return jsonb_build_object('id',j.id,'status',j.status,'objectPath',j.id::text || '/source.' || j.extension);
  end if;

  select * into strict j from golden_rose_import.jobs where id = (p_payload->>'job')::uuid for update;
  if p_action = 'stage' and j.status = 'uploading' then
    if j.review is distinct from p_payload->>'review'
      or jsonb_typeof(p_payload->'rows') is distinct from 'array' or jsonb_array_length(p_payload->'rows') not between 1 and 200
      or not exists (select 1 from storage.objects where bucket_id='golden-rose-imports' and name=j.id::text || '/source.' || j.extension)
    then raise exception 'Invalid staging batch or source review.' using errcode = '22023'; end if;

    for r in select value from jsonb_array_elements(p_payload->'rows') loop
      row_no := (r.value->>'row')::integer;
      row_state := r.value->>'status';
      row_message := coalesce(r.value->>'message','');
      d := nullif(r.value->'data','null'::jsonb);
      reviewed := (r.value->>'targetId')::uuid;
      if row_no is null or row_no not between 2 and j.expected + 1
        or coalesce(row_state,'') not in ('new','updated','invalid','skipped') or length(row_message)>300
        or ((row_state in ('new','updated')) <> (d is not null))
        or (row_state in ('new','skipped') and reviewed is not null)
        or (row_state = 'updated' and reviewed is null)
      then raise exception 'Malformed staging row.' using errcode = '22023'; end if;

      if d is not null then
        perform golden_rose_import.validate_fields(j.kind,d);
        if (d->>'row')::integer <> row_no then raise exception 'Row number does not match payload.' using errcode = '22023'; end if;
        if exists (select 1 from jsonb_object_keys(d) key where key not in ('row','currency') and not (j.mapping ? key))
          or (d ? 'currency' and not (j.mapping ? 'currency') and j.currency is distinct from d->>'currency')
        then raise exception 'Staged fields differ from the approved column mapping.' using errcode = '22023'; end if;
        match_id := golden_rose_import.inspect_row(j.source,j.kind,d);
        if match_id is distinct from reviewed then
          raise exception 'Catalogue match changed while staging row %. Validate again.', row_no using errcode = '22023';
        end if;
        row_state := 'pending';
      end if;
      select * into prior from golden_rose_import.rows where job_id=j.id and row_number=row_no;
      if found then
        if (prior.state,prior.payload,prior.message,prior.reviewed_target) is distinct from (row_state,d,row_message,reviewed) then
          raise exception 'Retry conflicts with staged row %.',row_no using errcode = '22023';
        end if;
      else
        insert into golden_rose_import.rows(job_id,row_number,state,payload,message,reviewed_target)
          values (j.id,row_no,row_state,d,row_message,reviewed);
      end if;
    end loop;
    return jsonb_build_object('ok',true);

  elsif p_action = 'ready' and j.status = 'uploading' then
    if j.review is distinct from p_payload->>'review' or (select count(*) from golden_rose_import.rows where job_id=j.id) <> j.expected
      or not exists (select 1 from storage.objects where bucket_id='golden-rose-imports' and name=j.id::text || '/source.' || j.extension) then
      raise exception 'Source upload or staging is incomplete.' using errcode = '22023';
    end if;
    -- Check duplicate keys across all staged batches before any catalogue write.
    with keys as (
      select row_number, key.kind, key.value
      from golden_rose_import.rows
      cross join lateral (values ('external ID',payload->>'externalId'), ('database ID',payload->>'databaseId'),
        ('SKU',lower(payload->>'sku')), ('barcode',payload->>'barcode'), ('matched target',reviewed_target::text)) key(kind,value)
      where job_id=j.id and state='pending' and key.value is not null
    ), duplicates as (
      select kind,value from keys group by kind,value having count(*) > 1
    ), conflicts as (
      select row_number,min(keys.kind) as reason from keys join duplicates using (kind,value) group by row_number
    )
    update golden_rose_import.rows row_data set state='invalid', message='Duplicate or contradictory ' || conflicts.reason || ' in this import.'
      from conflicts where row_data.job_id=j.id and row_data.row_number=conflicts.row_number;
    j.status := 'ready';
  elsif p_action = 'cancel' and j.status <> 'complete' then
    j.status := 'cancelled';
  elsif p_action = 'resume' and j.status = 'cancelled' then
    j.status := case when (select count(*) from golden_rose_import.rows where job_id=j.id)=j.expected
      and exists (select 1 from storage.objects where bucket_id='golden-rose-imports' and name=j.id::text || '/source.' || j.extension)
      then case when exists (select 1 from golden_rose_import.events where job_id=j.id and event='ready:ready')
        then 'ready' else 'uploading' end else 'uploading' end;
  elsif p_action = 'apply' and j.status in ('ready','processing') then
    -- Serialize catalogue import writes across sources to prevent cross-source name races.
    perform pg_advisory_xact_lock(109071, 1);
    for r in select row_number,payload,reviewed_target from golden_rose_import.rows
      where job_id=j.id and state='pending' order by row_number limit 200 loop
      begin
        match_id := golden_rose_import.inspect_row(j.source,j.kind,r.payload);
        if match_id is distinct from r.reviewed_target then
          raise exception 'Catalogue match changed after review. Validate this row again.' using errcode = '22023';
        end if;
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

revoke all on all functions in schema golden_rose_import from public, anon, authenticated, service_role;
grant execute on function golden_rose_import.manage(text,jsonb) to service_role;
revoke all on function public.gr_bulk_import(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.gr_bulk_import(text,jsonb) to service_role;

commit;
